# SimpleSpend

SimpleSpend is a **manual, month-first** budgeting app inspired by EveryDollar.
It prioritizes **clarity, speed, and control** over automation.

This README is the **source of truth** for behavior + direction. If code disagrees with this, **the code is wrong**.

---

## Product Philosophy (Locked)

- **Manual-first budgeting**  
  No bank sync, no auto-import. The user explicitly records spending.

- **Simple > fancy**  
  Flat lists. Clear numbers. Minimal friction.

- **Month-first**  
  The monthly view is the home and mental model.

---

## Repository & Architecture (Locked)

- **Hub repo:** `app-home`  
  Launcher only. Links to individual apps.

- **App repo:** `app-simplespend`  
  Standalone repository.

- **Frontend:** Static site (GitHub Pages / PWA)
- **Backend (future):** Supabase (Postgres + RLS)
- **Auth (future):** Supabase Auth (real auth, not a pin/local-only lock)
- **Monorepo:** ❌ Not used

---

## Phases (Locked)

### Phase 1
- Single-user experience
- Multi-device sync (future)
- Schema must be **multi-user ready**

### Phase 2
- Multi-user budgets (sharing with spouse/others)
- Potentially multiple budgets per user

---

## Core Model (Locked)

### Month Model
- Budgets are keyed by month as `YYYY-MM` (e.g. `2026-01`).
- Navigation:
  - Month dropdown
  - Previous / next month buttons
- Month creation can optionally:
  - Copy **monthly categories + budgeted amounts** from previous month
- Monthly budgets are independent objects.

### Income & Totals (Monthly)
- Each month has **one income number**.

Calculations:
- **Planned Remaining** = `Income − sum(Monthly Budgeted)`  
  - Can be negative (display negative in **red**)
- **Left to Spend** = `Income − sum(Monthly Spent)`  
  - Can be negative (display negative in **red**)

---

## Monthly Categories (Locked)

User can:
- Add / remove categories
- Set name + budgeted amount

Monthly categories affect:
- Planned Remaining
- Left to Spend

### Category List UI (Locked Direction)
Each category row shows:
- Category name
- **Left / Total** (default)
- Progress ring indicator

Toggle:
- Tap the amount area to toggle:
  - **Left / Total**
  - **Spent / Total**

No clutter:
- Edit/delete must not clutter rows  
  Actions live in expanded detail.

### Money Display Rules
- Category rollups should show **no cents** (e.g. `$50`, `-$50`)
- Expense line-items can show cents.

---

## Expenses (Locked)

Required fields:
- Vendor
- Item (short label)
- Amount
- Date
- Category
- Note (optional)

Behavior:
- Expenses must have a **valid category**
- Clicking a category expands and shows expenses **inline under that category**
- Expenses are scoped to:
  - the month (monthly categories)
  - or the annual subsystem rules below (annual budgets)

---

## Extra Bucket (Hidden Uncategorized) — Non-Negotiable

Special hidden category:
- ID: `__extra__`
- Name: `Extra`

Rules:
- ❌ Never selectable in Add Expense
- ✅ Appears **only when it has expenses**
- Deleting a category:
  - existing expenses move to **Extra**
- ✅ Auto-hides when empty

Purpose:
- Nothing ever “disappears”
- Forces cleanup without data loss

---

## Annual System (Locked Decision)

Annual behavior was clarified and split into **two types** that share the same mechanics but differ in scope and UI.

### Annual Types

#### 1) Annual Budget (Year-scoped, resets yearly)
Use when:
- You want a yearly budget that does **not** roll over into next year.

Scope:
- Ledger is per-year (e.g. 2026 only)
- Annual expenses/contributions do **not** roll from `Dec 2026 → Jan 2027`

Copy behavior:
- New year should **recreate** the annual budget items by copying:
  - Name
  - Target
  - Initial
- New year does **not** copy:
  - Expenses
  - Contributions

Row UI:
- Show **Target directly underneath the category name** (no drill-down needed)
- Row amount display:
  - **Left / TotalAvailable**
  - no cents

**Annual Budget Math (authoritative):**
- Target = expected yearly budget (static; does not change)
- Initial = starting amount available for that year
- Contributions = “small wins” added without changing Target
- Spent = sum of annual-budget expenses within that year

