# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

«Їжак з макітрою» — a personal recipe book. Single Go binary (gin, GORM, SQLite) embedding the
built React UI and `openapi.yaml`. Repository and Go module are named `cookbook`; the product name
lives in `ui/src/components/Logo` (`APP_NAME`), `ui/index.html` and `openapi.yaml` `info`.

Structure and tooling deliberately mirror the sibling project `/home/devel/shukhlyada`; when in
doubt about a convention, look there. The product spec is `docs/handoff/README.md`; the
`design/*.dc.html` files are the visual reference (design-canvas format, not runnable code).

UI copy is Ukrainian; code, comments and commit messages are English.

## Commands

```sh
make dev        # air (Go, :8000) + vite (:3000, proxies /api)
make build      # ui/dist, then ./cookbook
make go-build   # Go only; regenerates api/http/api.gen.go when the openapi files change
make e2e        # build, then all end-to-end checks (see below)
```

From `ui/`: `npm run lint`, `npm run prettier`, `npm run schema`, `npx tsc -b`.

- `ui/dist` must exist before any Go build (`//go:embed all:ui/dist`).
- Go builds need `-tags fts5` (the Makefile's `TAGS`): search uses SQLite FTS5.
- `oapi-codegen` and `air` are go.mod tools: `go tool <name>`.
- `make e2e` (or `e2e/run.sh` after `make build`) runs every check against the built binary on
  throwaway data: API checks for recipes and photos (`e2e/api`, Python 3 + Pillow) and a
  browser walkthrough (`e2e/browser/run.mjs`, puppeteer-core driving `/usr/bin/google-chrome`,
  override with `CHROME=`) at 390px — the reference phone width. There are no unit tests. Run it
  after changes and add a check when adding behaviour.
- CI (`.github/workflows/ci.yml`) runs UI lint + `make e2e` on every push and PR and uploads
  the e2e directory (screenshots, server logs) as an artifact. `docker-publish.yml` runs only
  for published GitHub releases: it calls the CI workflow first and pushes the image to Docker
  Hub only if that passes.
- Blink fixes hover/pointer media at launch and CDP media emulation ignores them, so the
  walkthrough uses one browser per input type via `--blink-settings=primaryHoverType=…`.
- The Makefile lists UI sources with `find` (make's `wildcard` does not recurse); if a UI change
  seems not to show up in the binary, check that `ui/dist` was actually rebuilt.

## Architecture

### openapi.yaml is the source of truth

- Go: `oapi-codegen` applies `openapi-server-overlay.yaml` and emits `api/http/api.gen.go`
  (strict gin server + models). Never hand-edit it.
- TS: `openapi-typescript` emits `ui/src/lib/api/schema.ts`.
- The overlay turns generated wire types into GORM models: column tags, relations, and
  persistence-only fields hidden from JSON (`x-go-json-ignore`). kin-openapi validates requests
  against the plain `openapi.yaml`, so overlay-only fields are invisible to clients.
- A schema change usually means editing `openapi.yaml` **and** the overlay.

### Data model decisions

- `Recipe` is one type for read and write. `id`, `version`, timestamps and photo dimensions are
  `readOnly`; the validator runs with `ExcludeReadOnlyValidations` so clients can send back what
  they fetched, and handlers must ignore those fields.
- Tags: JSON array column on `recipes` (no tag tables). Counting/filtering via `json_each`.
- Ingredients/steps: has-many with hidden `position` taken from array order. PUT keeps child ids
  stable (update by id, create without id, delete missing) — running timers are keyed by step id.
- Photos belong to at most one recipe or step (hidden `recipe_id`/`step_id`/`position`,
  `ON DELETE SET NULL`). Unowned photos older than 24h are deleted by a job. Files are served via
  `GET /api/photos/{id}?w=` with an ownership check; the client builds the URL.
- Optimistic locking: integer `version`, sent as `If-Match`; mismatch → 412.
- Search: FTS5 table `recipes_fts` (unicode61 tokenizer — case-folds Cyrillic, which LIKE does
  not), kept by triggers in `api/db.go` and fully rebuilt at startup.

### Backend layout

- `main.go` — config (cleanenv: yaml + env), embeds, HTTP server, background jobs.
- `server/server.go` — gin engine, SPA fallback; rewrites `<base href>` in index.html to the
  configured prefix (the client derives its basename and API URL from it).
- `api/db.go` — SQLite DSN pragmas (FKs, WAL), AutoMigrate, FTS.
- `api/http/` — one file per resource implementing the strict interface (`auth.go`,
  `recipes.go`, `photos.go`). `RunJobs` (hourly) deletes expired sessions and orphan photos.
- Photos: `<photos.path>/<id>/{160,640,1280,2048}.jpg`, re-encoded JPEG (EXIF incl. GPS dropped,
  orientation applied, ≤2048px, never upscaled). Type is sniffed from bytes; HEIC → 415.
- `api/http/session.go` — sessions: random token in an HttpOnly cookie, sha256 in the DB, sliding
  expiry. `sessionMiddleware` resolves it once per request; the validator's authenticator only
  checks the result. Handlers get the user with `s.UserId(ctx)`.
- `api/http/providers/` — `google` (x/oauth2 with PKCE + go-oidc ID token verification, nonce)
  and `local` (fixed user from config, for development). Login state (state, PKCE verifier,
  nonce, return_to) lives in a short-lived cookie; `SafeReturnTo` blocks open redirects.
- Errors use the `Error` schema: `{code, message, fields?}`; body validation → 422 with
  per-field messages, bad parameters → 400.
- SQLite runs with one open connection; writes are serialized.

### Frontend layout

- No MUI: Base UI (`@base-ui/react`, unstyled) under our own components, styled with SCSS modules
  over `src/styles/tokens.css` (design tokens from the handoff).
- `src/components/` — base elements (Button, Avatar, Menu, Logo, icons); pages compose only these.
  Helpers live in separate files (`classes.ts`, `initials.ts`) for react-refresh.
- `src/blocks/` — composed feature pieces (AccountMenu).
- `src/pages/` — one folder per screen, lazy-loaded from `src/app/App.tsx`.
- `src/lib/api/api.ts` — the single API surface (`$operations` keyed by operationId, `unwrap` →
  `ApiError`). Add calls there, not in components.
- Hidden controls: `reveal` prop on Button/MenuTrigger → `.reveal-on-hover` (+ `.touch-visible`)
  inside a `.reveal-zone`; an open Base UI popup keeps its zone visible.
- Colours come only from `src/styles/tokens.css`; the dark scheme there follows
  `prefers-color-scheme` (no in-app switch). Never hard-code a colour in a component: add a token
  with both a light and a dark value. Pastels stay backgrounds with `--text` on them; popups use
  `--surface`, which is lighter than the page in the dark scheme.
- Base component styles and global element defaults are wrapped in `:where()` (zero
  specificity) so a `className` passed by a page always wins regardless of CSS chunk order. Keep
  it that way when adding components.
- `src/contexts/Cooking` lives above the router: step timers (keyed `recipeId:stepId`, counted
  from `endAt`), the alarm (Web Audio + vibrate, unlocked on timer start), and per-recipe
  servings / crossed-out ingredients shared by the recipe page and cook mode.
- The editor draft (`pages/Recipe/useDraft.ts`) mirrors to localStorage with the version it
  started from, so a reload restores it and a stale save still gets a 412.
- «Вставити з тексту» (new recipes only): `src/lib/parseRecipe.ts` turns pasted plain text into
  editor fields in the browser — pure function, no server part. Its reference input is
  `e2e/fixtures/plov.txt`; when changing the heuristics, extend the e2e check rather than tuning
  for one sample.
- Fields under 16px get bumped to 16px on touch screens (iOS zooms into smaller focused inputs).
- React Compiler is on; path alias `@/` → `ui/src`; prettier sorts imports.

## Conventions

Comments explain why a non-obvious choice was made; skip narration of what code plainly does.
