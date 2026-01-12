/* SimpleSpend v0.9.7 (Annual + Sinking fixed to v0.73 behavior, Supabase-backed)
  Fixes:
  - Monthly + Annual expenses share ONE "+ Add Expense" flow (annual items show in list)
  - Annual expense/contribution always requires a Category (prevents annual_ledger_field_guard)
  - Sinking funds are YEAR-SCOPED in display/math with a frozen Jan-1 snapshot per year
    * "Initial YYYY value" does NOT change when adding contrib/expenses
    * Snapshot is created ONLY when creating January (not when scrolling months)
  - Annual budgets auto-copy into new year on January creation (copies target only)
*/

const APP_FALLBACK_VERSION = "v0.96";
const STORAGE_KEY = "simplespend_v09";

// Backend truth
const EXTRA_ID = "extra99";
const EXTRA_NAME = "Extra";

// -------------------- DOM --------------------
const monthSelect = document.getElementById("monthSelect");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const nextMonthBtn = document.getElementById("nextMonthBtn");

const monthMissingState = document.getElementById("monthMissingState");
const monthExistsState = document.getElementById("monthExistsState");
const copyPrevCheckbox = document.getElementById("copyPrevCheckbox");
const createMonthBtn = document.getElementById("createMonthBtn");

const incomeInput = document.getElementById("incomeInput");
const plannedRemainingEl = document.getElementById("plannedRemaining");
const leftToSpendEl = document.getElementById("leftToSpend");

const monthlyTable = document.getElementById("monthlyTable");
const annualBudgetTable = document.getElementById("annualBudgetTable");
const sinkingFundTable = document.getElementById("sinkingFundTable");

const addMonthlyCategoryBtn = document.getElementById("addMonthlyCategoryBtn");
const addAnnualCategoryBtn = document.getElementById("addAnnualCategoryBtn");
const addExpenseBtn = document.getElementById("addExpenseBtn");

const expenseModal = document.getElementById("expenseModal");
const expenseModalTitle = document.getElementById("expenseModalTitle");
const closeExpenseModalBtn = document.getElementById("closeExpenseModalBtn");
const expVendor = document.getElementById("expVendor");
const expItem = document.getElementById("expItem");
const expAmount = document.getElementById("expAmount");
const expDate = document.getElementById("expDate");
const expCategory = document.getElementById("expCategory");
const expNote = document.getElementById("expNote");
const saveExpenseBtn = document.getElementById("saveExpenseBtn");
const saveAndAddAnotherBtn = document.getElementById("saveAndAddAnotherBtn");

const promptModal = document.getElementById("promptModal");
const promptTitle = document.getElementById("promptTitle");
const promptFields = document.getElementById("promptFields");
const closePromptModalBtn = document.getElementById("closePromptModalBtn");
const promptCancelBtn = document.getElementById("promptCancelBtn");
const promptOkBtn = document.getElementById("promptOkBtn");

// -------------------- UI state --------------------
let expanded = { type: null, id: null }; // "monthly" | "annual_budget" | "sinking_fund"
let amountMode = "left"; // global toggle for monthly/annual budgets

// Expense modal state
let editingExpense = null; // { id, mode: "add"|"edit", scope: "monthly"|"annual" }

// -------------------- App state --------------------
let state = null;
let currentMonthKey = null;
let _booted = false;

// Supabase wiring
let supa = null;
let authedUser = null;

// Read snapshot from Supabase
let ss = {
  budgets: [],
  activeBudgetId: null,

  // monthly bundle (current month_key)
  month: null,
  monthlyCategories: [],
  monthlyExpenses: [],

  // annual bundle (current budget + current year context)
  annualItems: [],
  annualLedger: [],
};

// -------------------- Init (auth-gated) --------------------
export async function initApp({ supabase, user }) {
  if (_booted) return;
  _booted = true;

  supa = supabase;
  authedUser = user;

  // Local is just a view-model cache (not authoritative)
  state = { budgets: {} };

  currentMonthKey = getMonthKey(new Date());

  await loadVersionBadge();
  await bootReads();

  seedMonthSelect();
  if (monthSelect) monthSelect.value = currentMonthKey;

  wireEvents();
  render();
}

async function bootReads() {
  try {
    await fetchBudgetsForUser();

    const bid = pickActiveBudgetId();
    ss.activeBudgetId = bid;

    if (!bid) {
      delete state.budgets[currentMonthKey];
      return;
    }

    await refreshCurrentMonth();
  } catch (err) {
    console.error("Boot reads failed:", err);
    setTopError(err?.message || String(err));
  }
}

