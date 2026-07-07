# GridMarket AI — Frontend Architecture

Premium enterprise marketplace frontend built on **React + Vite + TypeScript + Tailwind**.

## Design System

- **Tokens:** `src/index.css` (HSL variables, light/dark)
- **Typography:** Inter + Plus Jakarta Sans
- **UI primitives:** `src/components/ui/*` (Shadcn-style Radix components)
- **Patterns:** `src/components/design-system/*` (StatCard, EmptyState, ProductCard, PageHeader)

## Key Features

- Command palette (`Ctrl/Cmd + K`)
- TanStack Query provider
- Framer Motion animations
- Recharts analytics (admin)
- JWT-backed platform API integration
- Mobile bottom navigation + responsive layouts

## Routes

| Area | Paths |
|------|-------|
| Shop | `/`, `/marketplace`, `/product/:id`, `/flash-sales` |
| Services | `/services`, `/services/:id` |
| Rentals | `/rentals`, `/rentals/:id` |
| Jobs | `/jobs`, `/jobs/:id`, `/employers` |
| Account | `/dashboard`, `/seller`, `/orders`, `/wishlist` |
| Payments | `/payments/wallet`, `/payments/methods` |
| Delivery | `/delivery/tracking` |
| Admin | `/admin/*` (admin/moderator roles) |
| Trust | `/trust-safety`, `/help` |

## Run

```bash
npm run dev:all   # frontend + API
npm run dev       # frontend only
```

## Demo accounts (API live)

- `seller@gridstore.local` / `demo1234`
- `buyer@gridstore.local` / `demo1234`
