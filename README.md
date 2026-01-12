# SimpleSpend

Manual, fast, **month-first** budgeting app with a clean mobile-style UI. Data lives in Supabase. Supports monthly budgeting + annual planning (annual budgets + sinking funds).

---

## What this app does

### Monthly (month-first)
- Navigate months with ◀ / ▶ or the month dropdown.
- If a month doesn’t exist yet:
  - You can create it and optionally **copy the previous month’s categories + budgeted amounts**.
- Tracks:
  - **Income**
  - **Planned Remaining** = Income − Monthly Budgeted
  - **Left to Spend** = Income − Monthly Spent
- Monthly categories:
  - Add / edit / delete categories
  - Add / edit / delete expenses via modal (not browser prompt)
- “Extra” category:
  - Exists as a hidden backend bucket (`extra99`)
  - **Never selectable**
  - Shows in UI only if it has expenses
  - If you delete a monthly category, its expenses get reassigned to **Extra**

### Annual (restored to v0.73 behavior)
Annual is split into two sections:

#### 1) Annual Budgets (year-scoped)
- You create these for the current year.
- The “Budgeted” amount is **display-only**.
- Math is ledger-driven:
  - The app ensures an automatic **Initial (auto)** contribution exists on Jan 1 for that year.
  - Left = Contributions − Expenses (for that year)
- Annual detail view shows:
  - Contributions (year)
  - Expenses (year)
- Initial entries are **locked** (not editable / deletable).

#### 2) Sinking Funds (year-aware via rollover snapshot)
- Sinking funds are long-term funds with:
  - **Goal**
  - **Starting Balance**
- To prevent “snowball” contribution behavior across years:
  - Each Jan 1, the app creates a snapshot entry:
    - **“Initial YYYY value”**
  - That snapshot equals the previous year’s ending balance.
  - The year’s running balance uses the snapshot as the starting point.
- Initial snapshot entries are **locked** (not editable / deletable).

---

## Tech stack
- Front-end: plain HTML/CSS/JS (no React)
- Auth + DB: Supabase
- Hosted as a static site (GitHub Pages supported)

---

## Repo layout (typical)
/
index.html
VERSION.txt
manifest.json
sw.js
/css
styles.css
/js
main.js
auth.js
app.js
config.public.js
config.js (dev-only, not committed)


---

## Boot + Config behavior
`index.html` tries to load:
1. `./js/config.js` (local dev, not committed)
2. If missing, falls back to `./js/config.public.js` (committed safe config)

Then it loads `./js/main.js` as a module.

If config fails to load:
- App root is hidden
- Auth gate stays visible
- Error message shows what’s missing

---

## Environments (DEV vs PROD)
- **DEV**: create `js/config.js` locally with your Supabase URL + anon key.
- **PROD**: commit `js/config.public.js` with the production URL + anon key.

> Keep secrets out of the client. Supabase anon key is expected to be public; security is enforced with RLS policies.

---

## Supabase tables (expected)
This app expects these tables to exist (names are exact):

### Core
- `budgets`
- `months`
- `monthly_categories`
- `monthly_expenses`

### Annual
- `annual_items`
- `annual_ledger`

---

## Important backend rules / assumptions
- The backend has an “Extra” category key:
  - `extra99`
- Extra is enforced:
  - Cannot be selected in UI
  - Used as reassignment target when a category is deleted

---

## Versioning
- UI version badge reads `VERSION.txt` (cache-busting recommended)
- App fallback version constant exists in JS (used if `VERSION.txt` can’t be read)

---

## Testing checklist (quick)
Monthly:
1. Create month (with and without copy previous)
2. Add/edit/delete monthly categories
3. Add/edit/delete expenses
4. Delete a category and confirm expenses move to Extra

Annual Budgets:
1. Add annual budget for the year
2. Confirm an **Initial (auto)** contribution exists (locked)
3. Add annual expense + contribution
4. Confirm Left updates correctly

Sinking Funds:
1. Create sinking fund with starting balance
2. Add contributions + expenses
3. Switch to a new year (January) and confirm a snapshot entry appears:
   - “Initial YYYY value”
4. Confirm balance does **not** double-count old contributions

---

## Notes
- This app is intentionally “manual-first”:
  - Fast entry
  - Minimal automation
  - Clean UI over feature bloat
- If behavior looks off, verify:
  - RLS policies
  - table names / column names
  - correct Supabase config loaded (DEV vs PROD)


