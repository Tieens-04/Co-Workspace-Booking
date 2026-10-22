# Co-Space Design System

> **Superseded in part (2026-10-20): "Premium Editorial Workspace".** Palette (paper `#F7F5F1`,
> moss `#334B3A`, ink sections `#191C19`), typography (one family, **Manrope**, no serif), radius
> (4/6/8/12, dialogs 16), container (1360 px), 44 px touch targets, the `/rooms` route split and
> GSAP marketing motion are documented in [`docs/ui-redesign.md`](../../docs/ui-redesign.md); QA in
> [`docs/ui-redesign-qa.md`](../../docs/ui-redesign-qa.md). Where this file disagrees on those
> points, `src/index.css` and `docs/ui-redesign.md` win. The rules below (no hex, no inline styles,
> native controls, test hooks, product motion) still apply.

Hairline rules instead of shadows, generous whitespace, colour reserved for status. Light and dark
themes are designed separately (dark is not an inversion). All values are implemented in
`src/index.css`, which is the source of truth.

## Stack

| Concern    | Choice                                                               |
| ---------- | -------------------------------------------------------------------- |
| Styling    | Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first `@theme`)            |
| Primitives | shadcn/ui (new-york, Radix) copied into `src/components/ui/`         |
| Toasts     | Sonner, wrapped by `ToastProvider` / `useToast()`                    |
| Motion     | `motion/react` via `LazyMotion strict` — use `m.*`, never `motion.*` |
| Icons      | `lucide-react`, always `aria-hidden="true"` next to a text label     |
| Theme      | `ThemeProvider` / `useTheme()` — `light` · `dark` · `system`         |

Browser floor (Tailwind v4): Safari 16.4+, Chrome 111+, Firefox 128+.

## Tokens

CSS variables live on `:root` (light) and `.dark`. `@theme inline` exposes them as utilities, and
the default Tailwind palette is removed (`--color-*: initial`) so arbitrary hues cannot creep in.

| Token                     | Light     | Dark      | Utility examples                        |
| ------------------------- | --------- | --------- | --------------------------------------- |
| `--background`            | `#fafaf7` | `#0b0b0a` | `bg-background`                         |
| `--foreground`            | `#0a0a0a` | `#f4f4ef` | `text-foreground`, `border-foreground`  |
| `--card` / `--popover`    | `#ffffff` | `#151514` | `bg-card`, `bg-popover`                 |
| `--muted`                 | `#f0f0eb` | `#1c1c1a` | `bg-muted` (also `secondary`, `accent`) |
| `--muted-foreground`      | `#5e5e58` | `#a6a69f` | `text-muted-foreground`                 |
| `--border` (decorative)   | `#e3e3dd` | `#2a2a27` | `border` (default colour)               |
| `--input` (control ≥ 3:1) | `#8c8c85` | `#6e6e68` | `border-input`                          |
| `--primary` / `--ring`    | ink       | paper     | `bg-primary`, `ring-ring`               |
| `--destructive`           | `#b42318` | `#f97066` | `bg-destructive`, `text-destructive`    |
| `--booked-foreground`     | `#6a6a64` | `#8e8e87` | booked time slots                       |
| `--scrim`                 | 42% ink   | 62% black | `bg-scrim` (dialog overlay)             |

Every text/background pair meets WCAG AA (≥ 4.5:1); control borders meet 3:1.

### Status tones

Each tone has `fg`, `bg`, `border` (`text-status-X`, `bg-status-X-bg`, `border-status-X-border`).
Badges always carry a text label — colour is never the only cue.

| Tone          | Used for                         | Extra cue                 |
| ------------- | -------------------------------- | ------------------------- |
| `confirmed`   | `CONFIRMED`                      |                           |
| `success`     | `COMPLETED`, `PAID`, `AVAILABLE` | `PAID` shows a check icon |
| `cancelled`   | `CANCELLED`, errors              |                           |
| `noshow`      | `NO_SHOW`, warnings              |                           |
| `unpaid`      | `UNPAID`                         | dashed border             |
| `maintenance` | `MAINTENANCE`                    |                           |

Labels and tones are defined once in `src/utils/status.ts` and rendered by
`components/common/StatusBadge.tsx` (`data-status` attribute for tests/styling).

### Type

- Display: **Fraunces** (variable, optical size). Body: **Be Vietnam Pro** 400–700. Both load the
  Vietnamese subset from Google Fonts (`index.html`).
- `h1`–`h3` get `font-display` from the base layer. Sizes: `text-display-xl` (40–72px, 1.08),
  `text-display-lg` (32–44px, 1.12), `text-h1` (30–36px), `text-h2` (28px), `text-h3` (22px).
- Keep display line-height ≥ 1.1 so stacked diacritics (Ể, Ỗ, Ợ) are never clipped; never put
  `overflow-hidden` on headings; never uppercase the serif. Uppercase labels use the `eyebrow`
  utility (sans, 0.14em tracking).