// -------------------- Supabase READS --------------------
async function fetchBudgetsForUser() {
  const { data, error } = await supa
    .from("budgets")
    .select("id,name,created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  ss.budgets = data || [];
  return ss.budgets;
}

function pickActiveBudgetId() {
  if (ss.activeBudgetId) return ss.activeBudgetId;
  if (!ss.budgets || !ss.budgets.length) return null;
  return ss.budgets[0].id; // most recent
}

async function fetchMonthBundle({ budgetId, monthKey }) {
  const m = await supa
    .from("months")
    .select("budget_id,month_key,income_cents")
    .eq("budget_id", budgetId)
    .eq("month_key", monthKey)
    .maybeSingle();

  if (m.error) throw m.error;
  ss.month = m.data || null;

  const cats = await supa
    .from("monthly_categories")
    .select("budget_id,month_key,category_key,name,budgeted_cents,sort_order,is_extra")
    .eq("budget_id", budgetId)
    .eq("month_key", monthKey)
    .order("sort_order", { ascending: true });

  if (cats.error) throw cats.error;
  ss.monthlyCategories = cats.data || [];

  const ex = await supa
    .from("monthly_expenses")
    .select("id,budget_id,month_key,category_key,vendor,item,amount_cents,expense_date,note,created_at")
    .eq("budget_id", budgetId)
    .eq("month_key", monthKey)
    .order("expense_date", { ascending: true });

  if (ex.error) throw ex.error;
  ss.monthlyExpenses = ex.data || [];

  return { month: ss.month, categories: ss.monthlyCategories, expenses: ss.monthlyExpenses };
}

function hydrateLocalMonthFromSupabase({ monthKey }) {
  if (!state) state = { budgets: {} };
  if (!state.budgets) state.budgets = {};

  if (!ss.month) {
    delete state.budgets[monthKey];
    return;
  }

  const b = {
    income: fromCents(ss.month.income_cents || 0),
    monthlyCategories: (ss.monthlyCategories || [])
      .slice()
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
      .filter((c) => !c.is_extra)
      .map((c) => ({
        id: c.category_key,
        name: c.name,
        budgeted: fromCents(c.budgeted_cents || 0),
        sort_order: Number(c.sort_order) || 0,
      })),
    // not used by monthly renderer; annual is rendered from computeAnnualView()
    annualCategories: [],
    expenses: (ss.monthlyExpenses || []).map((e) => ({
      id: e.id,
      type: "monthly",
      categoryId: e.category_key,
      vendor: e.vendor || "",
      item: e.item || "",
      amount: fromCents(e.amount_cents || 0),
      dateISO: e.expense_date || "",
      note: e.note || "",
    })),
  };

  state.budgets[monthKey] = b;
}

async function refreshCurrentMonth() {
  const bid = ss.activeBudgetId;
  if (!bid) return;

  // monthly
  await fetchMonthBundle({ budgetId: bid, monthKey: currentMonthKey });
  hydrateLocalMonthFromSupabase({ monthKey: currentMonthKey });

  // annual (year-context from current month)
  const year = yearFromMonthKey(currentMonthKey);
  await fetchAnnualBundle({ budgetId: bid });
  // annual is computed at render-time from ss.* and the active year
}

// -------------------- Annual READS --------------------
async function fetchAnnualBundle({ budgetId }) {
  // items: all for this budget
  const items = await supa
    .from("annual_items")
    .select("id,budget_id,type,year,name,target_cents,initial_cents,created_at,updated_at")
    .eq("budget_id", budgetId)
    .order("created_at", { ascending: true });

  if (items.error) throw items.error;
  ss.annualItems = items.data || [];

  // ledger: all for this budget
  const led = await supa
    .from("annual_ledger")
    .select("id,budget_id,annual_item_id,entry_type,amount_cents,entry_date,category_key,vendor,item,note,created_at,updated_at")
    .eq("budget_id", budgetId)
    .order("entry_date", { ascending: true });

  if (led.error) throw led.error;
  ss.annualLedger = led.data || [];
}

// -------------------- Annual VIEW (computed) --------------------
function computeAnnualView({ year }) {
  const items = ss.annualItems || [];
  const ledger = ss.annualLedger || [];

  const entriesByItem = new Map();
  for (const e of ledger) {
    const arr = entriesByItem.get(e.annual_item_id) || [];
    arr.push(e);
    entriesByItem.set(e.annual_item_id, arr);
  }

  const annualBudgets = [];
  const sinkingFunds = [];

  for (const it of items) {
    const type = String(it.type || "").trim();
    const itYear = it.year == null ? null : Number(it.year);
    const targetC = Number(it.target_cents) || 0;
    const initialC = Number(it.initial_cents) || 0;

    const allEntries = (entriesByItem.get(it.id) || [])
      .slice()
      .sort((a, b) => String(a.entry_date || "").localeCompare(String(b.entry_date || "")));

    if (type === "annual_budget") {
      if (itYear !== year) continue;

      const yearEntries = allEntries.filter((x) => yearFromISODate(x.entry_date) === year);

      const spentC = sumCents(
        yearEntries
          .filter((x) => String(x.entry_type || "").toLowerCase() === "expense")
          .map((x) => Number(x.amount_cents) || 0)
      );

      const contribC = sumCents(
        yearEntries
          .filter((x) => String(x.entry_type || "").toLowerCase() === "contribution")
          .map((x) => Number(x.amount_cents) || 0)
      );

      const totalAvailC = targetC + initialC + contribC;
      const leftC = totalAvailC - spentC;

      annualBudgets.push({
        id: it.id,
        name: it.name || "Unnamed",
        year: itYear,
        target_cents: targetC,
        initial_cents: initialC,
        spent_cents: spentC,
        total_available_cents: totalAvailC,
        left_cents: leftC,
        entries: yearEntries,
      });
      continue;
    }

    if (type === "sinking_fund") {
      // v0.73 behavior: year-scoped display/math with Jan snapshot
      const yearEntries = allEntries.filter((x) => yearFromISODate(x.entry_date) === year);

      const initialRow = yearEntries.find((x) => String(x.entry_type || "").toLowerCase() === "initial");
      const initialYearC = initialRow ? (Number(initialRow.amount_cents) || 0) : 0;

      const spentC = sumCents(
        yearEntries
          .filter((x) => String(x.entry_type || "").toLowerCase() === "expense")
          .map((x) => Number(x.amount_cents) || 0)
      );

      const contribC = sumCents(
        yearEntries
          .filter((x) => String(x.entry_type || "").toLowerCase() === "contribution")
          .map((x) => Number(x.amount_cents) || 0)
      );

      const balanceC = initialYearC + contribC - spentC;

      sinkingFunds.push({
        id: it.id,
        name: it.name || "Unnamed",
        target_cents: targetC,
        seed_initial_cents: initialC, // stored on item, used only for FIRST year snapshot creation
        year_initial_cents: initialYearC,
        balance_cents: balanceC,
        entries: yearEntries,
      });
      continue;
    }
  }

  return { annualBudgets, sinkingFunds };
}

// -------------------- Annual rollover helpers (ONLY on January creation) --------------------
async function ensureNewYearAnnualBudgetsCopied({ budgetId, year }) {
  const prevYear = year - 1;

  const prev = (ss.annualItems || []).filter(
    (x) => String(x.type) === "annual_budget" && Number(x.year) === prevYear
  );

  if (!prev.length) return;

  const exists = new Set(
    (ss.annualItems || [])
      .filter((x) => String(x.type) === "annual_budget" && Number(x.year) === year)
      .map((x) => String(x.name || "").trim().toLowerCase())
  );

  const toInsert = [];
  for (const p of prev) {
    const nm = String(p.name || "").trim();
    if (!nm) continue;
    const key = nm.toLowerCase();
    if (exists.has(key)) continue;

    toInsert.push({
      budget_id: budgetId,
      type: "annual_budget",
      year,
      name: nm,
      target_cents: Number(p.target_cents) || 0,
      initial_cents: 0, // copy target only (per your note)
    });
  }

  if (!toInsert.length) return;

  const { error } = await supa.from("annual_items").insert(toInsert);
  if (error) throw error;
}

async function ensureSinkingSnapshotsForYear({ budgetId, year }) {
  const sinking = (ss.annualItems || []).filter((x) => String(x.type) === "sinking_fund");
  if (!sinking.length) return;

  // For each sinking fund: if no "initial" entry in this year, create one.
  for (const it of sinking) {
    const hasThisYearInitial = (ss.annualLedger || []).some(
      (e) =>
        String(e.annual_item_id) === String(it.id) &&
        String(e.entry_type || "").toLowerCase() === "initial" &&
        yearFromISODate(e.entry_date) === year
    );

    if (hasThisYearInitial) continue;

    const amountC = await computeSinkingYearStartSnapshotCents({ annualItemId: it.id, year });

    const label = `Initial ${year} value`;

    // category_key is REQUIRED by your constraint; we set it to the fund itself by default
    const { error } = await supa.from("annual_ledger").insert({
      budget_id: budgetId,
      annual_item_id: it.id,
      entry_type: "initial",
      amount_cents: Math.round(Number(amountC) || 0),
      entry_date: `${year}-01-01`,
      category_key: String(it.id),
      vendor: null,
      item: label,
      note: label,
    });

    if (error) throw error;
  }
}

async function computeSinkingYearStartSnapshotCents({ annualItemId, year }) {
  const prevYear = year - 1;

  // If prior year had a snapshot, use prior-year ending balance as new snapshot.
  const prevYearEntries = (ss.annualLedger || []).filter(
    (e) => String(e.annual_item_id) === String(annualItemId) && yearFromISODate(e.entry_date) === prevYear
  );

  const prevInitial = prevYearEntries.find((e) => String(e.entry_type || "").toLowerCase() === "initial");
  const prevInitialC = prevInitial ? (Number(prevInitial.amount_cents) || 0) : null;

  if (prevInitialC != null) {
    const prevSpentC = sumCents(
      prevYearEntries
        .filter((e) => String(e.entry_type || "").toLowerCase() === "expense")
        .map((e) => Number(e.amount_cents) || 0)
    );
    const prevContribC = sumCents(
      prevYearEntries
        .filter((e) => String(e.entry_type || "").toLowerCase() === "contribution")
        .map((e) => Number(e.amount_cents) || 0)
    );
    return prevInitialC + prevContribC - prevSpentC;
  }

  // No prior snapshot exists: this is the first year using this sinking fund.
  // Use the seed starting balance stored on the annual item.
  const it = (ss.annualItems || []).find((x) => String(x.id) === String(annualItemId));
  return it ? (Number(it.initial_cents) || 0) : 0;
}

// -------------------- Annual WRITES --------------------
async function addAnnualItem() {
  const year = yearFromMonthKey(currentMonthKey);

  const r = await openPromptModal({
    title: "Add Annual Item",
    fields: [
      { key: "name", label: "Name", type: "text", value: "", span2: true },
      {
        key: "type",
        label: "Type",
        type: "select",
        value: "annual_budget",
        span2: true,
        options: [
          { value: "annual_budget", label: "Annual Budget" },
          { value: "sinking_fund", label: "Sinking Fund" },
        ],
      },
      { key: "year", label: "Year (Annual Budget only)", type: "text", value: String(year) },
      { key: "target", label: "Target / Goal", type: "text", value: "0.00" },
      { key: "initial", label: "Starting Balance (fund) / Initial (budget)", type: "text", value: "0.00" },
    ],
  });

  if (!r.ok) return;

  const name = (r.values.name || "").trim();
  if (!name) return;

  const type = (r.values.type || "").trim();
  if (type !== "annual_budget" && type !== "sinking_fund") {
    alert('Type must be "annual_budget" or "sinking_fund".');
    return;
  }

  const yrRaw = (r.values.year || "").trim();
  const yr = yrRaw ? Number(yrRaw) : null;

  if (type === "annual_budget" && (!yr || !Number.isFinite(yr))) {
    alert("Annual Budget requires a year.");
    return;
  }
  if (type === "sinking_fund" && yrRaw) {
    alert("Sinking Fund year must be blank (it rolls over via snapshots).");
    return;
  }

  const target = parseMoney(r.values.target || "0");
  const initial = parseMoney(r.values.initial || "0");

  const bid = ss.activeBudgetId;
  const { error } = await supa.from("annual_items").insert({
    budget_id: bid,
    type,
    year: type === "annual_budget" ? yr : null,
    name,
    target_cents: toCents(target),
    initial_cents: toCents(initial),
  });

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

async function addAnnualEntry({ annualItemId, entryType }) {
  const it = (ss.annualItems || []).find((x) => String(x.id) === String(annualItemId));
  if (!it) return;

  const year = yearFromMonthKey(currentMonthKey);

  const r = await openPromptModal({
    title: entryType === "expense" ? "Add Annual Expense" : "Add Annual Contribution",
    fields: [
      { key: "amount", label: "Amount", type: "text", value: "", span2: true },
      { key: "date", label: "Date", type: "date", value: todayISO(), span2: true },
      {
        key: "category_key",
        label: "Category (required)",
        type: "select",
        value: "",
        span2: true,
        options: buildCategoryOptionsForAnnualEntry(),
      },
      { key: "vendor", label: "Vendor", type: "text", value: "", span2: true },
      { key: "item", label: "Item", type: "text", value: "", span2: true },
      { key: "note", label: "Note", type: "text", value: "", span2: true },
    ],
  });

  if (!r.ok) return;

  const amount = parseMoney(r.values.amount || "0");
  if (!amount || toCents(amount) === 0) {
    alert("Amount must be non-zero.");
    return;
  }

  const entry_date = (r.values.date || "").trim();
  if (!entry_date) {
    alert("Date is required.");
    return;
  }

  const category_key = (r.values.category_key || "").trim();
  if (!category_key) {
    alert("Category is required.");
    return;
  }

  const bid = ss.activeBudgetId;
  const { error } = await supa.from("annual_ledger").insert({
    budget_id: bid,
    annual_item_id: annualItemId,
    entry_type: entryType,
    amount_cents: toCents(amount),
    entry_date,
    category_key,
    vendor: (r.values.vendor || "").trim() || null,
    item: (r.values.item || "").trim() || null,
    note: (r.values.note || "").trim() || null,
  });

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

async function editAnnualEntry(entryId) {
  const cur = (ss.annualLedger || []).find((x) => String(x.id) === String(entryId));
  if (!cur) return;

  const et = String(cur.entry_type || "").toLowerCase();
  if (et === "initial") {
    alert("This is a year-start snapshot. It only changes if you edit the Sinking Fund starting balance.");
    return;
  }

  const r = await openPromptModal({
    title: "Edit Annual Entry",
    fields: [
      { key: "entry_type", label: 'Type ("contribution" or "expense")', type: "text", value: cur.entry_type || "", span2: true },
      { key: "amount", label: "Amount", type: "text", value: fromCents(cur.amount_cents || 0).toFixed(2), span2: true },
      { key: "date", label: "Date", type: "date", value: cur.entry_date || todayISO(), span2: true },
      {
        key: "category_key",
        label: "Category (required)",
        type: "select",
        value: String(cur.category_key || ""),
        span2: true,
        options: buildCategoryOptionsForAnnualEntry(),
      },
      { key: "vendor", label: "Vendor", type: "text", value: cur.vendor || "", span2: true },
      { key: "item", label: "Item", type: "text", value: cur.item || "", span2: true },
      { key: "note", label: "Note", type: "text", value: cur.note || "", span2: true },
    ],
  });

  if (!r.ok) return;

  const entry_type = (r.values.entry_type || "").trim().toLowerCase();
  if (entry_type !== "contribution" && entry_type !== "expense") {
    alert('Entry type must be "contribution" or "expense".');
    return;
  }

  const amount = parseMoney(r.values.amount || "0");
  if (!amount || toCents(amount) === 0) {
    alert("Amount must be non-zero.");
    return;
  }

  const entry_date = (r.values.date || "").trim();
  if (!entry_date) {
    alert("Date is required.");
    return;
  }

  const category_key = (r.values.category_key || "").trim();
  if (!category_key) {
    alert("Category is required.");
    return;
  }

  const { error } = await supa
    .from("annual_ledger")
    .update({
      entry_type,
      amount_cents: toCents(amount),
      entry_date,
      category_key,
      vendor: (r.values.vendor || "").trim() || null,
      item: (r.values.item || "").trim() || null,
      note: (r.values.note || "").trim() || null,
    })
    .eq("id", entryId);

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

async function deleteAnnualEntry(entryId) {
  const cur = (ss.annualLedger || []).find((x) => String(x.id) === String(entryId));
  if (!cur) return;

  const et = String(cur.entry_type || "").toLowerCase();
  if (et === "initial") {
    alert("Year-start snapshot cannot be deleted.");
    return;
  }

  const ok = confirm("Delete this annual entry?");
  if (!ok) return;

  const { error } = await supa.from("annual_ledger").delete().eq("id", entryId);
  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

async function editAnnualItem(itemId) {
  const cur = (ss.annualItems || []).find((x) => String(x.id) === String(itemId));
  if (!cur) return;

  const isSinking = String(cur.type) === "sinking_fund";
  const year = yearFromMonthKey(currentMonthKey);

  const r = await openPromptModal({
    title: isSinking ? "Edit Sinking Fund" : "Edit Annual Budget",
    fields: [
      { key: "name", label: "Name", type: "text", value: cur.name || "", span2: true },
      { key: "target", label: isSinking ? "Goal" : "Target", type: "text", value: fromCents(cur.target_cents || 0).toFixed(2) },
      { key: "initial", label: isSinking ? "Starting Balance (seed)" : "Initial", type: "text", value: fromCents(cur.initial_cents || 0).toFixed(2) },
    ],
  });

  if (!r.ok) return;

  const name = (r.values.name || "").trim();
  if (!name) return;

  const target = parseMoney(r.values.target || "0");
  const initial = parseMoney(r.values.initial || "0");

  const { error } = await supa
    .from("annual_items")
    .update({
      name,
      target_cents: toCents(target),
      initial_cents: toCents(initial),
    })
    .eq("id", itemId);

  if (error) throw error;

  // IMPORTANT: if this is a sinking fund, changing starting balance should update THIS YEAR's snapshot (initial row)
  if (isSinking) {
    await refreshCurrentMonth();

    const initRow = (ss.annualLedger || []).find(
      (e) =>
        String(e.annual_item_id) === String(itemId) &&
        String(e.entry_type || "").toLowerCase() === "initial" &&
        yearFromISODate(e.entry_date) === year
    );

    if (initRow) {
      const { error: uerr } = await supa
        .from("annual_ledger")
        .update({
          amount_cents: toCents(initial),
          // keep label
        })
        .eq("id", initRow.id);

      if (uerr) throw uerr;
    } else {
      // If no snapshot exists yet for this year, create it (still only tied to editing, not month navigation)
      const bid = ss.activeBudgetId;
      const { error: ierr } = await supa.from("annual_ledger").insert({
        budget_id: bid,
        annual_item_id: itemId,
        entry_type: "initial",
        amount_cents: toCents(initial),
        entry_date: `${year}-01-01`,
        category_key: String(itemId),
        vendor: null,
        item: `Initial ${year} value`,
        note: `Initial ${year} value`,
      });
      if (ierr) throw ierr;
    }
  }

  await refreshCurrentMonth();
  render();
}

// -------------------- Budget/month WRITES --------------------
async function createBudgetViaRpc() {
  const name = (prompt("Budget name:") || "").trim();
  if (!name) return;

  const { error } = await supa.rpc("create_budget_for_current_user", { budget_name: name });
  if (error) throw error;

  await fetchBudgetsForUser();
  ss.activeBudgetId = pickActiveBudgetId();

  await refreshCurrentMonth();
  seedMonthSelect();
  render();
}

async function createMonth({ monthKey, copyPrev }) {
  const bid = ss.activeBudgetId;
  if (!bid) throw new Error("No active budget selected.");

  const income = parseMoney(incomeInput?.value || "0");
  const { error: insErr } = await supa.from("months").insert({
    budget_id: bid,
    month_key: monthKey,
    income_cents: toCents(income),
  });
  if (insErr) throw insErr;

  if (copyPrev) {
    const prevKey = addMonths(monthKey, -1);
    const prev = await supa
      .from("monthly_categories")
      .select("category_key,name,budgeted_cents,sort_order,is_extra")
      .eq("budget_id", bid)
      .eq("month_key", prevKey)
      .order("sort_order", { ascending: true });

    if (prev.error) throw prev.error;

    const rows = (prev.data || [])
      .filter((c) => !c.is_extra && c.category_key !== EXTRA_ID)
      .map((c) => ({
        budget_id: bid,
        month_key: monthKey,
        category_key: c.category_key,
        name: c.name,
        budgeted_cents: c.budgeted_cents || 0,
        sort_order: c.sort_order || 0,
        is_extra: false,
      }));

    if (rows.length) {
      const { error: catErr } = await supa.from("monthly_categories").insert(rows);
      if (catErr) throw catErr;
    }
  }

  // ONLY when January is created, do annual rollover tasks
  const y = yearFromMonthKey(monthKey);
  const m = String(monthKey).slice(5, 7);
  if (m === "01") {
    // refresh annual items/ledger once before copying/snapshotting
    await fetchAnnualBundle({ budgetId: bid });

    await ensureNewYearAnnualBudgetsCopied({ budgetId: bid, year: y });

    // refresh again so snapshots see newly created budgets as well (not strictly needed, but keeps ss consistent)
    await fetchAnnualBundle({ budgetId: bid });

    await ensureSinkingSnapshotsForYear({ budgetId: bid, year: y });

    // refresh annual after writes
    await fetchAnnualBundle({ budgetId: bid });
  }

  await refreshCurrentMonth();
  render();
}

async function updateIncome() {
  const bid = ss.activeBudgetId;
  if (!bid) return;
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const income = parseMoney(incomeInput?.value || "0");
  const { error } = await supa
    .from("months")
    .update({ income_cents: toCents(income) })
    .eq("budget_id", bid)
    .eq("month_key", currentMonthKey);

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

// -------------------- Category modal helper --------------------
function openPromptModal({ title, fields }) {
  return new Promise((resolve) => {
    // Fallback to window.prompt if modal elements are missing
    if (!promptModal || !promptTitle || !promptFields || !promptOkBtn || !promptCancelBtn) {
      const out = {};
      for (const f of fields) {
        if (f.type === "select") {
          // crude fallback: show labels
          const opts = (f.options || []).map((o) => `${o.value}`).join(", ");
          out[f.key] = prompt(`${f.label}\nOptions: ${opts}`, f.value ?? "") ?? "";
        } else {
          out[f.key] = prompt(f.label, f.value ?? "") ?? "";
        }
      }
      return resolve({ ok: true, values: out });
    }

    promptTitle.textContent = title || "Enter values";

    promptFields.innerHTML = fields
      .map((f) => {
        const span = f.span2 ? " field-span-2" : "";
        const type = f.type || "text";
        const val = f.value ?? "";
        const ph = f.placeholder ?? "";

        if (type === "select") {
          const opts = (f.options || []).map((o) => {
            const sel = String(o.value) === String(val) ? "selected" : "";
            return `<option value="${escapeAttr(o.value)}" ${sel}>${escapeHtml(o.label)}</option>`;
          }).join("");
          return `
            <label class="field${span}">
              <span>${escapeHtml(f.label)}</span>
              <select class="select" id="pm_${escapeAttr(f.key)}">${opts}</select>
            </label>
          `;
        }

        if (type === "date") {
          return `
            <label class="field${span}">
              <span>${escapeHtml(f.label)}</span>
              <input class="input" id="pm_${escapeAttr(f.key)}" type="date" value="${escapeAttr(val)}" />
            </label>
          `;
        }

        return `
          <label class="field${span}">
            <span>${escapeHtml(f.label)}</span>
            <input
              class="input"
              id="pm_${escapeAttr(f.key)}"
              type="${escapeAttr(type)}"
              value="${escapeAttr(val)}"
              placeholder="${escapeAttr(ph)}"
            />
          </label>
        `;
      })
      .join("");

    openModal(promptModal);

    const first = promptFields.querySelector("input,select");
    if (first) setTimeout(() => first.focus(), 0);

    const cleanup = () => {
      promptOkBtn.onclick = null;
      promptCancelBtn.onclick = null;
      if (closePromptModalBtn) closePromptModalBtn.onclick = null;
    };

    const cancel = () => {
      cleanup();
      closeModal(promptModal);
      resolve({ ok: false, values: null });
    };

    promptCancelBtn.onclick = cancel;
    if (closePromptModalBtn) closePromptModalBtn.onclick = cancel;

    promptOkBtn.onclick = () => {
      const values = {};
      for (const f of fields) {
        const el = document.getElementById(`pm_${f.key}`);
        values[f.key] = (el?.value ?? "").trim();
      }
      cleanup();
      closeModal(promptModal);
      resolve({ ok: true, values });
    };
  });
}

// -------------------- Monthly category writes --------------------
async function addMonthlyCategory() {
  const bid = ss.activeBudgetId;
  if (!bid) throw new Error("No active budget selected.");
  const b = getBudget(currentMonthKey);
  if (!b) throw new Error("Create the month first.");

  const r = await openPromptModal({
    title: "Add Monthly Category",
    fields: [
      { key: "name", label: "Category name", type: "text", value: "", span2: true },
      { key: "budgeted", label: "Budgeted", type: "text", value: "0.00" },
    ],
  });

  if (!r.ok) return;

  const name = (r.values.name || "").trim();
  if (!name) return;

  const budgeted = parseMoney(r.values.budgeted || "0");

  let keyBase = slugKey(name);
  if (!keyBase || keyBase === EXTRA_ID) keyBase = "cat";
  let key = keyBase;

  const existing = new Set((ss.monthlyCategories || []).map((c) => c.category_key));
  let i = 2;
  while (existing.has(key) || key === EXTRA_ID) key = `${keyBase}_${i++}`;

  const maxSort = Math.max(
    0,
    ...(ss.monthlyCategories || []).filter((c) => !c.is_extra).map((c) => Number(c.sort_order) || 0)
  );
  const sort_order = maxSort + 10;

  const { error } = await supa.from("monthly_categories").insert({
    budget_id: bid,
    month_key: currentMonthKey,
    category_key: key,
    name,
    budgeted_cents: toCents(budgeted),
    sort_order,
    is_extra: false,
  });

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

async function editMonthlyCategory(catId) {
  const bid = ss.activeBudgetId;
  if (!bid) throw new Error("No active budget selected.");
  if (catId === EXTRA_ID) return;

  const cur = (ss.monthlyCategories || []).find((c) => c.category_key === catId);
  if (!cur) return;

  const r = await openPromptModal({
    title: "Edit Monthly Category",
    fields: [
      { key: "name", label: "Category name", type: "text", value: cur.name || "", span2: true },
      { key: "budgeted", label: "Budgeted", type: "text", value: fromCents(cur.budgeted_cents || 0).toFixed(2) },
    ],
  });

  if (!r.ok) return;

  const name = (r.values.name || "").trim();
  if (!name) return;

  const budgeted = parseMoney(r.values.budgeted || "0");

  const { error } = await supa
    .from("monthly_categories")
    .update({ name, budgeted_cents: toCents(budgeted) })
    .eq("budget_id", bid)
    .eq("month_key", currentMonthKey)
    .eq("category_key", catId);

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

async function deleteMonthlyCategory(catId) {
  const bid = ss.activeBudgetId;
  if (!bid) throw new Error("No active budget selected.");
  if (catId === EXTRA_ID) return;

  const ok = confirm("Delete this category? Its expenses will be moved to Extra.");
  if (!ok) return;

  const { error } = await supa
    .from("monthly_categories")
    .delete()
    .eq("budget_id", bid)
    .eq("month_key", currentMonthKey)
    .eq("category_key", catId);

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

// -------------------- Expense writes (monthly) --------------------
async function insertMonthlyExpense(payload) {
  const bid = ss.activeBudgetId;
  if (!bid) throw new Error("No active budget selected.");

  const { error } = await supa.from("monthly_expenses").insert({
    budget_id: bid,
    month_key: currentMonthKey,
    category_key: payload.category_key,
    vendor: payload.vendor,
    item: payload.item,
    amount_cents: payload.amount_cents,
    expense_date: payload.expense_date,
    note: payload.note || null,
  });

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

async function updateMonthlyExpense(expenseId, payload) {
  const bid = ss.activeBudgetId;
  if (!bid) throw new Error("No active budget selected.");

  const { error } = await supa
    .from("monthly_expenses")
    .update({
      category_key: payload.category_key,
      vendor: payload.vendor,
      item: payload.item,
      amount_cents: payload.amount_cents,
      expense_date: payload.expense_date,
      note: payload.note || null,
    })
    .eq("budget_id", bid)
    .eq("month_key", currentMonthKey)
    .eq("id", expenseId);

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

async function deleteMonthlyExpense(expenseId) {
  const bid = ss.activeBudgetId;
  if (!bid) throw new Error("No active budget selected.");

  const ok = confirm("Delete this expense?");
  if (!ok) return;

  const { error } = await supa
    .from("monthly_expenses")
    .delete()
    .eq("budget_id", bid)
    .eq("month_key", currentMonthKey)
    .eq("id", expenseId);

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

// -------------------- Expense writes (annual via global modal) --------------------
async function insertAnnualExpenseFromModal({ annualItemId, categoryKey, payload }) {
  const bid = ss.activeBudgetId;
  if (!bid) throw new Error("No active budget selected.");

  const { error } = await supa.from("annual_ledger").insert({
    budget_id: bid,
    annual_item_id: annualItemId,
    entry_type: "expense",
    amount_cents: payload.amount_cents,
    entry_date: payload.expense_date,
    category_key: categoryKey,
    vendor: payload.vendor || null,
    item: payload.item || null,
    note: payload.note || null,
  });

  if (error) throw error;

  await refreshCurrentMonth();
  render();
}

// -------------------- Version --------------------
async function loadVersionBadge() {
  const badge = document.getElementById("versionBadge");
  if (!badge) return;

  try {
    const res = await fetch("./VERSION.txt", { cache: "no-store" });
    if (!res.ok) throw new Error("Bad response");
    const txt = (await res.text()).trim();
    badge.textContent = txt || APP_FALLBACK_VERSION;
  } catch {
    badge.textContent = APP_FALLBACK_VERSION;
  }
}

// -------------------- Events --------------------
function wireEvents() {
  prevMonthBtn?.addEventListener("click", async () => await setMonth(addMonths(currentMonthKey, -1)));
  nextMonthBtn?.addEventListener("click", async () => await setMonth(addMonths(currentMonthKey, +1)));
  monthSelect?.addEventListener("change", async () => await setMonth(monthSelect.value));

  createMonthBtn?.addEventListener("click", async () => {
    try {
      await createMonth({ monthKey: currentMonthKey, copyPrev: !!copyPrevCheckbox?.checked });
    } catch (e) {
      setTopError(e?.message || String(e));
      alert(e?.message || e);
    }
  });

  addExpenseBtn?.addEventListener("click", () => {
    const b = getBudget(currentMonthKey);
    if (!b) return alert("Create the month first.");
    openExpenseModal({ mode: "add" });
  });

  incomeInput?.addEventListener("focus", () => incomeInput.select());
  incomeInput?.addEventListener("click", () => incomeInput.select());

  incomeInput?.addEventListener("blur", async () => {
    try {
      const b = getBudget(currentMonthKey);
      if (!b) return;
      await updateIncome();
    } catch (e) {
      setTopError(e?.message || String(e));
      alert(e?.message || e);
    }
  });

  addMonthlyCategoryBtn?.addEventListener("click", async () => {
    try {
      await addMonthlyCategory();
    } catch (e) {
      setTopError(e?.message || String(e));
      alert(e?.message || e);
    }
  });

  addAnnualCategoryBtn?.addEventListener("click", async () => {
    try {
      await addAnnualItem();
    } catch (e) {
      setTopError(e?.message || String(e));
      alert(e?.message || e);
    }
  });

  closeExpenseModalBtn?.addEventListener("click", () => closeModal(expenseModal));
  expenseModal?.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeModal(expenseModal);
  });

  saveExpenseBtn?.addEventListener("click", async () => {
    try {
      await saveExpense(false);
    } catch (e) {
      setTopError(e?.message || String(e));
      alert(e?.message || e);
    }
  });

  saveAndAddAnotherBtn?.addEventListener("click", async () => {
    try {
      await saveExpense(true);
    } catch (e) {
      setTopError(e?.message || String(e));
      alert(e?.message || e);
    }
  });
}

async function setMonth(monthKey) {
  currentMonthKey = monthKey;
  expanded = { type: null, id: null };

  if (monthSelect) monthSelect.value = currentMonthKey;

  const bid = ss.activeBudgetId;
  if (bid) {
    try {
      await refreshCurrentMonth();
      seedMonthSelect();
    } catch (err) {
      console.error("Month read failed:", err);
      setTopError(err?.message || String(err));
      delete state.budgets[monthKey];
    }
  }

  render();
}

// -------------------- Rendering --------------------
function render() {
  if (!state || !currentMonthKey) return;

  seedMonthSelect();
  if (monthSelect) monthSelect.value = currentMonthKey;

  renderTopBudgetState();

  const b = getBudget(currentMonthKey);
  if (!b) {
    monthMissingState?.classList.remove("hidden");
    monthExistsState?.classList.add("hidden");

    if (copyPrevCheckbox) copyPrevCheckbox.disabled = false;
    if (createMonthBtn) createMonthBtn.disabled = false;
    return;
  }

  monthMissingState?.classList.add("hidden");
  monthExistsState?.classList.remove("hidden");

  if (incomeInput) {
    incomeInput.disabled = false;
    incomeInput.value = moneyToInput(b.income);
  }

  if (addExpenseBtn) addExpenseBtn.disabled = false;
  if (addMonthlyCategoryBtn) addMonthlyCategoryBtn.disabled = false;
  if (addAnnualCategoryBtn) addAnnualCategoryBtn.disabled = false;

  renderTotalsOnly();
  renderMonthlyTable();
  renderAnnualTables();
  refreshExpenseCategoryDropdown();
}

function renderTopBudgetState() {
  const ae = document.getElementById("authError");
  if (!ae) return;

  if (!ss.budgets.length) {
    ae.innerHTML = `
      <div class="row row-wrap row-gap" style="justify-content:space-between; align-items:center;">
        <div class="cell-muted">No budgets yet for this user.</div>
        <button class="btn btn-primary" id="btnCreateBudget" type="button">Create Budget</button>
      </div>
    `;
    document.getElementById("btnCreateBudget")?.addEventListener("click", async () => {
      try {
        await createBudgetViaRpc();
        setTopError("");
      } catch (e) {
        setTopError(e?.message || String(e));
        alert(e?.message || e);
      }
    });
  }
}

function setTopError(msg) {
  const ae = document.getElementById("authError");
  if (!ae) return;
  if (!msg) {
    if (ss.budgets.length) ae.textContent = "";
    return;
  }
  ae.textContent = msg;
}

function renderTotalsOnly() {
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const incomeC = toCents(b.income);
  const monthlyBudgetedC = sumCents((b.monthlyCategories || []).map((c) => toCents(c.budgeted)));
  const monthlySpentC = sumCents(getMonthExpenses(b, "monthly").map((x) => toCents(x.amount)));

  const plannedC = incomeC - monthlyBudgetedC;
  const leftC = incomeC - monthlySpentC;

  if (plannedRemainingEl) {
    plannedRemainingEl.textContent = fmtMoneyNoCents(fromCents(plannedC));
    plannedRemainingEl.className = "stat-value " + (plannedC < 0 ? "negative" : "positive");
  }
  if (leftToSpendEl) {
    leftToSpendEl.textContent = fmtMoneyNoCents(fromCents(leftC));
    leftToSpendEl.className = "stat-value " + (leftC < 0 ? "negative" : "positive");
  }
}

function renderMonthlyTable() {
  const b = getBudget(currentMonthKey);
  if (!b || !monthlyTable) return;

  const expenses = getMonthExpenses(b, "monthly");

  const header = `
    <div class="thead listgrid">
      <div>Category</div>
      <div style="text-align:right;">${amountMode === "left" ? "Left / Total" : "Spent / Total"}</div>
      <div style="text-align:right;">&nbsp;</div>
    </div>
  `;

  const rows = [];
  (b.monthlyCategories || []).forEach((c) =>
    rows.push({ id: c.id, name: c.name, total: c.budgeted, kind: "normal" })
  );

  const extraSpentC = sumCents(expenses.filter((e) => e.categoryId === EXTRA_ID).map((e) => toCents(e.amount)));
  if (extraSpentC !== 0) rows.push({ id: EXTRA_ID, name: EXTRA_NAME, total: 0, kind: "extra" });

  if (!rows.length) {
    monthlyTable.innerHTML = header + emptyRow("No monthly categories for this month.");
    return;
  }

  let html = header;

  rows.forEach((cat) => {
    const catExpenses = expenses.filter((e) => e.categoryId === cat.id);
    const spentC = sumCents(catExpenses.map((e) => toCents(e.amount)));
    const totalC = toCents(cat.total || 0);
    const leftC = totalC - spentC;

    const line =
      amountMode === "left"
        ? `${fmtMoneyNoCents(fromCents(leftC))} / ${fmtMoneyNoCents(fromCents(totalC))}`
        : `${fmtMoneyNoCents(fromCents(spentC))} / ${fmtMoneyNoCents(fromCents(totalC))}`;

    const lineClass = amountMode === "left" && leftC < 0 ? "negative" : "";

    const pctRemain = remainingPct(leftC, totalC);
    const ringColor = remainingTone(leftC, totalC);

    const isOpen = expanded.type === "monthly" && expanded.id === cat.id;

    html += `
      <div class="trow listgrid" data-toggle="monthly:${cat.id}">
        <div class="catcell">
          <span class="chev ${isOpen ? "open" : ""}">›</span>
          <div style="min-width:0;">
            <div class="catname">${escapeHtml(cat.name)}</div>
            ${cat.kind === "extra" ? `<div class="catsub">Hidden uncategorized. Reassign these.</div>` : ``}
          </div>
        </div>

        <button class="amountbtn" data-toggle-amount="1" type="button" aria-label="Toggle amount mode">
          <div class="amountline money ${lineClass}">${escapeHtml(line)}</div>
        </button>

        <div class="ring" style="${ringStyle(pctRemain, ringColor)}"></div>
      </div>

      <div class="detail-row">
        <div class="detail-anim ${isOpen ? "open" : ""}">
          <div class="detail-inner">
            <div class="detail-muted">${monthKeyToLabel(currentMonthKey)} • Monthly</div>

            <div class="row row-wrap row-gap">
              ${cat.kind !== "extra" ? `<button class="btn btn-primary" data-add-exp="monthly:${cat.id}">+ Add Expense</button>` : ``}
              ${cat.kind !== "extra" ? `<button class="btn btn-secondary" data-edit-cat="monthly:${cat.id}">Edit Category</button>` : ``}
              ${cat.kind !== "extra" ? `<button class="btn btn-ghost" data-del-cat="monthly:${cat.id}">Delete Category</button>` : ``}
            </div>

            ${
              catExpenses.length
                ? `<div class="detail-list">
                    ${catExpenses
                      .slice()
                      .sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""))
                      .map((ex) => inlineExpenseCardHtml(ex))
                      .join("")}
                  </div>`
                : `<div class="cell-muted">No expenses in this category this month.</div>`
            }
          </div>
        </div>
      </div>
    `;
  });

  monthlyTable.innerHTML = html;

  bindListInteractions(monthlyTable);
  bindExpenseCardActions(monthlyTable);
}

function renderAnnualTables() {
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const year = yearFromMonthKey(currentMonthKey);
  const view = computeAnnualView({ year });

  // -------- Annual Budgets --------
  if (annualBudgetTable) {
    const header = `
      <div class="thead listgrid">
        <div>Category</div>
        <div style="text-align:right;">${amountMode === "left" ? "Left / Total" : "Spent / Total"}</div>
        <div style="text-align:right;">&nbsp;</div>
      </div>
    `;

    if (!view.annualBudgets.length) {
      annualBudgetTable.innerHTML = header + emptyRow("No annual budgets for this year.");
    } else {
      let html = header;

      for (const it of view.annualBudgets) {
        const spentC = Number(it.spent_cents) || 0;
        const totalC = Number(it.total_available_cents) || 0;
        const leftC = Number(it.left_cents) || (totalC - spentC);

        const line =
          amountMode === "left"
            ? `${fmtMoneyNoCents(fromCents(leftC))} / ${fmtMoneyNoCents(fromCents(totalC))}`
            : `${fmtMoneyNoCents(fromCents(spentC))} / ${fmtMoneyNoCents(fromCents(totalC))}`;

        const lineClass = amountMode === "left" && leftC < 0 ? "negative" : "";
        const pctRemain = remainingPct(leftC, totalC);
        const ringColor = remainingTone(leftC, totalC);

        const isOpen = expanded.type === "annual_budget" && expanded.id === it.id;

        html += `
          <div class="trow listgrid" data-toggle="annual_budget:${it.id}">
            <div class="catcell">
              <span class="chev ${isOpen ? "open" : ""}">›</span>
              <div style="min-width:0;">
                <div class="catname">${escapeHtml(it.name)}</div>
                <div class="catsub">Target: ${escapeHtml(fmtMoneyNoCents(fromCents(it.target_cents || 0)))}</div>
              </div>
            </div>

            <button class="amountbtn" data-toggle-amount="1" type="button" aria-label="Toggle amount mode">
              <div class="amountline money ${lineClass}">${escapeHtml(line)}</div>
            </button>

            <div class="ring" style="${ringStyle(pctRemain, ringColor)}"></div>
          </div>

          <div class="detail-row">
            <div class="detail-anim ${isOpen ? "open" : ""}">
              <div class="detail-inner">
                <div class="row row-wrap row-gap">
                  <button class="btn btn-primary" data-add-annual-entry="contribution:${it.id}">+ Contribution</button>
                  <button class="btn btn-primary" data-add-annual-entry="expense:${it.id}">+ Expense</button>
                  <button class="btn btn-secondary" data-edit-annual-item="${it.id}">Edit</button>
                </div>

                ${
                  (it.entries || []).length
                    ? `<div class="detail-list">
                        ${(it.entries || [])
                          .slice()
                          .sort((a, b) => String(a.entry_date || "").localeCompare(String(b.entry_date || "")))
                          .map((e) => annualEntryCardHtml(e))
                          .join("")}
                      </div>`
                    : `<div class="cell-muted">No entries for this annual budget yet.</div>`
                }
              </div>
            </div>
          </div>
        `;
      }

      annualBudgetTable.innerHTML = html;
      bindListInteractions(annualBudgetTable);
      bindAnnualActions(annualBudgetTable);
    }
  }

  // -------- Sinking Funds --------
  if (sinkingFundTable) {
    const header = `
      <div class="thead listgrid">
        <div>Category</div>
        <div style="text-align:right;">Balance</div>
        <div style="text-align:right;">&nbsp;</div>
      </div>
    `;

    if (!view.sinkingFunds.length) {
      sinkingFundTable.innerHTML = header + emptyRow("No sinking funds yet.");
    } else {
      let html = header;

      for (const it of view.sinkingFunds) {
        const balC = Number(it.balance_cents) || 0;
        const goalC = Number(it.target_cents) || 0;

        const pct = goalC > 0 ? clamp01(balC / goalC) : balC > 0 ? 1 : 0;
        const ringColor = balC < 0 ? "bad" : pct >= 1 ? "accent" : pct >= 0.35 ? "warn" : "bad";

        const isOpen = expanded.type === "sinking_fund" && expanded.id === it.id;

        html += `
          <div class="trow listgrid" data-toggle="sinking_fund:${it.id}">
            <div class="catcell">
              <span class="chev ${isOpen ? "open" : ""}">›</span>
              <div style="min-width:0;">
                <div class="catname">${escapeHtml(it.name)}</div>
                ${goalC ? `<div class="catsub">Goal: ${escapeHtml(fmtMoneyNoCents(fromCents(goalC)))}</div>` : ``}
              </div>
            </div>

            <div class="amountline money ${balC < 0 ? "negative" : ""}" style="text-align:right;">
              ${escapeHtml(fmtMoneyNoCents(fromCents(balC)))}
            </div>

            <div class="ring" style="${ringStyle(pct, ringColor)}"></div>
          </div>

          <div class="detail-row">
            <div class="detail-anim ${isOpen ? "open" : ""}">
              <div class="detail-inner">
                <div class="detail-muted">${String(year)} • Sinking Fund</div>

                <div class="row row-wrap row-gap">
                  <button class="btn btn-primary" data-add-annual-entry="contribution:${it.id}">+ Contribution</button>
                  <button class="btn btn-primary" data-add-annual-entry="expense:${it.id}">+ Expense</button>
                  <button class="btn btn-secondary" data-edit-annual-item="${it.id}">Edit</button>
                </div>

                ${
                  (it.entries || []).length
                    ? `<div class="detail-list">
                        ${(it.entries || [])
                          .slice()
                          .sort((a, b) => String(a.entry_date || "").localeCompare(String(b.entry_date || "")))
                          .map((e) => annualEntryCardHtml(e))
                          .join("")}
                      </div>`
                    : `<div class="cell-muted">No entries for this sinking fund yet this year.</div>`
                }
              </div>
            </div>
          </div>
        `;
      }

      sinkingFundTable.innerHTML = html;
      bindListInteractions(sinkingFundTable);
      bindAnnualActions(sinkingFundTable);
    }
  }
}

// -------------------- Annual UI actions --------------------
function bindAnnualActions(container) {
  if (!container) return;

  container.querySelectorAll("[data-add-annual-entry]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const [entryType, itemId] = btn.dataset.addAnnualEntry.split(":");
      try {
        await addAnnualEntry({ annualItemId: itemId, entryType });
      } catch (err) {
        setTopError(err?.message || String(err));
        alert(err?.message || err);
      }
    });
  });

  container.querySelectorAll("[data-edit-annual-item]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await editAnnualItem(btn.dataset.editAnnualItem);
      } catch (err) {
        setTopError(err?.message || String(err));
        alert(err?.message || err);
      }
    });
  });

  container.querySelectorAll("[data-edit-annual-entry]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await editAnnualEntry(btn.dataset.editAnnualEntry);
      } catch (err) {
        setTopError(err?.message || String(err));
        alert(err?.message || err);
      }
    });
  });

  container.querySelectorAll("[data-del-annual-entry]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await deleteAnnualEntry(btn.dataset.delAnnualEntry);
      } catch (err) {
        setTopError(err?.message || String(err));
        alert(err?.message || err);
      }
    });
  });
}

