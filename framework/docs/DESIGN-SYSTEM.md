# ArkhitX Design System

**Applies to:** ArkhitX Dashboard (`framework/frontend/`) and **every solution project** (`projects/*/frontend/`).

**Canonical source files:** `framework/design-system/` — copied into new projects by `scripts/new_project.py`.

**Dashboard-specific UI spec:** [ArkhitX-Dashboard-Governance-Tools-Rebuild-Spec.md](ArkhitX-Dashboard-Governance-Tools-Rebuild-Spec.md) (Governance/Tools tabs only).

---

## Principles

1. **One visual language** — dark consultant-grade UI by default; light theme available via toggle.
2. **CSS variables, not hardcoded grays** — use `ax-*` tokens and component classes so themes stay in sync.
3. **Dashboard vs solution** — same shell (header, theme toggle, panels). Dashboard adds governance/tools; solutions build domain pages on top.

---

## Theme (dark + light)

| Mechanism | Location |
|-----------|----------|
| Token definitions | `framework/design-system/index.css` — `:root` / `[data-theme='dark']` and `[data-theme='light']` |
| Toggle logic | `src/lib/theme.ts` — `initTheme()`, `toggleTheme()`, persists to `localStorage` key `ax-theme` |
| Toggle button | `src/components/ui/ThemeToggle.tsx` — sun/moon in app header |
| Bootstrap | Call `initTheme()` in `main.tsx` **before** `ReactDOM.createRoot` |

First visit respects `prefers-color-scheme` when no saved preference exists.

---

## Tailwind tokens

Map colors in `tailwind.config.js`:

- `bg-ax-bg`, `bg-ax-bg-2`, `bg-ax-bg-3`
- `text-ax-text`, `text-ax-text-dim`, `text-ax-text-muted`
- `border-ax-border`
- `bg-ax-primary`, `text-ax-primary-light`

---

## Component classes

Use these instead of raw `gray-*` / `bg-white`:

| Class | Use |
|-------|-----|
| `ax-panel` / `ax-panel-pad` | Card containers |
| `ax-btn-primary` / `ax-btn-secondary` / `ax-btn-ghost` | Buttons |
| `ax-input` / `ax-textarea` / `ax-select` | Form fields |
| `ax-section-title` | Section labels |
| `ax-alert-ok` / `ax-alert-warn` / `ax-alert-err` / `ax-alert-info` | Status banners |
| `ax-empty` | Empty states |

---

## Required dependencies (solution frontends)

```json
"clsx", "tailwind-merge", "lucide-react", "tailwindcss-animate"
```

---

## AI agent checklist (Phase 0 UI)

When building or restyling a solution frontend:

- [ ] Copy or sync from `framework/design-system/` (or use scaffold output)
- [ ] Header includes `<ThemeToggle />`
- [ ] `initTheme()` in `main.tsx`
- [ ] No `bg-gray-50` / `bg-white` page shells — use `bg-ax-bg`, `ax-panel-pad`
- [ ] Domain-specific layout only; governance stays in ArkhitX Dashboard

---

## Updating the design system

1. Edit files in `framework/design-system/`
2. Sync to `framework/frontend/` (dashboard)
3. Re-copy into existing projects as needed, or run a one-time sync script
4. Update this doc if tokens or classes change
