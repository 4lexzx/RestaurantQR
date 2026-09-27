# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** MenuGo
**Generated:** 2026-08-28 23:43:51
**Category:** Restaurant/Food Service

---

## Global Rules

### Color Palette

**Default "Moderno neutral"** (indigo `#2563EB` + slate `#0F172A`). Idéntica por tenant: el color primario se parametriza desde `restaurantes.color_primario` y se aplica en vivo por JS como variables `--mg-*` (escala 50..950). Todas las utilidades Tailwind `orange-*` del HTML se mapean a la escala primaria en `theme.css`.

| Role | Hex (default) | CSS Variable |
|------|-----|--------------|
| Primary | `#2563EB` | `--mg-primary` / `--mg-p600` |
| Primary 50..950 | escala calculada | `--mg-p50..--mg-p950` |
| Secondary | `#0F172A` | `--mg-secondary` |
| Heading | `#0F172A` | `--mg-heading` |
| Accent/CTA | `--mg-p600` | `--mg-accent-soft` (rgba 12%) |
| Background | `#F6F8FB` | `--mg-bg` |
| Surface/Card | `#FFFFFF` | `--mg-surface` |
| Text | `#475569` | `--mg-text` |
| Muted | `#94A3B8` | `--mg-muted` |
| Border | `#E2E8F0` | `--mg-line` |

**Color Notes:** Reemplaza al anterior "Bistro Noir" (rechazado). Implementado en `Frontend/css/theme.css` (override de utilidades Tailwind con `!important` hacia vars) y aplicado por `Frontend/js/config.js` (`menugoAplicarTema` recalcula la escala a partir de `color_primario` del tenant; escala generada con `mezclar()`). Cambiar el color en el Admin repinta todo el sitio sin recargar.

### Typography

- **Heading Font:** Karla (800/black)
- **Body Font:** Karla (500)
- **Mood:** restaurant, menu, hospitality, saas, modern, neutral, clean
- **Google Fonts:** [Karla](https://fonts.googleapis.com/css2?family=Karla:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Karla:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button (usa la escala del tenant) */
.btn-primary {
  background: var(--mg-p600);
  color: white;
  padding: 12px 24px;
  border-radius: 14px;
  font-weight: 700;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  background: var(--mg-p700);
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: var(--mg-p600);
  border: 2px solid var(--mg-p400);
  padding: 12px 24px;
  border-radius: 14px;
  font-weight: 700;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FEF2F2;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #DC2626;
  outline: none;
  box-shadow: 0 0 0 3px #DC262620;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Moderno neutral (SaaS)

**Keywords:** Clean, neutral, professional, high readability, trusted, hospitality, modern, generous whitespace, rounded corners (16px), soft shadows

**Best For:** Restaurant SaaS, food service, digital menus, admin panels, multi-tenant

**Key Effects:** Cards con hover lift, granos en fotos (zoom suave `mg-zoomimg`), revelado por scroll (`animaciones.js`), entrada de hero con framer-motion (`motion-hero.js`), micro-prensa en botones, notificaciones toast animadas

### Page Pattern

**Pattern Name:** Funnel (3-Step Conversion)

- **Conversion Strategy:** Progressive disclosure. Show only essential info per step. Use progress indicators. Multiple CTAs.
- **CTA Placement:** Each step: mini-CTA. Final: main CTA
- **Section Order:** Hero > Step 1 (problem) > Step 2 (solution) > Step 3 (action) > CTA progression

---

## Anti-Patterns (Do NOT Use)

- ❌ Low-quality imagery
- ❌ Outdated hours

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