function annualEntryCardHtml(e) {
  const type = String(e.entry_type || "").toLowerCase();
  const isExpense = type === "expense";
  const isInitial = type === "initial";
  const amt = fromCents(Number(e.amount_cents) || 0);

  const title =
    `${escapeHtml(e.vendor || "")}${e.item ? " • " + escapeHtml(e.item) : ""}`.trim() ||
    (isInitial ? "Year Start Snapshot" : "(No vendor/item)");

  const note = e.note ? escapeHtml(e.note) : "";
  const date = e.entry_date ? escapeHtml(e.entry_date) : "";
  const tag = isInitial ? "Initial" : isExpense ? "Expense" : "Contribution";

  return `
    <div class="detail-card">
      <div class="detail-card-top">
        <div>
          <div class="exp-main">${title}</div>
          ${note ? `<div class="exp-sub">${note}</div>` : ``}
          <div class="exp-sub">${date} • ${tag}</div>
        </div>
        <div class="money ${isExpense ? "negative" : ""}">${fmtMoney(amt)}</div>
      </div>
      <div class="detail-actions">
        ${isInitial ? `` : `<button class="icon-btn" data-edit-annual-entry="${escapeAttr(e.id)}">Edit</button>`}
        ${isInitial ? `` : `<button class="icon-btn" data-del-annual-entry="${escapeAttr(e.id)}">Delete</button>`}
      </div>
    </div>
  `;
}

