package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	nethttp "net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ilyakaznacheev/cleanenv"

	"cookbook/api"
	"cookbook/api/config"
	"cookbook/api/http"
	"cookbook/server"
)

//go:embed all:ui/dist
var uiFiles embed.FS

//go:embed openapi.yaml
var schemaFs embed.FS

func help() {
	w := flag.CommandLine.Output()
	fmt.Fprintf(w, "Usage of %s [options] [serve]\n\nOptions:\n", os.Args[0])
	flag.CommandLine.PrintDefaults()
}

func main() {
	var cfg config.AppConfig

	configPath := flag.String("c", "config.yaml", "Path to config file")
	flag.Usage = cleanenv.FUsage(flag.CommandLine.Output(), &cfg, nil, help)
	flag.Parse()

	if err := cleanenv.ReadConfig(*configPath, &cfg); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			log.Fatalf("config %s: %v", *configPath, err)
		}
		log.Printf("config %s not found, using defaults and environment variables", *configPath)
		if err := cleanenv.ReadEnv(&cfg); err != nil {
			log.Fatalf("config from environment: %v", err)
		}
	}

	if args := flag.Args(); len(args) > 0 && args[0] != "serve" {
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", args[0])
		help()
		os.Exit(1)
	}

	if err := serve(&cfg); err != nil {
		log.Fatal(err)
	}
}

func serve(cfg *config.AppConfig) error {
	uiFs, err := fs.Sub(uiFiles, "ui/dist")
	if err != nil {
		return err
	}

	for _, dir := range []string{filepath.Dir(cfg.Database.Path), cfg.Photos.Path} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	db, err := api.InitDb(cfg.Database.Path, gin.IsDebugging())
	if err != nil {
		return err
	}

	apiServer := http.NewServer(cfg, db)
	engine, err := server.New(cfg, apiServer, schemaFs, uiFs)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go apiServer.RunJobs(ctx)

	srv := &nethttp.Server{
		Addr:              cfg.Server.Listen,
		Handler:           engine,
		ReadHeaderTimeout: 10 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Printf("listening on %s", cfg.Server.Listen)
		errc <- srv.ListenAndServe()
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}

	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(shutdown)
}
