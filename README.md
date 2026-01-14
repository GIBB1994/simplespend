# SimpleSpend 

**Manual, envelope-based budgeting — month-first, ledger-driven, no hidden math.**

SimpleSpend is a static PWA backed by Supabase (Postgres + RLS).  
It is intentionally explicit: every dollar exists because the user put it there.

---

## Core Philosophy (Locked)

1. **Backend is the source of truth**
   - Supabase (Postgres + RLS)
   - No stored derived totals
   - Frontend computes views only

2. **Ledger-first accounting**
   - All money movement is via ledger rows
   - Totals are always recomputed
   - No cached balances as truth

3. **Money is explicit**
   - Stored as integer cents
   - Formatting is UI-only

4. **No silent magic**
   - No implicit rollovers
   - No auto-created categories
   - No guessing user intent

---

## Ownership & Access Model

### Budget-Centric
- All data is scoped by `budget_id`
- Users do not own rows directly
- Access is via budget membership

### Roles (Phase-ready)
- `owner` — full control
- `editor` — read/write
- `viewer` — read-only

---

## Monthly System (Envelope Budgeting)

### Months
- Identified by `month_key = YYYY-MM`
- One row per (`budget_id`, `month_key`)
- Stores:
  - `income_cents`

### Monthly Categories
- Created explicitly by user
- `budgeted_cents` is **planning**, not money
- Deleting a category never deletes expenses

### Extra Category (Locked)
- Fixed ID: `extra99`
- Hidden unless it has expenses
- Receives expenses when categories are deleted
- Cannot be manually selected

### Monthly Expenses
- Always reference a category
- Required fields:
  - vendor
  - item
  - amount
  - date

---

## Annual System (Two Distinct Concepts)

### 1. Annual Budgets (Year-Scoped Envelopes)

**Purpose:** Track spending against a yearly plan.

**Semantics (v0.73-style):**
- `initial_cents` = funded amount (budgeted up front)
- `target_cents` = display-only note
- Contributions add money
- Expenses subtract money

**Computed (never stored):**
- Total Available = `initial + contributions`
- Left = `total - spent`

#### Rollover Rule (Locked)
- On first encounter of a year:
  - Clone prior year’s annual budgets
  - Copy **budgeted/target amount only**
  - Happens once per year
  - Never repeats

---

### 2. Sinking Funds (All-Time Funds)

**Purpose:** Long-term savings buckets.

**Semantics:**
- `initial_cents` = starting balance
- `target_cents` = goal (ring only)
- Contributions add
- Expenses subtract
- Balance persists forever

---

## Annual Ledger (Shared Engine)

### Entry Types
- `expense`
- `contribution`

### Rules (DB-enforced)
- `amount_cents ≠ 0`
- `expense`:
  - vendor required
  - item required
- `contribution`:
  - vendor NULL
  - item NULL

Ledger entries:
- can be edited
- can be deleted
- always recompute totals

---

## Identity & Keys

### `item_key` (Critical)
- Stable slug identity
- Used for:
  - cross-year rollover
  - de-duplication
- Generated once on create
- **Never changes**

### `id`
- Physical row identity (UUID)
- Can differ year-to-year

---

## Frontend Architecture

- Static PWA
- Service Worker:
  - **network-first** for HTML & JS
  - **cache-first** for assets
- Version badge from `VERSION.txt`
- Local state is a **view-model cache only**

---

## Error Handling Philosophy

- DB constraints enforce correctness
- Frontend validates early for UX
- Errors are shown immediately
- No silent fallbacks

---

## Backend Schema Overview

### Core
- `budgets`
- `budget_members`

### Monthly
- `months`
- `monthly_categories`
- `monthly_expenses`

### Annual
- `annual_items`
- `annual_ledger`

All money is stored as integer cents.  
All totals are derived, never stored.

---

## Current Status

- Annual budgets & sinking funds fully wired
- Rollover logic stable and deterministic
- Cache behavior hardened
- Constraints aligned with frontend behavior

---

## Recommended Next Steps

1. **New User Flow**
   - First-budget creation
   - Auto-select active budget
   - Disable actions until budget exists

2. **Annual UI Polish**
   - Clear separation of:
     - annual budgets
     - sinking funds
   - Better affordances for contributions vs expenses

3. **Multi-User Support**
   - Member management UI
   - Role-based controls
   - Invite flow

4. **Prime-Time Hardening**
   - “Update available” banner for SW
   - Empty-state walkthroughs
   - Optional audit logging

---

## Final Note

This system is now:
- constraint-aligned
- rollover-safe
- internally consistent
- future-proof

From here on, changes should be **additive**, not corrective.