// -------------------- List interactions --------------------
function bindListInteractions(container) {
  if (!container) return;

  container.querySelectorAll("[data-toggle]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const [type, id] = row.dataset.toggle.split(":");
      expanded = expanded.type === type && expanded.id === id ? { type: null, id: null } : { type, id };
      render();
    });
  });

  container.querySelectorAll("[data-toggle-amount]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.toggleAmount !== "1") return;
      amountMode = amountMode === "left" ? "spent" : "left";
      render();
    });
  });

  container.querySelectorAll("[data-add-exp]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const [scope, id] = btn.dataset.addExp.split(":");
      if (scope === "monthly") openExpenseModal({ mode: "add", preset: `monthly:${id}` });
      else openExpenseModal({ mode: "add", preset: `annual:${id}` });
    });
  });

  container.querySelectorAll("[data-edit-cat]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const [type, id] = btn.dataset.editCat.split(":");
      if (type !== "monthly") return;
      try {
        await editMonthlyCategory(id);
      } catch (err) {
        setTopError(err?.message || String(err));
        alert(err?.message || err);
      }
    });
  });

  container.querySelectorAll("[data-del-cat]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const [type, id] = btn.dataset.delCat.split(":");
      if (type !== "monthly") return;
      try {
        await deleteMonthlyCategory(id);
      } catch (err) {
        setTopError(err?.message || String(err));
        alert(err?.message || err);
      }
    });
  });
}