- Prices, times and booking codes use `tabular-nums`.

### Shape, depth, motion

- Radius base `--radius: 0.375rem` → `rounded-sm` 2px, `md` 4px, `lg` 6px, `xl` 10px. Pills only
  for badges.
- Depth is mostly hairlines. `shadow-soft` for raised panels, `shadow-overlay` for dialogs, menus
  and toasts.
- Easing `ease-editorial` (`cubic-bezier(0.22, 1, 0.36, 1)`); 120 / 200 / 320ms, page enter 450ms.
  Only fades and ≤ 8px translates. `MotionConfig reducedMotion="user"` plus a base-layer
  `prefers-reduced-motion` rule disable motion.

## Motion

Motion explains what changed; it never decorates or makes the user wait. Tokens live in
`src/lib/motion.ts` (`EASE_EDITORIAL`, `DURATION`, `fadeRise`, `staggerChildren`), primitives in
`src/components/motion/`. `LazyMotion` loads `domMax` (needed for shared-layout indicators).

| Where                         | What moves                                      | Why                          |
| ----------------------------- | ----------------------------------------------- | ---------------------------- |
| Route change (public + admin) | Page fades in, rises 8px                        | Continuity between screens   |
| Home hero, room grid          | Eyebrow → headline → lead; cards stagger (50ms) | Reading order, new results   |
| Result count, booking total   | `SwapValue` slides the new value in             | Notice that a number changed |
| Room card hover/focus         | Photo scales 3%, arrow nudges right             | Affordance: it is clickable  |
| Room gallery                  | Picked photo fades in                           | Continuity                   |
| Time slots                    | Colour transition + press scale 0.96            | Tactile selection feedback   |
| Segmented filters, admin nav  | Selected pill slides (`layoutId`)               | Where the selection went     |
| Booking confirmation          | Ring settles, check mark draws itself           | Success, once                |
| Admin KPIs                    | Cards stagger in, occupancy bar grows from 0    | Read the figures in order    |
| Booking history               | Rows stagger in on filter/page change           | New list reads as new        |
| Theme switch                  | Colours cross-fade 320ms (`.theme-transition`)  | Avoid a harsh flash          |
| Empty / error states          | `animate-rise`                                  | Draw attention gently        |

Rules: transform and opacity only (plus colour cross-fades); ≤ 450ms except one-off decorative
draws; no bounce/spring overshoot; content is fully visible at rest; never animate the removal of
something the user must stop seeing immediately; use `m.*` (never `motion.*`) under
`LazyMotion strict`.

### Utilities added in `index.css`

`container-page` (1240px + gutters), `eyebrow`, `bg-hatch` (diagonal hatch for booked slots),
`animate-rise`.

## Layouts

`src/layouts/` — pages never render `<main>`, the header or the footer themselves.

- `PublicLayout`: skip link, `AppHeader` (desktop nav + mobile Sheet menu + theme toggle), animated
  `<main id="main-content">`, `AppFooter`.
- `AuthLayout`: editorial side panel on `lg`, centred 420px form column.
- `AdminLayout`: sticky sidebar (`admin-nav-dashboard|rooms|bookings`, `aria-current`) on `lg`,
  top bar + Sheet menu below `lg`.

## Components

- `components/ui/*` — shadcn primitives, adjusted to the tokens (Vietnamese close labels,
  `bg-scrim` overlays, serif dialog titles, 2px focus rings).
- `components/common/*` — `StatusBadge`/`ToneBadge`, `PageHeader`, `EmptyState`, `ErrorState`,
  `Pagination`, `SegmentedControl`, `NativeSelect`, `Checkbox`, `Field`.
- Domain folders: `components/rooms/`, `components/booking/`, `components/admin/…`.

## Rules

1. No hex colours or inline `style={{}}` in TSX. The only allowed `style` is assigning a CSS
   custom property for a truly dynamic value (e.g. an occupancy width).
2. No CSS Modules and no global component classes — compose utilities and the components above.
3. Selects, checkboxes, date/datetime and file inputs stay **native** (styled), so keyboard,
   mobile pickers and `userEvent.selectOptions` keep working. Radix overlays (Dialog,
   AlertDialog, Sheet, DropdownMenu) are used only for real overlays.
4. Responsive variants must not render duplicate DOM (jsdom ignores CSS): use a Sheet that mounts
   on open, or one element restyled per breakpoint.
5. Test hooks are `data-testid`, `data-status` (badges) and `data-slot-state`
   (`available|booked|past|selected`) on time slots — not class names.
6. Booking rules, pricing and availability stay server-authoritative; the UI only mirrors them.

## Theme and the anti-flash script

`ThemeProvider` stores the choice in `localStorage['cospace-theme']`, follows
`prefers-color-scheme` when set to `system`, and toggles `.dark` + `color-scheme` on `<html>`.
An inline script in `index.html` applies the saved theme before first paint. If a Content
Security Policy is added later, allow this script by hash.
