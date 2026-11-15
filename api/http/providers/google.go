package providers

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"

	"cookbook/api/config"
)

const googleIssuer = "https://accounts.google.com"

// Discovery is a network round trip, so the provider is resolved once and shared. A failure is
// not cached: the next login retries instead of the server staying broken until restart.
var (
	googleOidcMu sync.Mutex
	googleOidc   *oidc.Provider
)

func googleProvider(ctx context.Context) (*oidc.Provider, error) {
	googleOidcMu.Lock()
	defer googleOidcMu.Unlock()
	if googleOidc != nil {
		return googleOidc, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	p, err := oidc.NewProvider(ctx, googleIssuer)
	if err != nil {
		return nil, fmt.Errorf("google oidc discovery: %w", err)
	}
	googleOidc = p
	return p, nil
}

type google struct {
	cfg *config.GoogleProviderConfig
	env Env
}

func newGoogle(cfg *config.GoogleProviderConfig, env Env) (Provider, bool) {
	if cfg.ClientId == "" || cfg.ClientSecret == "" {
		return nil, false
	}
	return google{cfg: cfg, env: env}, true
}

func (p google) Name() string     { return "google" }
func (p google) Title() string    { return "Увійти через Google" }
func (p google) AutoSubmit() bool { return false }

func (p google) oauth(op *oidc.Provider) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     p.cfg.ClientId,
		ClientSecret: p.cfg.ClientSecret,
		Endpoint:     op.Endpoint(),
		RedirectURL:  p.env.callbackUrl("google"),
		Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
	}
}

func (p google) Begin(c *gin.Context, returnTo string) (string, error) {
	op, err := googleProvider(c)
	if err != nil {
		return "", err
	}

	st := loginState{
		State:    RandomToken(),
		Verifier: oauth2.GenerateVerifier(),
		Nonce:    RandomToken(),
		ReturnTo: returnTo,
	}
	if err := p.env.saveState(c, st); err != nil {
		return "", err
	}

	return p.oauth(op).AuthCodeURL(
		st.State,
		oauth2.S256ChallengeOption(st.Verifier),
		oidc.Nonce(st.Nonce),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	), nil
}

type googleClaims struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	Nonce         string `json:"nonce"`
}

func (p google) Complete(c *gin.Context) (Identity, string, error) {
	st, err := p.env.takeState(c)
	if err != nil {
		return Identity{}, "", err
	}
	if e := c.Query("error"); e != "" {
		// the user cancelled or Google refused; not a server fault
		return Identity{}, st.ReturnTo, fmt.Errorf("google: %s", e)
	}

	op, err := googleProvider(c)
	if err != nil {
		return Identity{}, st.ReturnTo, err
	}

	token, err := p.oauth(op).Exchange(c, c.Query("code"), oauth2.VerifierOption(st.Verifier))
	if err != nil {
		return Identity{}, st.ReturnTo, fmt.Errorf("google token exchange: %w", err)
	}

	rawIdToken, ok := token.Extra("id_token").(string)
	if !ok {
		return Identity{}, st.ReturnTo, errors.New("google: no id_token in token response")
	}

	idToken, err := op.Verifier(&oidc.Config{ClientID: p.cfg.ClientId}).Verify(c, rawIdToken)
	if err != nil {
		return Identity{}, st.ReturnTo, fmt.Errorf("google id_token: %w", err)
	}

	claims := googleClaims{}
	if err := idToken.Claims(&claims); err != nil {
		return Identity{}, st.ReturnTo, fmt.Errorf("google claims: %w", err)
	}
	if claims.Nonce != st.Nonce {
		return Identity{}, st.ReturnTo, errors.New("google: nonce mismatch")
	}
	if claims.Subject == "" || claims.Email == "" || !claims.EmailVerified {
		return Identity{}, st.ReturnTo, errors.New("google: account has no verified email")
	}

	name := claims.Name
	if name == "" {
		name = claims.Email
	}
	return Identity{
		Subject:   "google:" + claims.Subject,
		Email:     claims.Email,
		Name:      name,
		AvatarUrl: claims.Picture,
	}, st.ReturnTo, nil
}