// -------------------- Expense modal (unified monthly + annual) --------------------
function openExpenseModal({ mode, preset = null, expense = null } = {}) {
  if (!expenseModal) return;

  editingExpense = null;

  const b = getBudget(currentMonthKey);
  if (!b) return alert("Create the month first.");

  refreshExpenseCategoryDropdown();

  if (mode === "edit" && expense) {
    // only supports editing monthly expenses here
    editingExpense = { id: expense.id, mode: "edit", scope: "monthly" };
    expenseModalTitle.textContent = "Edit Expense";
    expVendor.value = expense.vendor || "";
    expItem.value = expense.item || "";
    expAmount.value = moneyToInput(expense.amount || 0);
    expDate.value = expense.dateISO || todayISO();
    expNote.value = expense.note || "";
    // monthly dropdown uses raw key
    expCategory.value = `monthly:${expense.categoryId}`;
  } else {
    editingExpense = { id: null, mode: "add", scope: "monthly" };
    expenseModalTitle.textContent = "Add Expense";
    expVendor.value = "";
    expItem.value = "";
    expAmount.value = "";
    expDate.value = todayISO();
    expNote.value = "";

    if (preset && expCategory.querySelector(`option[value="${cssEscape(preset)}"]`)) {
      expCategory.value = preset;
    } else {
      expCategory.selectedIndex = 0;
    }
  }

  openModal(expenseModal);
  setTimeout(() => expVendor?.focus(), 0);
}

