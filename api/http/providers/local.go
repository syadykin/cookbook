package providers

import (
	"net/url"

	"github.com/gin-gonic/gin"

	"cookbook/api/config"
)

// local logs in as the user configured in config.yaml. It exists for development and for
// single-user installs on a trusted network; it is enabled only when an email is configured.
type local struct {
	cfg *config.LocalProviderConfig
	env Env
}

func newLocal(cfg *config.LocalProviderConfig, env Env) (Provider, bool) {
	if cfg.User.Email == "" {
		return nil, false
	}
	return local{cfg: cfg, env: env}, true
}

func (p local) Name() string     { return "local" }
func (p local) Title() string    { return "Увійти як " + p.cfg.User.Email }
func (p local) AutoSubmit() bool { return p.cfg.AutoSubmit }

// Begin still round-trips through the callback with a state cookie, so the local and Google
// flows share one code path in the handlers.
func (p local) Begin(c *gin.Context, returnTo string) (string, error) {
	st := loginState{State: RandomToken(), ReturnTo: returnTo}
	if err := p.env.saveState(c, st); err != nil {
		return "", err
	}
	return p.env.ApiUrl + "/auth/local/callback?" + url.Values{"state": {st.State}}.Encode(), nil
}

func (p local) Complete(c *gin.Context) (Identity, string, error) {
	st, err := p.env.takeState(c)
	if err != nil {
		return Identity{}, "", err
	}
	u := p.cfg.User
	name := u.Name
	if name == "" {
		name = u.Email
	}
	return Identity{
		Subject:   "local:" + u.Email,
		Email:     u.Email,
		Name:      name,
		AvatarUrl: u.AvatarUrl,
	}, st.ReturnTo, nil
}