Formulas:
- **TotalAvailable** = `Target + Initial + sum(Contributions)`
- **Left** = `TotalAvailable − Spent`

Ring behavior:
- Ring should be **full when healthy** and **drain as remaining decreases**
- Progress basis for annual budgets:
  - `Left / TotalAvailable` (clamped 0..1)

Expanded detail:
- Show **all annual budget expenses for the year (YTD)** (not just the month)
- Show **all annual budget contributions for the year (YTD)**
- Contributions must support **Edit** and **Delete**
- Expenses must support **Edit** and **Delete**
- Negative money shows as `-$50` (not parentheses)

#### 2) Sinking Fund (All-time rollover)
Use when:
- You want a fund that carries over across years.

Scope:
- Ledger is all-time (global)
- Continues across year boundaries

Row UI:
- Row shows **Balance only** (no cents)
- Target shown under the name as “Goal”

**Sinking Fund Math (authoritative):**
- Target = goal (static)
- Initial = starting fund amount
- Contributions = added to fund
- Spent = fund expenses (all-time)

Formulas:
- **Funded** = `Initial + sum(Contributions)`
- **Balance** = `Funded − Spent`

Expanded detail:
- Show **all contributions all-time**
- Show **all expenses all-time**
- Contributions must support **Edit** and **Delete**
- Expenses must support **Edit** and **Delete**
- Negative money shows as `-$50`

> NOTE: Annual Budgets and Sinking Funds share the same “ledger idea” but differ in whether they reset yearly.

### Critical Rule (Hard Non-Negotiable)
- **Creating an annual category must NOT create a monthly category.**
- Monthly categories are created only via “Add Monthly Category”.

---

## UI / UX Rules (Locked)

- Medium theme (not dark)
- Larger readable font
- Responsive (no overlapping on mobile)
- No instructional clutter (“tap to show spent” style microcopy should be removed)
- Stable column alignment: headers and rows must share the same grid layout

---

## Versioning (Locked)

- Version shown subtly in UI
- Read from `VERSION.txt`
- Fallback version supported in JS

---

## PWA / Service Worker (Locked Direction)

Goal:
- Avoid “stale deployments” from cached JS/CSS.

Requirements:
- Service worker cache must include:
  - `./index.html`
  - `./css/styles.css`
  - `./js/app.js`
  - `./manifest.json`
  - icons
  - `./VERSION.txt`
- Bumping `CACHE_NAME` should trigger refresh.
- Recommended strategy:
  - **Network-first** for HTML (so deployments show quickly)
  - **Cache-first** for static assets (fast loads)

---

## Backend & Security Direction (Future, Locked)

- Data persisted in Supabase (no long-term reliance on localStorage)
- Budgets scoped by `budget_id`

Security:
- Supabase **Row Level Security is mandatory**
- All access scoped by:
  - user membership to `budget_id`
- Even in Phase 1, schema must support future sharing

---

## Reporting (Required, Future Phase)

Reporting page is required.
Must support:
- Annual rollups
- Spending trends
- All expenses retained for reporting

---

## Regression Checklist (Always Test)

1. Monthly overspend shows **negative + red**
2. Planned Remaining can go negative
3. Extra bucket:
   - Never selectable
   - Shows only when populated
   - Receives expenses on category delete
   - Auto-hides when empty
4. Annual system:
   - Creating annual does NOT create monthly
   - Annual Budget is **year-scoped** (no rollover)
   - Annual Budget totals are **YTD**, month switching does not reset
   - Sinking Funds **roll over all-time**
   - Contributions are editable
   - Category rows show Target underneath without drilling in
5. Month switching never loses data
6. Buttons and modals continue to work
7. Money formatting:
   - Category rollups show **no cents**
   - Negatives show as `-$50` (not parentheses)

---

## Status / Next Steps

Current:
- Frontend logic v0.7 baseline
- Annual Budgets + Sinking Funds structure agreed

Next steps:
1. Version bump discipline + SW cache discipline
2. Supabase Auth
3. Database schema + RLS (multi-user ready)
4. Reporting page