async function saveExpense(addAnother) {
  const b = getBudget(currentMonthKey);
  if (!b) throw new Error("Create the month first.");

  const vendor = (expVendor?.value || "").trim();
  const item = (expItem?.value || "").trim();
  const amount = parseMoney(expAmount?.value || "");
  const dateISO = expDate?.value || "";
  const scopeVal = expCategory?.value || "";
  const note = (expNote?.value || "").trim();

  if (!vendor) throw new Error("Vendor is required.");
  if (!item) throw new Error("Item is required.");
  if (!dateISO) throw new Error("Date is required.");
  if (!scopeVal) throw new Error("Category is required.");
  if (!amount || toCents(amount) === 0) throw new Error("Amount must be non-zero.");

  const payload = {
    vendor,
    item,
    amount_cents: toCents(amount),
    expense_date: dateISO,
    note,
  };

  // value is "monthly:catKey" OR "annual:itemId"
  const [scope, key] = scopeVal.split(":");

  if (editingExpense?.mode === "edit" && editingExpense.id) {
    // monthly edit only
    if (scope !== "monthly") throw new Error("Editing is only supported for monthly expenses in this modal.");
    if (key === EXTRA_ID) throw new Error("Extra cannot be selected.");
    await updateMonthlyExpense(editingExpense.id, { ...payload, category_key: key });
  } else {
    if (scope === "monthly") {
      if (key === EXTRA_ID) throw new Error("Extra cannot be selected.");
      await insertMonthlyExpense({ ...payload, category_key: key });
    } else if (scope === "annual") {
      // annual expense requires a separate category_key (for guard + reporting)
      const pick = await openPromptModal({
        title: "Annual Expense Category",
        fields: [
          {
            key: "category_key",
            label: "Category (required)",
            type: "select",
            value: "",
            span2: true,
            options: buildCategoryOptionsForAnnualEntry(),
          },
        ],
      });
      if (!pick.ok) return;

      const category_key = (pick.values.category_key || "").trim();
      if (!category_key) throw new Error("Category is required.");

      await insertAnnualExpenseFromModal({
        annualItemId: key,
        categoryKey: category_key,
        payload,
      });
    } else {
      throw new Error("Invalid category selection.");
    }
  }

  if (addAnother) {
    openExpenseModal({ mode: "add", preset: scopeVal });
  } else {
    closeModal(expenseModal);
  }
}

