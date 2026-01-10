# SimpleSpend

SimpleSpend is a lightweight, manual budgeting app inspired by EveryDollar.
It is designed to be **fast, explicit, and easy to reason about**, with a
clean separation between **monthly budgets** and **annual plans / sinking funds**.

This repository contains the **frontend-only v1.0 baseline**, locked before
backend integration.

---

## Core Concepts

### Monthly Budget
- One budget per month (`YYYY-MM`)
- Single income number
- User-defined monthly categories
- Expenses reduce “Left to Spend” for the month

### Annual Categories (Merged Budget + Sinking Fund)
Annual categories represent **year-wide plans**, such as:
- Vacation
- Car maintenance
- Gifts

Each annual category has:
- **Target** (original planned amount)
- **Boost** (optional extra contributions from “thin air”)
- **Available** = Target + Boost
- **Spent YTD** = sum of all annual expenses across months
- **Left** = Available − Spent

Annual expenses:
- Do **not** reduce monthly income
- Persist across months via YTD aggregation
- Show YTD totals in the annual list
- Show *current month only* when expanded

---

## Important Rules (Authoritative)

- Creating an **annual category does NOT create a monthly category**
- Annual totals are computed **year-to-date across all months**
- Monthly and annual categories are independent
- Contributions are virtual (not tied to income)
- One income number per month (simplicity-first)

---

## Current State (v1.0)

- Frontend-only (localStorage)
- Medium theme
- Month selector
- Monthly and annual category lists
- Correct annual YTD behavior
- Versioned via `VERSION.txt`

This version intentionally favors **clarity over polish**.
UI complexity will be layered back in after backend integration.

---

## Planned Next Steps

1. Supabase Auth (email/password)
2. Database schema (multi-user ready)
3. Replace localStorage with Supabase
4. Reporting page (YTD summaries, trends)
5. Budget sharing (future phase)

---

## Tech Stack

- HTML / CSS / Vanilla JS
- GitHub Pages (static hosting)
- Supabase (planned backend)

---

## Versioning

Current version: **v1.0**

Version is displayed in the UI and sourced from `VERSION.txt`.

---

## Philosophy

SimpleSpend intentionally avoids:
- Auto-imported transactions
- Hidden logic
- Over-automation

The goal is **clarity and control** over every dollar.
