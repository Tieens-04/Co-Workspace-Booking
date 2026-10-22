# UI redesign — QA report

Scope: the "Premium Editorial Workspace" redesign described in [`ui-redesign.md`](ui-redesign.md).
Date: 2026-10-20. Environment: Windows 11, Node 24.14.1, Chrome (headless, via `playwright-core`
from a scratch folder — not a project dependency), local MySQL with seed data.

## How to preview

The redesign is integrated into the main repository (release branch `codex/ui-redesign-motion`):

```
D:\Code\Project\Co-Workspace Booking
```

```powershell
cd "D:\Code\Project\Co-Workspace Booking"
npm ci                                         # already done once
cd apps/server; npx prisma generate; cd ../..  # already done once; npm ci does not generate it
npm run dev                                    # client http://localhost:5173, API :5000
```

- Needs the local MySQL from `apps/server/.env` (copied with the folder) and seed accounts
  (`npm run db:seed` in `apps/server` if the DB is empty). Test logins: customer
  `nguyenvana@gmail.com`, admin `admin@cospace.vn` (seed password in `apps/server/prisma/seed.ts`).
- Any older sibling preview uses the same ports — run one project at a time.
- Routes: `/`, `/rooms`, `/rooms/:id`, `/login`, `/register`, `/bookings`, `/bookings/:id`,
  `/booking-confirmation`, `/admin`, `/admin/dashboard`, `/admin/bookings`, any unknown path (404).

## Automated checks (apps/client unless noted)

Release verification on 2026-10-22: client **34 files / 393 tests passed**; server
**23 files / 453 tests passed**. The table below records the original 2026-10-20 QA run.

