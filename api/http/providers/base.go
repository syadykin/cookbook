package providers

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"

	"cookbook/api/config"
)

// Identity is what a provider vouches for after a successful login.
type Identity struct {
	// Subject is provider-qualified ("google:<sub>") so two providers can never collide on it.
	Subject   string
	Email     string
	Name      string
	AvatarUrl string
}

type Provider interface {
	Name() string
	Title() string
	AutoSubmit() bool
	// Begin returns the URL to send the browser to; it may set cookies on the response.
	Begin(c *gin.Context, returnTo string) (string, error)
	// Complete validates the callback request and returns the identity and the returnTo given
	// to Begin.
	Complete(c *gin.Context) (Identity, string, error)
}

// Env is the per-request context providers need to build absolute URLs and cookies.
type Env struct {
	// ApiUrl is the API root path including the server prefix, e.g. /recipes/api.
	ApiUrl string
	// Origin is scheme://host as the browser sees it.
	Origin string
	Secure bool
}

func (e Env) callbackUrl(provider string) string {
	return e.Origin + e.ApiUrl + "/auth/" + provider + "/callback"
}

func List(cfg *config.ProvidersConfig, env Env) []Provider {
	list := []Provider{}
	if p, ok := newGoogle(&cfg.Google, env); ok {
		list = append(list, p)
	}
	if p, ok := newLocal(&cfg.Local, env); ok {
		list = append(list, p)
	}
	return list
}

func Get(cfg *config.ProvidersConfig, env Env, name string) (Provider, bool) {
	for _, p := range List(cfg, env) {
		if p.Name() == name {
			return p, true
		}
	}
	return nil, false
}

// RequestScheme reports the scheme the browser used to reach us, which OAuth redirect URIs and
// the cookie Secure flag have to agree with. TLS is usually terminated at a proxy, so this comes
// down to forwarded headers; forced (server.scheme) wins for chains that rewrite or drop them.
func RequestScheme(c *gin.Context, forced string) string {
	if forced != "" {
		return forced
	}
	if c.Request.TLS != nil {
		return "https"
	}
	if proto := firstValue(c.GetHeader("X-Forwarded-Proto")); proto != "" {
		return proto
	}
	for _, param := range strings.Split(firstValue(c.GetHeader("Forwarded")), ";") {
		if name, value, found := strings.Cut(strings.TrimSpace(param), "="); found && name == "proto" {
			return strings.Trim(value, `"`)
		}
	}
	return "http"
}

// firstValue takes the leftmost entry of a comma separated proxy header: chained proxies append,
// and the client-facing hop is first.
func firstValue(header string) string {
	value, _, _ := strings.Cut(header, ",")
	return strings.ToLower(strings.TrimSpace(value))
}

// SafeReturnTo accepts only an app-relative path. Anything that could leave the site — an
// absolute URL, a scheme-relative "//host", or "/\host" which browsers treat the same — becomes
// "/", so the login flow can't be used as an open redirect.
func SafeReturnTo(s string) string {
	if s == "" || !strings.HasPrefix(s, "/") || strings.HasPrefix(s, "//") || strings.HasPrefix(s, "/\\") {
		return "/"
	}
	if strings.ContainsAny(s, "\r\n\t\\") {
		return "/"
	}
	u, err := url.Parse(s)
	if err != nil || u.Scheme != "" || u.Host != "" || u.User != nil {
		return "/"
	}
	return s
}

func RandomToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		// a broken OS CSPRNG would make every token guessable; refuse to continue
		panic(fmt.Sprintf("failed to read random bytes: %v", err))
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// loginState is kept in a short-lived cookie between Begin and Complete. It never needs to be
// secret from the browser that holds it, only bound to it: the state value proves the callback
// belongs to a login this browser started.
type loginState struct {
	State    string `json:"s"`
	Verifier string `json:"v,omitempty"`
	Nonce    string `json:"n,omitempty"`
	ReturnTo string `json:"r"`
}

const stateCookieName = "login_state"

var ErrStateMismatch = errors.New("login state mismatch")

func (e Env) stateCookie(value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name:     stateCookieName,
		Value:    value,
		Path:     e.ApiUrl + "/auth",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   e.Secure,
		// Lax: the callback is a top-level GET navigation from the provider's site
		SameSite: http.SameSiteLaxMode,
	}
}

func (e Env) saveState(c *gin.Context, st loginState) error {
	raw, err := json.Marshal(st)
	if err != nil {
		return err
	}
	http.SetCookie(c.Writer, e.stateCookie(base64.RawURLEncoding.EncodeToString(raw), 600))
	return nil
}

// takeState reads and clears the state cookie and checks it against the callback's state
// parameter; a state is good for exactly one callback.
func (e Env) takeState(c *gin.Context) (loginState, error) {
	st := loginState{}
	http.SetCookie(c.Writer, e.stateCookie("", -1))

	cookie, err := c.Request.Cookie(stateCookieName)
	if err != nil {
		return st, ErrStateMismatch
	}
	raw, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil {
		return st, ErrStateMismatch
	}
	if err := json.Unmarshal(raw, &st); err != nil {
		return st, ErrStateMismatch
	}

	query := c.Query("state")
	if st.State == "" || subtle.ConstantTimeCompare([]byte(st.State), []byte(query)) != 1 {
		return st, ErrStateMismatch
	}
	st.ReturnTo = SafeReturnTo(st.ReturnTo)
	return st, nil
}
