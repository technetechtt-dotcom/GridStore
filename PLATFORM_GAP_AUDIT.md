# GridStore Platform Gap Audit

Date: 2026-07-06

## Scope

This audit reviewed the current React/Vite codebase, route map, local state layer, mock API layer, and README backlog. It is a code-and-flow audit, not a formal screenshot accessibility audit.

## Current Platform Shape

GridStore is currently a polished frontend prototype for a South African AI marketplace. It has working navigation, catalogue browsing, product detail pages, cart and wishlist state, simple auth screens, messages, notifications, dashboards, and a mock API abstraction.

The app is not yet a production marketplace. The largest missing pieces are backend identity, real transactional flows, seller tooling, trust/safety, and operational infrastructure.

## Launch-Blocking Gaps

1. Real authentication and authorization
   - Current login/signup creates a local user in browser storage only.
   - Missing: backend users, password reset, OAuth handlers, session/JWT refresh, protected routes, role checks, account deletion, email verification.
   - Evidence: `src/context/AppContext.tsx` stores user state in `localStorage`; `src/pages/Auth.tsx` social buttons and forgot-password entry are UI-only.

2. Checkout, orders, and payments
   - Cart supports quantities and totals, but checkout does not proceed anywhere.
   - Missing: checkout route, delivery address, tax/fees, payment provider integration, order creation, order confirmation, refunds/cancellations, receipts.
   - Evidence: `src/pages/UserPages.tsx` has a terminal "Proceed to Checkout" button with no handler.

3. Backend marketplace data persistence
   - Catalogue routes call REST endpoints, but silently fall back to hardcoded local data when requests fail.
   - Missing: real product/service/rental/job/store CRUD, pagination, filters, inventory, availability, backend validation, image upload, seller ownership.
   - Evidence: `src/services/mockApi.ts` defaults to `/api` and falls back to `src/data/catalog.ts`.

4. Seller platform depth
   - Seller dashboard shows buyer/cart/wishlist/message counts from shared buyer state.
   - Missing: listing creation/editing, inventory, order fulfillment, payout status, store settings, promotions, analytics, AI listing generator, pricing tools.
   - Evidence: `src/pages/Placeholders.tsx` `SellerDashboard`; `src/components/layout/MegaMenu.tsx` links advanced seller labels back to `/seller`.

5. Buyer account and order lifecycle
   - Buyer dashboard is an activity count view only.
   - Missing: order history, saved addresses, payment methods, returns, disputes, profile settings, preferences, recommendation controls.
   - Evidence: `src/pages/Placeholders.tsx` `BuyerDashboard`.

6. Trust and safety
   - The UI advertises fraud detection, trust scoring, verified businesses, and support, but no system implements them.
   - Missing: reporting, moderation queue, seller verification, listing risk flags, escrow/dispute workflow, abuse controls, policy enforcement.
   - Evidence: README backlog lists trust/safety; footer links "Trust & Safety" to `/dashboard`.

## Major Product Gaps

1. Search and discovery are shallow
   - Current search is text filtering over a small dataset or backend `q` parameter.
   - Missing: filters, sort, category landing pages, facets, map/location radius, recommendations, saved searches, autocomplete, ranking.

2. AI assistant is mostly simulated
   - It can call `/ai/assist` if configured, but otherwise returns canned strings.
   - Missing: grounded recommendations, user budget/context capture, item comparison, cart-building actions, image upload, safety constraints, prompt telemetry.

3. Service booking, rentals, and job applications are display-only
   - Services, rentals, and jobs can be searched, but their primary actions do not complete a workflow.
   - Missing: booking requests, rental date/availability, quotes, applications, CV upload, employer tools.

4. Messaging lacks marketplace behavior
   - Messages persist locally and can send text into a thread.
   - Missing: server-backed threads, unread state per thread, attachments, offer negotiation, seller-specific conversations, moderation/reporting.

5. Storefronts are listings, not storefronts
   - Store profiles have description/rating/follower counts only.
   - Missing: dedicated store pages, follow action, store inventory, policies, reviews, contact, seller verification details.

6. Legal/compliance content is generic
   - Privacy and terms are static and likely not production-ready for a South African commerce platform.
   - Missing: POPIA-aligned privacy detail, marketplace terms, seller terms, payment terms, refund/returns policies, dispute policy.

## Engineering/Operations Gaps

1. CI/CD is absent in the repo snapshot
   - README calls out CI as backlog, but no `.github/workflows` directory is present.

2. Test coverage is minimal
   - Only `mockApi` has unit tests.
   - Missing: auth form tests, cart/wishlist tests, route integration tests, checkout E2E, message thread tests, responsive navigation tests.

3. Runtime config needs hardening
   - `.env.example` documents API base URL, timeout, and endpoint path overrides.
   - Missing: API contract validation, typed runtime schemas, per-endpoint error states, auth headers, retry/backoff policy, environment-specific deployment docs.

4. Formatting/encoding needs cleanup
   - Some rendered text contains mojibake in source output, especially bullets, apostrophes, and emoji-like symbols.
   - Missing: UTF-8 normalization and a formatting pass.

5. Accessibility needs deeper verification
   - Several controls lack visible labels or complete semantic workflows.
   - Missing: keyboard audit, focus management for mega/mobile menus, screen reader labels for icon-only/social links, contrast checks, form error association.

6. No production observability
   - Missing: analytics events, error tracking, performance monitoring, API health states, conversion funnel tracking.

## Recommended Build Order

1. Backend foundation
   - Add real auth, user roles, protected routes, API client auth headers, runtime schema validation, and persisted entities.

2. Transaction path
   - Implement checkout, payment, order creation, order detail, and order history.

3. Seller MVP
   - Build listing CRUD, seller store profile, inventory status, seller orders, and payout placeholders tied to backend data.

4. Trust layer
   - Add verification badges backed by data, report listing/user, moderation state, support/dispute flows.

5. Discovery upgrade
   - Add filters, sort, category-specific pages, pagination, saved search, and AI assistant actions that can modify cart/search.

6. Quality gates
   - Add CI, expand unit tests, add Playwright E2E for signup/login/cart/checkout/messages, and run accessibility checks.

## Verification

- `npm.cmd run lint`: passed.
- `npm.cmd run test`: passed after running outside the sandbox because Vite/esbuild hit a parent-directory access restriction.
- `npm.cmd run build`: passed after running outside the sandbox for the same Vite/esbuild access restriction.

