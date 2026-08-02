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
VITE_PUBLIC_WEB_URL=http://localhost:5173
VITE_PUBLIC_ADMIN_URL=http://localhost:5174
```

Both the marketplace and ops dashboard show a **platform connection** banner at the top. When all three services are linked, it turns green with quick links to the API, marketplace, and ops dashboard. If the API is unreachable, demo catalogue data is used until you click **Retry connection** (auto-retry runs every 20s).

If the banner stays disconnected, confirm http://localhost:4000/api/health returns JSON.

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

Then open **http://localhost:5174** and sign in with `admin@gridstore.local` / `DemoSeed-ChangeMe1`.

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

## Production checklist

GridStore is **ZAR-only**. Default shipping provider is the **sandbox carrier** (generates `GS-SBX-…` tracking + HTML labels). Real courier APIs are not wired yet.

Required API secrets (also listed in `server/.env.example` and `render.yaml`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (Neon). Required in production. |
| `JWT_SECRET` | Session signing (must not be the demo default). |
| `PAYMENT_WEBHOOK_SECRET` | Webhook HMAC verification. |
| `PAYMENT_PROVIDER=paystack` | Live payments (sandbox blocked unless `ALLOW_SANDBOX_PAYMENTS=true`). |
| `PAYSTACK_SECRET_KEY` | Paystack secret. |
| `RESEND_API_KEY` or `TRANSACTIONAL_EMAIL_WEBHOOK` | Required in production for transactional email. |
| `CORS_ORIGIN` / `CORS_EXTRA_ORIGIN` | Exact web + admin origins (no wildcards). |
| `PUBLIC_WEB_URL` / `PUBLIC_ADMIN_URL` | Absolute public URLs. |

Recommended:

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | Transactional email (returns, payouts, shipping). |
| `MFA_ENCRYPTION_KEY` | Encrypt MFA secrets at rest. |
| `PLATFORM_FEE_RATE` | Seller fee (default `0.12`). |
| `PAYOUT_HOLD_DAYS` | Settlement hold before auto payout (default `7`). |
| `RETURN_WINDOW_DAYS` | Buyer return window (default `14`). |
| `SHIPPING_PROVIDER` | `sandbox` (default) or `manual`. |

Deploy notes:

1. Run migrations on API boot (`migrate()` via store seed) or apply manually before traffic.
2. Point Paystack webhook to `POST /api/payments/webhooks/paystack` with the raw-body signature.
3. Sellers must complete **bank payout profile** before production payouts will transfer (missing recipients fail closed).
4. Demo logins (`*@gridstore.local` / `DemoSeed-ChangeMe1`) only exist when `ENABLE_DEMO_DATA=true` (refused in production).
5. Uploads default to local disk under `server/uploads/`; set `STORAGE_DRIVER=s3` (+ endpoint/bucket/keys) for R2/S3-compatible storage.
6. Checkout and new listings require a verified email when the `require_email_verification` admin flag is enabled (default on).

Local demo password for seeded users: **`DemoSeed-ChangeMe1`** (not `demo1234`).