function refreshExpenseCategoryDropdown() {
  const b = getBudget(currentMonthKey);
  if (!b || !expCategory) return;

  const opts = [];

  // Monthly categories
  const cats = (b.monthlyCategories || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  for (const c of cats) {
    if (c.id === EXTRA_ID) continue; // never selectable
    opts.push({ value: `monthly:${c.id}`, label: `(Monthly) ${c.name}` });
  }

  // Annual items
  for (const it of (ss.annualItems || [])) {
    const t = String(it.type || "");
    if (t === "annual_budget") {
      const y = Number(it.year);
      if (y !== yearFromMonthKey(currentMonthKey)) continue; // only current-year budgets
      opts.push({ value: `annual:${it.id}`, label: `(Annual Budget) ${it.name}` });
    } else if (t === "sinking_fund") {
      opts.push({ value: `annual:${it.id}`, label: `(Sinking Fund) ${it.name}` });
    }
  }

  expCategory.innerHTML = opts.map((o) => `<option value="${escapeAttr(o.value)}">${escapeHtml(o.label)}</option>`).join("");
}

// -------------------- Expense cards (monthly only) --------------------
function bindExpenseCardActions(container) {
  if (!container) return;

  container.querySelectorAll("[data-del-exp]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await deleteMonthlyExpense(btn.dataset.delExp);
      } catch (err) {
        setTopError(err?.message || String(err));
        alert(err?.message || err);
      }
    });
  });

  container.querySelectorAll("[data-edit-exp]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.editExp;
      const b = getBudget(currentMonthKey);
      const ex = (b?.expenses || []).find((x) => String(x.id) === String(id));
      if (!ex) return;
      openExpenseModal({ mode: "edit", expense: ex });
    });
  });
}

