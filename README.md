# GridStore

South African marketplace platform (React + Vite frontend, Express API).

## Quick start

```bash
npm install
npm run dev:all
```

Frontend: `http://localhost:5173` · Ops dashboard: `http://localhost:5174` · API: `http://localhost:4000/api`

Copy `.env.example` to `.env` for local frontend overrides.

**Connect to the live API locally:**

```bash
# Terminal 1 — API
npm run dev:server

# Terminal 2 — marketplace + ops dashboard
npm run dev
npm run dev:admin
```

Or run everything together:

```bash
npm run dev:all
```

Set in `.env`:

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

If you still see the demo-mode banner, confirm http://localhost:4000/api/health returns JSON.

## Ops dashboard (separate deployment)

The platform ops/admin dashboard can run as its own static site, separate from the marketplace frontend.

| Deployment | Local URL | Render service |
|------------|-----------|----------------|
| Marketplace | `http://localhost:5173` | `gridstore-web` |
| Ops dashboard | `http://localhost:5174` | `gridstore-admin` |
| API | `http://localhost:4000/api` | `gridstore-api` |

**Local:**

```bash
npm run dev:all
```

Then open **http://localhost:5174** and sign in with `admin@gridstore.local` / `demo1234`.

**Render:**

The `render.yaml` blueprint deploys three services:

1. `gridstore-api` — Express backend
2. `gridstore-web` — public marketplace (`/admin` still works here too)
3. `gridstore-admin` — standalone ops dashboard at its own URL (e.g. `https://gridstore-admin.onrender.com`)

The admin build uses `VITE_ADMIN_BASE_PATH=""` so routes are `/`, `/users`, `/orders`, etc.

**Build only the ops dashboard:**

```bash
VITE_API_BASE_URL=https://your-api.onrender.com/api VITE_ADMIN_BASE_PATH="" npm run build:admin
```

Output is written to `dist-admin/`.

## Session timeout (frontend)

Signed-in users are logged out after a period of inactivity. A prompt appears first; if there is no response within the grace period, the session ends automatically.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_IDLE_TIMEOUT_MS` | `1200000` (20 min) | Milliseconds of inactivity before the "Still there?" prompt |
| `VITE_IDLE_PROMPT_SECONDS` | `30` | Seconds to wait after the prompt before auto-logout |

**Example (staging — shorter timeouts for testing):**

```env
VITE_IDLE_TIMEOUT_MS=300000
VITE_IDLE_PROMPT_SECONDS=15
```

**Example (production — defaults):**

```env
VITE_IDLE_TIMEOUT_MS=1200000
VITE_IDLE_PROMPT_SECONDS=30
```

On Render or other static hosts, set these as build-time environment variables on the web service (they are baked into the Vite bundle at `npm run build`).

Invalid or missing values fall back to the defaults above.
