# Їжак з макітрою

A personal recipe book: mobile first, one narrow column, nothing on screen but the recipe. Viewing
and editing happen on the same page, and cook mode walks through the steps as swipeable slides with
timers. Recipes can be pasted in as plain text and parsed in the browser. The UI is in Ukrainian
and follows the browser's light or dark colour scheme.

A single Go binary (gin + GORM + SQLite) with the React UI embedded. Sign-in is through Google, or
as a fixed local user for development and trusted installs.

## Development

```sh
echo 'LOCAL_USER_EMAIL=me@example.com' >> .env   # sign in without Google
make dev        # Go on :8000 (air) + Vite on :3000 proxying /api
```

Open http://localhost:3000. The camera and keeping the screen awake need HTTPS, so testing them
from a phone needs a tunnel or a certificate.

## Build and run

```sh
make build      # ui/dist, then ./cookbook
./cookbook -c config.yaml
docker compose up --build
```

Settings live in `config.yaml`; every value can be overridden by an environment variable
(`./cookbook -h`). Google sign-in needs a "Web application" OAuth client with the redirect URI
`https://<host><prefix>/api/auth/google/callback`.

## Checks

```sh
make e2e        # needs Python 3 with Pillow, Node and Google Chrome
```

Exercises the recipe and photo API and walks through the app in a browser (mouse and touch, light
and dark) on throwaway data; screenshots stay in the directory the script prints at the end. CI
runs the same on every push and pull request. Each push to `main` that passes also pushes the
Docker image as `latest`; publishing a GitHub release (tag `vX.Y.Z`) pushes it as `X.Y.Z` and
`X.Y`, leaving `latest` alone.

## Material

`docs/handoff/` is the original design package (in Ukrainian): screen mockups
(`design/*.dc.html`), design tokens, and drafts of the API and schema.