function inlineExpenseCardHtml(ex) {
  const title =
    `${escapeHtml(ex.vendor || "")}${ex.item ? " • " + escapeHtml(ex.item) : ""}`.trim() ||
    "(No vendor/item)";
  const note = ex.note ? escapeHtml(ex.note) : "";

  return `
    <div class="detail-card">
      <div class="detail-card-top">
        <div>
          <div class="exp-main">${title}</div>
          ${note ? `<div class="exp-sub">${note}</div>` : ``}
          <div class="exp-sub">${escapeHtml(ex.dateISO || "")}</div>
        </div>
        <div class="money">${fmtMoney(ex.amount)}</div>
      </div>
      <div class="detail-actions">
        <button class="icon-btn" data-edit-exp="${escapeAttr(ex.id)}">Edit</button>
        <button class="icon-btn" data-del-exp="${escapeAttr(ex.id)}">Delete</button>
      </div>
    </div>
  `;
}

// -------------------- Annual category options (for annual ledger guard) --------------------
function buildCategoryOptionsForAnnualEntry() {
  const out = [];

  // Monthly categories (current month only)
  for (const c of (ss.monthlyCategories || []).filter((x) => !x.is_extra && x.category_key !== EXTRA_ID)) {
    out.push({ value: String(c.category_key), label: `(Monthly) ${c.name}` });
  }

  // Annual items
  for (const it of (ss.annualItems || [])) {
    const t = String(it.type || "");
    if (t === "annual_budget") {
      out.push({ value: String(it.id), label: `(Annual Budget) ${it.name}` });
    } else if (t === "sinking_fund") {
      out.push({ value: String(it.id), label: `(Sinking Fund) ${it.name}` });
    }
  }

  // fallback
  if (!out.length) out.push({ value: "misc", label: "Misc" });

  return out;
}

// -------------------- Ring helpers --------------------
function remainingPct(leftC, totalC) {
  if (totalC <= 0) return leftC > 0 ? 1 : 0;
  return clamp01(leftC / totalC);
}
function remainingTone(leftC, totalC) {
  if (totalC > 0 && leftC < 0) return "bad";
  const p = remainingPct(leftC, totalC);
  if (p >= 0.65) return "accent";
  if (p >= 0.2) return "warn";
  return "bad";
}
function ringStyle(pct, tone) {
  const deg = Math.round(360 * pct);
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--good)";
  return `background: conic-gradient(${color} ${deg}deg, rgba(71,84,103,.18) 0deg);`;
}
function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// -------------------- Utilities --------------------
function getBudget(monthKey) {
  return state?.budgets?.[monthKey] || null;
}
function getMonthExpenses(budget, type) {
  return (budget.expenses || []).filter((e) => e.type === type);
}
function seedMonthSelect() {
  if (!monthSelect) return;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 24, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 12, 1);

  const keys = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    keys.push(getMonthKey(d));
  }

  Object.keys(state?.budgets || {}).forEach((k) => {
    if (!keys.includes(k)) keys.push(k);
  });

  keys.sort();
  monthSelect.innerHTML = keys.map((k) => `<option value="${k}">${escapeHtml(monthKeyToLabel(k))}</option>`).join("");
}
function getMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function monthKeyToLabel(k) {
  const [y, m] = k.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleString(undefined, { month: "long", year: "numeric" });
}
function addMonths(monthKey, delta) {
  const [y, m] = monthKey.split("-").map((n) => parseInt(n, 10));
  const d = new Date(y, m - 1 + delta, 1);
  return getMonthKey(d);
}
function yearFromMonthKey(monthKey) {
  const y = Number(String(monthKey || "").split("-")[0]);
  return Number.isFinite(y) ? y : new Date().getFullYear();
}
function yearFromISODate(isoDate) {
  const y = Number(String(isoDate || "").slice(0, 4));
  return Number.isFinite(y) ? y : null;
}
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseMoney(v) {
  if (v == null) return 0;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
function toCents(n) {
  const val = Number(n);
  if (!Number.isFinite(val)) return 0;
  return Math.round(val * 100);
}
function fromCents(c) {
  return (Number(c) || 0) / 100;
}
function sumCents(arr) {
  return arr.reduce((a, b) => a + (Number(b) || 0), 0);
}
function fmtMoney(n) {
  const val = Number(n);
  const safe = Number.isFinite(val) ? val : 0;
  return safe.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function fmtMoneyNoCents(n) {
  const val = Number(n);
  const safe = Number.isFinite(val) ? val : 0;
  return safe.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
function moneyToInput(n) {
  const val = Number(n);
  const safe = Number.isFinite(val) ? val : 0;
  return (Math.round(safe * 100) / 100).toFixed(2);
}
function openModal(el) {
  if (!el) return;
  el.classList.remove("hidden");
  const backdrop = el.querySelector(".modal-backdrop");
  if (backdrop) backdrop.dataset.close = "true";
}
function closeModal(el) {
  if (!el) return;
  el.classList.add("hidden");
}
function emptyRow(text) {
  return `
    <div class="trow listgrid" style="cursor:default;">
      <div class="cell-muted" style="grid-column:1 / -1;">${escapeHtml(text)}</div>
    </div>
  `;
}
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function escapeAttr(str) {
  return escapeHtml(str).replaceAll("\n", " ");
}
function cssEscape(s) {
  return String(s).replace(/"/g, '\\"');
}
function slugKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}
