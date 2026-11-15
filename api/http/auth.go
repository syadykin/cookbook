package http

import (
	"context"
	"errors"
	"log"
	"net/url"

	"github.com/gin-gonic/gin"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"gorm.io/gorm"

	"cookbook/api/http/providers"
)

func (s *Server) AuthProviders(ctx context.Context, _ AuthProvidersRequestObject) (AuthProvidersResponseObject, error) {
	c := ctx.(*gin.Context)
	list := providers.List(&s.config.Providers, s.providerEnv(c))
	res := make(AuthProviders200JSONResponse, 0, len(list))
	for _, p := range list {
		res = append(res, AuthProvider{
			Name:       p.Name(),
			Title:      p.Title(),
			Url:        s.Url() + "/auth/" + p.Name() + "/login",
			AutoSubmit: p.AutoSubmit() && len(list) == 1,
		})
	}
	return res, nil
}

func (s *Server) AuthLogin(ctx context.Context, req AuthLoginRequestObject) (AuthLoginResponseObject, error) {
	c := ctx.(*gin.Context)
	p, ok := providers.Get(&s.config.Providers, s.providerEnv(c), string(req.Provider))
	if !ok {
		return AuthLogin404JSONResponse{ErrorJSONResponse{Code: "not_found", Message: "Provider is not enabled"}}, nil
	}

	returnTo := "/"
	if req.Params.ReturnTo != nil {
		returnTo = providers.SafeReturnTo(*req.Params.ReturnTo)
	}

	location, err := p.Begin(c, returnTo)
	if err != nil {
		return nil, err
	}
	return AuthLogin302Response{Headers: AuthLogin302ResponseHeaders{Location: location}}, nil
}

// appUrl turns an app-relative path (as the SPA router sees it) into one the browser can follow.
func (s *Server) appUrl(path string) string {
	return s.config.Server.Prefix + path
}

func (s *Server) loginFailed(returnTo string) AuthCallback302Response {
	q := url.Values{"error": {"login_failed"}}
	if returnTo != "" && returnTo != "/" {
		q.Set("return_to", returnTo)
	}
	return AuthCallback302Response{Headers: AuthCallback302ResponseHeaders{
		Location: s.appUrl("/login?" + q.Encode()),
	}}
}

func (s *Server) AuthCallback(ctx context.Context, req AuthCallbackRequestObject) (AuthCallbackResponseObject, error) {
	c := ctx.(*gin.Context)
	p, ok := providers.Get(&s.config.Providers, s.providerEnv(c), string(req.Provider))
	if !ok {
		return AuthCallback404JSONResponse{Code: "not_found", Message: "Provider is not enabled"}, nil
	}

	identity, returnTo, err := p.Complete(c)
	if err != nil {
		// expected outcomes (cancelled consent, stale state) look the same as real faults to the
		// user: back to the login page with a message; the log keeps the difference
		log.Printf("login via %s failed: %v", p.Name(), err)
		return s.loginFailed(returnTo), nil
	}

	user, err := s.upsertUser(identity)
	if err != nil {
		return nil, err
	}
	if err := s.startSession(c, user.Id); err != nil {
		return nil, err
	}

	return AuthCallback302Response{Headers: AuthCallback302ResponseHeaders{Location: s.appUrl(returnTo)}}, nil
}

// upsertUser keys users by the provider subject, not the email: the email on a Google account
// can change, the subject cannot. Profile fields are refreshed on every login.
func (s *Server) upsertUser(id providers.Identity) (User, error) {
	user := User{}
	err := s.db.Where("subject = ?", id.Subject).Take(&user).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return user, err
	}

	var avatar *string
	if id.AvatarUrl != "" {
		avatar = &id.AvatarUrl
	}
	user.Subject = id.Subject
	user.Email = openapi_types.Email(id.Email)
	user.Name = id.Name
	user.AvatarUrl = avatar

	// Save inserts when Id is zero and updates otherwise
	return user, s.db.Save(&user).Error
}

func (s *Server) AuthLogout(ctx context.Context, _ AuthLogoutRequestObject) (AuthLogoutResponseObject, error) {
	if err := s.endSession(ctx.(*gin.Context)); err != nil {
		return nil, err
	}
	return AuthLogout204Response{}, nil
}

func (s *Server) AuthMe(ctx context.Context, _ AuthMeRequestObject) (AuthMeResponseObject, error) {
	user := User{}
	err := s.db.Take(&user, s.UserId(ctx)).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// a valid session for a user that no longer exists
		return AuthMe401JSONResponse{ErrorJSONResponse{Code: "unauthorized", Message: "Потрібно увійти"}}, nil
	} else if err != nil {
		return nil, err
	}
	return AuthMe200JSONResponse(user), nil
}