| Command                                                        | Result                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npx eslint src --ext .ts,.tsx`                                | exit 0                                                                                         |
| `npx tsc -p tsconfig.app.json --noEmit` / `tsconfig.node.json` | exit 0 / exit 0                                                                                |
| `npx vitest run`                                               | **32 files, 385 tests passed**                                                                 |
| `npx vite build`                                               | built; main chunk 671 kB (216 kB gzip), landing chunk 133 kB (GSAP), admin chunks without GSAP |
| `apps/server: npx vitest run`                                  | 23 files, 453 tests passed (backend unchanged)                                                 |

Baseline before this work (same copy): 357/358 — `RoomDiscovery › validates client-side inputs`
was a known timing flake (300 ms debounce). It is now deterministic (fake timers, stricter
assertions) and passed 3/3 isolated runs plus every full run.

Note: running the full suite **at the same time as** `vite build` produced 11 timeouts (5 s
limit) in `AdminPage`/`RegisterPage`; both files pass alone and in every sequential full run.

### Test changes (justified)

- Route move `/` → `/rooms`: `RoomDiscovery`, `ResponsiveAndStatePolish`, `RoomDetailPage`
  (back link), `BookingConfirmationPage` / `BookingDetailPage` / `BookingHistoryPage`
  ("room list" links now `/rooms`).
- `RoomDiscovery`: list no longer shows a "Sẵn sàng" badge (badge only for MAINTENANCE).
- `RegisterPage`: one assertion used the removed legacy `.field-error` class; it now checks the
  field's error element by id.
- `HomeLanding`: featured rooms prefer bookable rooms; maintenance rooms follow.
- New: `HomeLanding` (9), `AuthLayout` (5), lightbox + mobile booking bar, filter chips,
  conflict (409) explanation in `BookingForm`, 404/403 links, time-grid auto-scroll.

## Browser QA (live API, read-only)

- **Matrix**: 13 routes × widths 360 / 390 / 768 / 1024 / 1440 × light / dark, as guest,
  customer and admin = **130 renders: 0 horizontal overflow, 0 console errors, 0 text elements
  left invisible after motion**. JSON: `docs/qa/matrix/qa-matrix.json`; screenshots at 390 and
  1440 in `docs/qa/matrix/`.
- **Reduced motion** (`prefers-reduced-motion: reduce`): landing renders fully without scrolling
  reveals (`matrix-reduced-motion-home-1440.png`).
- **Keyboard**: skip link is the first Tab stop; visible focus ring; gallery lightbox opens with
  Enter, → advances, Esc closes and focus returns to the trigger.
- **Motion evidence** (timed frames, no video): `docs/qa/motion/1-hero-*` (line reveal),
  `2-section-reveal-*` (once-only section reveal), `3-card-hover-*`.
- **First viewport**: the hero CTA "Khám phá không gian" is visible without scrolling at
  1440×900 and 390×844 (`docs/qa/screens/landing-live-*-firstview.png`).
- Per-area screenshots: `docs/qa/screens/` (landing, rooms, room-detail, auth, booking,
  states, admin). Files named `*-mock-*` used read-only fixtures in the browser; files named
  `landing-api-down-*` were taken while the API was down and show the fallback state.

## Flows

Verified (live browser or automated tests):

- Guest browses landing → explorer (filters, chips, pagination, legacy `/?…` redirect) → detail
  (gallery, lightbox, rules, sticky panel, mobile booking bar).
- Login / register screens, session-expired notice, redirects, show/hide password (tests).
- Customer vs admin access: 403 card for customer on `/admin`, admin shell and pages (view only).
- Time selection: past/booked/available states, 30-min steps, 1–8 h rules, auto-scroll to the
  first bookable slot; conflict 409 explanation and re-selection, double-submit guard, network
  errors (tests with mocked API).
- Confirmation page direct access / reload fallback (live); populated receipt (fixtures).
- History / detail: empty state (live — the test customer has no bookings), populated layouts
  and cancel dialog (fixtures + tests).

Not verified end-to-end, by design or by limit:

- **Creating a real booking, a real 409 race and payment/cancel actions** — not performed to
  avoid mutating data; backend double-booking protection is covered by the server test suite,
  not by these UI checks.
- Admin create/edit room, image upload, payment confirmation, guest booking — view-only QA;
  behaviour covered by existing component tests.
- Real phones / touch devices (only emulated widths), screen readers, Lighthouse/FPS — not
  measured.
- Video recording of motion (Playwright needs an extra ffmpeg download; frames used instead).

## Dependencies added

| Package       | Version | Why                                                                                                         |
| ------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| `gsap`        | 3.15.0  | Editorial reveals and hero image settle/drift with ScrollTrigger + `matchMedia` (landing only, lazy-loaded) |
| `@gsap/react` | 2.1.2   | `useGSAP` for Strict-Mode-safe setup and automatic cleanup                                                  |
| `lenis`       | 1.3.26  | Inertial wheel scrolling on `/` and `/rooms` (pinned; 1.3.27 was < 2 weeks old)                             |

SplitText ships inside `gsap` (free since 3.13); no extra package.

## Motion v2 QA (2026-10-20)

- Real browser, 1440×900: Lenis active on `/` (`html.lenis`), SplitText applied to the hero
  (2 masked lines, `aria-label` = full sentence), 0 console errors; after scrolling the whole
  landing no text is left hidden (the hero headline is intentionally at 35 % opacity once it has
  scrolled off-screen). `/rooms`: 0 hidden.
- Reduced motion: no Lenis, no split, everything at full opacity.
- Sticky header measured every animation frame during a Lenis scroll (217 frames): always at
  `top: 0`. Mid-scroll Playwright screenshots can show the header offset — a capture artefact.
- Matrix re-run (13 routes × 5 widths × 2 themes): 0 overflow, 0 errors, 0 hidden.
- Frames: `docs/qa/motion-v2/` (hero letter rise at 120–1400 ms, mid-scroll reveals).
- Bundles: GSAP/Lenis sit in a shared lazy chunk used by the discovery pages; the main and admin
  chunks contain neither.

## Known limitations

- The seed data marks two of four rooms as MAINTENANCE; the landing shows bookable rooms first.
- Seed room photos are hot-linked Unsplash URLs stored in the database; every image has a
  fallback that keeps the frame ratio.
- Tokens from the API carry no name/email for some accounts; the header shows "bạn" and the
  admin sidebar shows the role instead of a raw id.
- Nothing has been committed, pushed, merged or deployed.
