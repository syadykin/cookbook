GO = go
TAGS = fts5

ifneq (,$(wildcard ./.env))
  include .env
  export
endif

OUT = ./cookbook

all: $(OUT)

$(OUT): build

api/http/api.gen.go: oapi-codegen.yaml openapi.yaml openapi-server-overlay.yaml
	$(GO) tool oapi-codegen -config oapi-codegen.yaml openapi.yaml

go-targets := $(wildcard *.go)

go-dev:
	$(GO) tool air

go-build: api/http/api.gen.go $(go-targets) go.mod go.sum
	$(GO) build -o $(OUT) -tags $(TAGS) .

go-clean:
	rm -f $(OUT) api/http/api.gen.go
ui/node_modules: ui/package.json ui/package-lock.json
	cd ui; \
	npm install && \
	touch node_modules

# make's wildcard does not recurse (** is just *), so list the UI sources with find
ui-targets := $(shell find ui/src ui/public -type f) ui/index.html ui/vite.config.ts ui/tsconfig.app.json

ui/dist: ui/node_modules openapi.yaml $(ui-targets)
	cd ui; \
	npm run build && \
	touch dist

ui-dev: ui/node_modules openapi.yaml
	cd ui; \
	npm run dev

ui-build: ui/dist

build: ui/dist go-build

dev:
	env
	$(MAKE) -j 2 go-dev ui-dev

ui-clean:
	cd ui; \
	rm -rf node_modules dist src/lib/api/schema.ts

clean: go-clean ui-clean

# end-to-end checks against the built binary on throwaway data (needs Python+Pillow, Node, Chrome)
e2e: build
	e2e/run.sh

.PHONY: go-dev go-build ui-dev ui-build build dev all go-clean ui-clean clean e2e
