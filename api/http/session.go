package http

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"cookbook/api/http/providers"
)

const sessionCookieName = "session"

// Session rows hold only a hash of the cookie token, so a leaked database (or backup) can't be
// replayed as a login.
type Session struct {
	TokenHash string    `gorm:"primaryKey"`
	UserId    int64     `gorm:"not null;index"`
	User      *User     `gorm:"constraint:OnDelete:CASCADE"`
	ExpiresAt time.Time `gorm:"not null;index"`
	CreatedAt time.Time `gorm:"autoCreateTime"`
}

type userIdKey struct{}

const ginUserIdKey = "userId"

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *Server) sessionCookie(c *gin.Context, value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name:     sessionCookieName,
		Value:    value,
		Path:     s.Url(),
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   s.Scheme(c) == "https",
		SameSite: http.SameSiteLaxMode,
	}
}

func (s *Server) startSession(c *gin.Context, userId int64) error {
	token := providers.RandomToken()
	ttl := s.config.Session.TTL
	if err := s.db.Create(&Session{
		TokenHash: hashToken(token),
		UserId:    userId,
		ExpiresAt: time.Now().Add(ttl),
	}).Error; err != nil {
		return err
	}
	http.SetCookie(c.Writer, s.sessionCookie(c, token, int(ttl.Seconds())))
	return nil
}

func (s *Server) endSession(c *gin.Context) error {
	http.SetCookie(c.Writer, s.sessionCookie(c, "", -1))
	cookie, err := c.Request.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return nil
	}
	return s.db.Delete(&Session{}, "token_hash = ?", hashToken(cookie.Value)).Error
}

// sessionMiddleware resolves the session cookie once per request. It runs before the OpenAPI
// validator, whose authenticator only checks the outcome stored in the request context, and
// before the handlers, which read the user id from the gin context.
func (s *Server) sessionMiddleware(c *gin.Context) {
	cookie, err := c.Request.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return
	}

	sess := Session{}
	err = s.db.Where("token_hash = ? AND expires_at > ?", hashToken(cookie.Value), time.Now()).
		Take(&sess).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return
	} else if err != nil {
		log.Printf("session lookup: %v", err)
		return
	}

	// Sliding expiry, written at most about once per day of use rather than on every request.
	ttl := s.config.Session.TTL
	if time.Until(sess.ExpiresAt) < ttl-24*time.Hour {
		expires := time.Now().Add(ttl)
		if err := s.db.Model(&sess).Update("expires_at", expires).Error; err == nil {
			http.SetCookie(c.Writer, s.sessionCookie(c, cookie.Value, int(ttl.Seconds())))
		}
	}

	c.Set(ginUserIdKey, sess.UserId)
	c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), userIdKey{}, sess.UserId))
}

// UserId returns the authenticated user. Operations with the session security requirement are
// rejected by the validator before reaching a handler, so 0 here means a handler for a public
// operation asked.
func (s *Server) UserId(ctx context.Context) int64 {
	if c, ok := ctx.(*gin.Context); ok {
		return c.GetInt64(ginUserIdKey)
	}
	return 0
}

func (s *Server) deleteExpiredSessions() error {
	return s.db.Where("expires_at <= ?", time.Now()).Delete(&Session{}).Error
}
