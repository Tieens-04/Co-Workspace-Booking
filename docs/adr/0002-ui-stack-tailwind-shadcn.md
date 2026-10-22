# UI Stack: Tailwind CSS v4 + shadcn/ui

The client UI was rebuilt in the "Editorial Minimalist" language with light and dark themes. We
style it with Tailwind CSS v4 (CSS-first tokens in `apps/client/src/index.css`) and shadcn/ui
components (Radix primitives copied into `src/components/ui/`), with Sonner for toasts and
`motion` for small transitions. The React 19 + Vite 6 + React Router 7 + Axios + Zod stack is
unchanged.

## Status

Accepted (2026-10-18)

## Context

- The previous UI mixed a 2,400-line global stylesheet, CSS Modules and ~230 inline style objects
  with hard-coded hex colours; elements carried both legacy and module classes.
- There was no dark mode, and admin modals were plain `div`s without `role="dialog"`, focus
  trapping or Escape handling.
- The product owner asked for a complete redesign on a current, mainstream stack.

## Considered Options

1. **Keep CSS Modules, rewrite tokens.** No new dependencies, but every accessible overlay,
   menu and focus trap would have to be hand-written and maintained.
2. **Tailwind v4 only, custom components.** Fewer dependencies; same accessibility burden as (1).
3. **Tailwind v4 + shadcn/ui (Radix).** Accessible primitives, components owned in-repo and
   adjusted to our tokens, theming through CSS variables. **Accepted.**

## Consequences

- New dependencies: `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css` (dev);
  `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `sonner`, `motion`.
- Design rules live in `apps/client/DESIGN.md`: no hex colours, no inline styles, no CSS Modules;
  native selects/checkboxes/date inputs stay native so existing tests and mobile pickers work.
- Tests assert behaviour through roles, `data-testid`, `data-status` and `data-slot-state`
  instead of class names.
- Tailwind v4 raises the browser floor to Safari 16.4+, Chrome 111+, Firefox 128+.
- The Docker image builds with `npm ci` on Alpine; the lockfile includes the musl builds of
  `@tailwindcss/oxide` and `lightningcss`.
