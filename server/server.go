package server

import (
	"io"
	"io/fs"
	nethttp "net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"cookbook/api/config"
	"cookbook/api/http"
)

func New(cfg *config.AppConfig, api *http.Server, schemaFs fs.FS, uiFs fs.FS) (*gin.Engine, error) {
	prefix := cfg.Server.Prefix

	engine := gin.New()
	engine.Use(gin.Logger(), gin.Recovery())
	// TLS is terminated at a proxy; the client address is only used for logs
	engine.SetTrustedProxies(nil)

	if err := api.RegisterHandlers(engine, schemaFs); err != nil {
		return nil, err
	}

	static, err := staticHandler(uiFs, prefix)
	if err != nil {
		return nil, err
	}

	engine.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if strings.HasPrefix(path, api.Url()+"/") || path == api.Url() {
			c.JSON(nethttp.StatusNotFound, http.Error{Code: "not_found", Message: "Not found"})
			return
		}
		if prefix != "" && path != prefix && !strings.HasPrefix(path, prefix+"/") {
			c.Status(nethttp.StatusNotFound)
			return
		}
		static(c)
	})

	return engine, nil
}

// staticHandler serves the built SPA: real files as they are, anything else as index.html so the
// client router can take over. index.html has its absolute href/src rewritten to carry the
// prefix, which is how the client learns its basename (from <base href>).
func staticHandler(uiFs fs.FS, prefix string) (gin.HandlerFunc, error) {
	raw, err := fs.ReadFile(uiFs, "index.html")
	if err != nil {
		return nil, err
	}
	index := string(raw)
	index = strings.ReplaceAll(index, `href="/`, `href="`+prefix+`/`)
	index = strings.ReplaceAll(index, `src="/`, `src="`+prefix+`/`)

	files := nethttp.FS(uiFs)

	return func(c *gin.Context) {
		path := strings.TrimPrefix(c.Request.URL.Path, prefix)

		if path != "/" && path != "/index.html" {
			if f, err := files.Open(path); err == nil {
				stat, err := f.Stat()
				f.Close()
				if err == nil && !stat.IsDir() {
					if strings.HasPrefix(path, "/assets/") {
						// Vite content-hashes everything under assets/
						c.Header("Cache-Control", "public, max-age=31536000, immutable")
					}
					c.FileFromFS(path, files)
					return
				}
			}
		}

		c.Header("Cache-Control", "no-cache")
		// NoRoute has already set 404; the SPA route itself is fine
		c.Status(nethttp.StatusOK)
		c.Header("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(c.Writer, index)
	}, nil
}
