# UI redesign — "Premium Editorial Workspace"

> Không gian kiến trúc ở phần khám phá — giao diện sản phẩm rõ ràng ở phần nghiệp vụ.

Builds on the previous Tailwind v4 + shadcn/ui migration (`apps/client/DESIGN.md`). This pass
changes the visual language (serif → one sans family, black/white → paper + moss + ink sections),
adds an editorial landing page, splits the room explorer onto its own route and adds GSAP for
marketing-only motion. Backend, API contracts and booking rules are untouched.

## Reference

Video `1792475721429_….mp4` (30 s, portrait phone capture of an architecture studio site,
"Osvald"). Read as 24 still frames (no direct video playback): oversized sans headline revealed
per letter, full-bleed architecture photo on dark, hairline-ruled numbered service columns, a dark
"Works that define us" photo grid with caption meta, a 01/02/03 ruled feature row, and a footer
with a giant wordmark. Its testimonial section is **not** adapted (no invented reviews).

## Tokens (`apps/client/src/index.css`)

| Token                | Light                 | Dark                  | Note                          |
| -------------------- | --------------------- | --------------------- | ----------------------------- |
| `--background`       | `#F7F5F1`             | `#141613`             | paper                         |
| `--card`             | `#FFFFFF`             | `#1C1F1B`             | surface                       |
| `--foreground`       | `#1C1E1A`             | `#EDEBE6`             | 15.4:1 / 14.4:1               |
| `--muted-foreground` | `#656A61`             | `#A3A79D`             | 5.1:1 / 7.0:1                 |
| `--border`           | `#DDDCD5`             | `#2E332C`             | decorative hairline           |
| `--input`            | `#8A8E84`             | `#6F746B`             | control edge ≥ 3:1            |
| `--primary` (moss)   | `#334B3A`             | `#A8C3AD`             | 8.7:1 / 9.1:1                 |
| `--ink` / `--on-ink` | `#191C19` / `#EDEBE6` | `#0E100D` / `#EDEBE6` | dark sections (`section-ink`) |

Status colours (confirmed / success / cancelled / no-show / unpaid / maintenance) are unchanged
and always paired with a text label.

- **Type**: Manrope 400–800 (Vietnamese subset) for everything. `text-hero` 40–112 px,
  `text-display-xl` 40–80 px, `text-display-lg` 28–48 px, body 16 px. Tight negative tracking on
  display sizes; line-height ≥ 1.04 so diacritics are never clipped.
- **Layout**: `container-page` up to 1360 px, gutters 20 / 32 / 48 px; 12-column grids on desktop.
- **Shape**: radius 4 / 6 / 8 / 12 px, dialogs 16 px. Hairlines first, soft shadow second.
- **Touch**: default button 44 px high.

## Screen map

| Route                                            | Component                            | Function kept                                                                                                          | Redesign                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                              | `pages/HomePage` (landing, new)      | —                                                                                                                      | Hero with large type + real room photo, CTA "Khám phá không gian", featured rooms (dark section, API data), process steps, amenities, CTA band. Legacy `/?capacity=…` links redirect to `/rooms?…`. |
| `/rooms`                                         | `pages/RoomsPage` (moved from `/`)   | filters, URL sync, pagination, amenity filter                                                                          | Editorial header, equal grid of photo-first cards, mobile filter drawer                                                                                                                             |
| `/rooms/:id`                                     | `RoomDetailPage` + `BookingForm`     | availability, time grid, pricing preview, booking submit, conflict handling                                            | Large gallery + keyboard lightbox, sticky booking panel, mobile booking CTA                                                                                                                         |
| `/booking-confirmation`                          | `BookingConfirmationPage`            | router-state receipt, reload fallback                                                                                  | Receipt layout, light success mark                                                                                                                                                                  |
| `/login`, `/register`                            | `AuthLayout` + pages                 | validation, show/hide password, redirects, session-expired notice                                                      | Form + photo split on desktop, form-only on mobile                                                                                                                                                  |
| `/bookings`, `/bookings/:id`                     | history + detail                     | filters, pagination, ownership, cancel (≥ 1 h)                                                                         | Clear code / room / time / amount / status hierarchy                                                                                                                                                |
| `/admin`, `/admin/dashboard`, `/admin/bookings`  | `AdminLayout` + pages                | rooms, images, amenities, maintenance warning, bookings filters, payment confirm, cancel, guest booking, KPIs from API | Data-first shell, same tokens, no marketing motion                                                                                                                                                  |
| 403 / 404 / loading / session expired / conflict | `RouteGuard`, `NotFoundPage`, states | —                                                                                                                      | Shared states with a way forward                                                                                                                                                                    |

## Motion

- **Marketing (GSAP + ScrollTrigger + SplitText, lazy-loaded, discovery pages only)** — v2,
  2026-10-20, after feedback that v1 felt too static compared with the reference:
  - `SplitReveal`: characters / words rise out of a clipped line (`mask: 'lines'`), expo-out
    ~1 s, 22 ms per char. Hero h1 and section titles, `/rooms` and room-detail titles. SplitText
    keeps an `aria-label` with the full sentence; `.split-line-mask` padding protects Vietnamese
    stacked diacritics.
  - `RevealImage`: curtain reveal (clip-path bottom → top, 1.3 s) while the picture settles from
    1.18×, plus ±4 % desktop parallax. Hero (on mount) and featured rooms (on scroll).
  - `ScrubText`: closing statement words brighten 20 % → 100 % with scroll.
  - `DrawRule`: hairlines draw left → right; step numbers rise per digit.
  - Hero headline drifts up and fades slightly as the photo scrolls in (desktop, scrub).
  - Footer wordmark letters rise via CSS + IntersectionObserver (no GSAP in the shared layout).
  - **Lenis** inertial wheel scrolling on `/` and `/rooms` only (`useSmoothScroll`): touch keeps
    native momentum, dialogs/sheets/menus and `[data-lenis-prevent]` scroll natively, destroyed on
    unmount so booking/admin screens are never affected.
  - Everything is gated by `gsap.matchMedia('(prefers-reduced-motion: no-preference)')`; with
    reduced motion there is no split, no curtain, no Lenis and all content is visible.
- **Product (Motion / CSS)**: 120–220 ms feedback, sliding selection pills, value swaps, dialog
  fades. No scroll motion, parallax or stagger in booking forms or admin tables.
- Route change is an opacity-only fade (no transform, so sticky panels are unaffected), keyed by
  pathname so filter/query changes never re-enter a page.
- Public/admin route entrances start after the lazy page resolves; loading feedback stays visible
  outside the animated container. Login/register also animate on direct entry, with an independent
  desktop-panel fade and directional tab transitions capped at 8 px. Existing form-section staggers
  remain in place. `MotionConfig reducedMotion="user"` removes spatial movement for reduced motion.

## Isolation

Originally built in a sibling copy (`Co-Workspace Booking - editorial`). The redesign and page
entrance animations were subsequently integrated into the main repository for release on
2026-10-22 via `codex/ui-redesign-motion`.
