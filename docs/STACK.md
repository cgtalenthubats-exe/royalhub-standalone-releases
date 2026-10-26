# Royal Flush ATS — Tech Stack & Design System

> For anyone preparing UI/design work. Pairs with `SCHEMA.md` (data model) and `PAGE_DATA_MAP.md` (page → data).

---

## 1. Stack

| Layer | Tech |
|---|---|
| **Framework** | **Next.js 15.5** (App Router) — **not** Vite · bundler = **Webpack** |
| **UI runtime** | **React 19** |
| **Language** | **TypeScript** |
| **Styling** | **Tailwind CSS v3** (`tailwind.config.js` + CSS variables in `src/app/globals.css`) |
| **Backend / DB** | **Supabase** (PostgreSQL 17) — accessed via **Server Actions** (`"use server"`), service-role admin client (`src/lib/supabase/admin.ts`) |
| **Data fetching** | **React Server Components + Server Actions** — no REST/tRPC/GraphQL layer |
| **Charts** | `recharts` (bar chart) · `react-simple-maps` (world map) · `d3-org-chart` (org chart) |
| **Export** | `pptxgenjs` (PPTX) · browser print (PDF) · `papaparse` (CSV) |
| **AI** | `@anthropic-ai/sdk` (Key Insights generation, model `claude-opus-4-8`) |
| **Deploy target** | Vercel (pending) · `.npmrc` has `legacy-peer-deps=true` |

---

## 2. Component library / Design system

**Already using shadcn/ui** — components live in [`src/components/ui/`](../src/components/ui/) (~28 components).

| Item | Detail |
|---|---|
| **Base** | **shadcn/ui** = Radix UI primitives + `class-variance-authority` + `tailwind-merge` + `clsx` (helper `cn()` in `src/lib/utils.ts`) |
| **Icons** | `lucide-react` |
| **Toasts** | `sonner` |
| **Available components** | accordion, alert, alert-dialog, avatar, badge, button, card, checkbox, command, dialog, dropdown-menu, input, label, popover, radio-group, scroll-area, select, separator, sheet, slider, table, tabs, textarea, tooltip, filter-multi-select, async-filter-multi-select |

> Do **not** mix in MUI / Chakra / other libraries — extend the existing shadcn/ui + Tailwind setup.

---

## 3. Design tokens

Defined as **HSL CSS variables** in `src/app/globals.css`, mapped in `tailwind.config.js` (shadcn convention). Use via Tailwind classes: `bg-background`, `text-foreground`, `bg-card`, `border`, `text-muted-foreground`, etc.

| Token | Value / use |
|---|---|
| `--background` | slate-50 (`bg-background`) — app background |
| `--card` | white — cards |
| `--foreground` | near-black slate — body text |
| `--primary` | indigo-600 (token default) |
| `--muted` / `--muted-foreground` | light slate / grey text |
| `--border` | slate-200 |
| `--radius` | **0.75rem** (fairly rounded corners) |

### Brand palette (used in actual pages)
- **Primary brand:** navy **`#0b1f3a`** — top nav, card headers, table headers, primary buttons, headings
- **Accent:** **amber** (`amber-400` / `amber-500`) — logo crown, "HQ" badge, "what-if" highlights
- **Surfaces:** slate-50 background, white cards, slate-100/200 borders
- **Status colors:** emerald (Active / pass), red (gap), sky/amber (grades), grey (muted)

### Recurring UI patterns
- **Section card:** `Card` with a navy header bar (`bg-[#0b1f3a] text-white px-4 py-2.5 text-sm font-semibold`) + white body
- **Tables:** navy `<thead>` (`bg-[#0b1f3a] text-white`), zebra/hover rows, right-aligned mono for money
- **Badges:** grades (A/A-/B+…) and competency scores as colored pill badges (`gradeColor()` in `src/lib/format.ts`)
- **Stat cards:** small icon + big number + label (Profile hero, Home, Org KPIs)
- **Org chart nodes:** white card, **black 1px** border, black 1px connector lines, avatar + name + position

---

## 4. Formatting helpers (`src/lib/format.ts`)

- `formatCurrency(value, currency="EUR")` → `€160,000`
- `formatYears(date)` → `8.0 yrs` · `formatDate(date)` → `01 Jun 2016`
- `compensationOnly(comp)` → base + sti_target + lti_target + other_bonus (excludes benefits — D8)
- `gradeColor(grade)` → Tailwind classes per performance grade

---

*Generated 2026-06-23 · Royal Flush ATS v1.0 beta.*
