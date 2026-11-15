package http

import (
	"context"
	"io/fs"
	"log"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"cookbook/api/config"
	"cookbook/api/http/providers"
)

type Server struct {
	db     *gorm.DB
	config *config.AppConfig
}

var _ StrictServerInterface = (*Server)(nil)

func NewServer(cfg *config.AppConfig, db *gorm.DB) *Server {
	return &Server{config: cfg, db: db}
}

func (s *Server) RegisterHandlers(router gin.IRouter, schemaFs fs.FS) error {
	validator, err := newValidatorMiddleware(schemaFs, s.Url())
	if err != nil {
		return err
	}

	RegisterHandlersWithOptions(
		router,
		NewStrictHandler(s, []StrictMiddlewareFunc{responseMiddleware}),
		GinServerOptions{
			BaseURL: s.Url(),
			// run in order: the validator's authenticator relies on what the session step found
			Middlewares: []MiddlewareFunc{s.sessionMiddleware, s.uploadLimitMiddleware, validator},
			// parameter binding failures, which the validator normally catches first
			ErrorHandler: func(c *gin.Context, err error, status int) {
				c.JSON(status, Error{Code: "bad_request", Message: err.Error()})
			},
		},
	)
	return nil
}

func (s *Server) Url() string {
	return s.config.Server.Prefix + ServerUrlApi
}

func (s *Server) Scheme(c *gin.Context) string {
	return providers.RequestScheme(c, strings.ToLower(strings.TrimSpace(s.config.Server.Scheme)))
}

func (s *Server) providerEnv(c *gin.Context) providers.Env {
	scheme := s.Scheme(c)
	return providers.Env{
		ApiUrl: s.Url(),
		Origin: scheme + "://" + c.Request.Host,
		Secure: scheme == "https",
	}
}

// RunJobs does periodic housekeeping until ctx is cancelled.
func (s *Server) RunJobs(ctx context.Context) {
	tick := time.NewTicker(time.Hour)
	defer tick.Stop()
	for {
		if err := s.deleteExpiredSessions(); err != nil {
			log.Printf("delete expired sessions: %v", err)
		}
		if err := s.deleteOrphanPhotos(); err != nil {
			log.Printf("delete orphan photos: %v", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}
