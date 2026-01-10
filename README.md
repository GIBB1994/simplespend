# SimpleSpend

SimpleSpend is a manual, month-first budgeting app inspired by EveryDollar.
It prioritizes **clarity, speed, and control** over automation.

This README defines the **non-negotiable behavior, architecture, and direction**
of the project. Treat it as the source of truth.

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

- **Frontend:** Static site (GitHub Pages)

- **Backend:** Supabase (Postgres + RLS)

- **Auth:** Supabase Auth (real auth, not a pin or local-only lock)

- **Monorepo:** ❌ Not used

---

## Phases (Locked)

### Phase 1
- Single-user experience
- Multi-device sync
- Schema must be **multi-user ready**

### Phase 2
- Multi-user budgets (sharing with spouse/others)
- Potentially multiple budgets per user

---

## Month Model (Locked)

- Budgets are viewed by **month/year** (e.g. *January 2026*).
- Easy navigation:
  - Dropdown selector
  - Previous / next month buttons
- Creating a month can optionally:
  - Copy **monthly categories + budgeted amounts** from the previous month
- Monthly budgets are independent objects keyed as `YYYY-MM`.

---

## Income & Totals (Locked)

- Each month has **one total income number**.

### Calculations
- **Planned Remaining**  
  `Income − sum(Monthly Budgeted)`  
  - Can go **negative**
- **Left to Spend**  
  `Income − Monthly Spent`  
  - Can go **negative**
  - Negative values must display **in red**

---

## Monthly Categories (Locked)

- User can:
  - Add / remove categories
  - Set name and budgeted amount
- Monthly categories:
  - Affect Planned Remaining
  - Affect Left to Spend

### Category List UI (Locked Direction)
- Show:
  - Category name
  - **Left / Total** (default)
  - Progress indicator (ring/pie)
- Tap Left/Total to toggle:
  - **Spent / Total**
- Edit / delete actions must **not clutter the main list**
  - Actions live inside expanded detail or a dedicated edit mode

---

## Expenses (Locked)

### Required Fields
- Vendor
- Item (short label)
- Amount
- Date
- Category
- Note (optional)

### Behavior
- Expenses must have a **valid category**
- Clicking a category shows expenses **inline under that category**
- Expenses are month-scoped

---

## Extra Bucket (Hidden Uncategorized) — Non-Negotiable

- Special hidden category:
  - ID: `__extra__`
  - Name: `Extra`
- Rules:
  - ❌ Never selectable in Add Expense
  - Appears **only if it contains expenses**
  - When a category is deleted:
    - Existing expenses move to **Extra**
  - Auto-hides when empty
- Purpose:
  - No expenses ever “disappear”
  - Forces cleanup without data loss

---

## Annual Categories & Sinking Funds (Merged Concept, Locked)

Annual budgets and sinking funds are treated as **one unified concept**.

### Core Rule
- Contributions can be added **from thin air**
  - They do **not** reduce monthly income
  - The app does not require recording them as income
  - Users may optionally make a “double move” manually

### Annual Category Properties
- Name
- **Target** (original planned amount)
- **Balance** (running fund balance)
- Contributions list (add to balance)
- Expenses list (subtract from balance)

### Cross-Month Behavior (Locked)
- Annual category rows show **Year-To-Date totals**
- Expanded view shows **this month only**
- Switching months must not lose annual totals

### Critical Rule (Hard Non-Negotiable)
- **Creating an annual category must NOT create a monthly category**

---

## UI / UX Rules (Locked)

- Medium theme (not dark)
- Larger, readable font sizes
- Responsive:
  - No overlapping tables on mobile
- No instructional clutter (“click here” tips)
- Column alignment must be stable (headers and rows share grid)

---

## Versioning (Locked)

- Version displayed subtly in UI
- Read from `VERSION.txt`
- Fallback version supported

---

## Backend & Security Direction (Locked)

- Data persisted in Supabase (no long-term reliance on localStorage)
- Budgets scoped by `budget_id`

### Security
- Supabase **Row Level Security is mandatory**
- All access scoped by:
  - User membership to `budget_id`
- Even in Phase 1, schema must support future sharing

---

## Reporting (Required, Future Phase)

- Reporting page is required
- Must support:
  - Annual rollups
  - Spending trends
- All expenses are retained for reporting

---

## Regression Checklist (Always Test)

1. Monthly overspend shows **negative + red**
2. Planned Remaining can go negative
3. Extra bucket:
   - Never selectable
   - Shows only when populated
   - Receives expenses on category delete
4. Annual categories:
   - Do not create monthly categories
   - Show YTD totals across months
   - Expanded view shows current month only
5. Month switching never loses data
6. Buttons and modals continue to work

---

## Status

- Budget logic is nearly complete
- Next steps:
  1. Version bump
  2. Supabase Auth
  3. Database schema + RLS
  4. Reporting page
