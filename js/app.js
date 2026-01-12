/* SimpleSpend v0.9 (AStep 8 — WRITES WIRED + Category modal UI)
  - Supabase is source of truth
  - Implements:
      8.1 Create Budget (RPC only)
      8.2 Create Month (+ optional copy prev categories)
      8.3 Monthly Category CRUD (uses promptModal, not browser prompt)
      8.4 Monthly Expense CRUD (uses expense modal)
  - Annual (8.5/8.6): left as stub (needs exact annual schema to wire safely)
*/

const APP_FALLBACK_VERSION = "v0.9";
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
let editingExpense = null; // { id, mode: "add"|"edit" }

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
  month: null,
  monthlyCategories: [],
  monthlyExpenses: [],
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
    contributions: [],
  };

  state.budgets[monthKey] = b;
}

// -------------------- Supabase WRITES (8.1–8.4) --------------------
async function refreshCurrentMonth() {
  const bid = ss.activeBudgetId;
  if (!bid) return;
  await fetchMonthBundle({ budgetId: bid, monthKey: currentMonthKey });
  hydrateLocalMonthFromSupabase({ monthKey: currentMonthKey });
}

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
    if (!promptModal || !promptTitle || !promptFields || !promptOkBtn || !promptCancelBtn) {
      const out = {};
      for (const f of fields) out[f.key] = prompt(f.label, f.value ?? "") ?? "";
      return resolve({ ok: true, values: out });
    }

    promptTitle.textContent = title || "Enter values";

    promptFields.innerHTML = fields
      .map((f) => {
        const span = f.span2 ? " field-span-2" : "";
        const type = f.type || "text";
        const val = f.value ?? "";
        const ph = f.placeholder ?? "";
        return `
          <label class="field${span}">
            <span>${escapeHtml(f.label)}</span>
            <input
              class="input"
              id="pm_${escapeAttr(f.key)}"
              type="${escapeAttr(type)}"
              ${f.money ? 'inputmode="decimal"' : ""}
              value="${escapeAttr(val)}"
              placeholder="${escapeAttr(ph)}"
            />
          </label>
        `;
      })
      .join("");

    openModal(promptModal);

    const first = promptFields.querySelector("input");
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

async function addMonthlyCategory() {
  const bid = ss.activeBudgetId;
  if (!bid) throw new Error("No active budget selected.");
  const b = getBudget(currentMonthKey);
  if (!b) throw new Error("Create the month first.");

  const r = await openPromptModal({
    title: "Add Monthly Category",
    fields: [
      { key: "name", label: "Category name", value: "", span2: true },
      { key: "budgeted", label: "Budgeted", value: "0.00", money: true },
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
      { key: "name", label: "Category name", value: cur.name || "", span2: true },
      { key: "budgeted", label: "Budgeted", value: fromCents(cur.budgeted_cents || 0).toFixed(2), money: true },
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

// -------------------- Expense writes --------------------
async function insertExpense(payload) {
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

async function updateExpense(expenseId, payload) {
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

async function deleteExpense(expenseId) {
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
    alert("Annual wiring is next (needs exact annual_items/annual_ledger column names).");
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
  if (extraSpentC !== 0) {
    rows.push({ id: EXTRA_ID, name: EXTRA_NAME, total: 0, kind: "extra" });
  }

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
    `;

    html += `
      <div class="detail-row">
        <div class="detail-anim ${isOpen ? "open" : ""}">
          <div class="detail-inner">
            <div class="detail-muted">${monthKeyToLabel(currentMonthKey)} • Monthly</div>

            <div class="row row-wrap row-gap">
              ${
                cat.kind !== "extra"
                  ? `<button class="btn btn-primary" data-add-exp="monthly:${cat.id}">+ Add Expense</button>`
                  : ``
              }
              ${
                cat.kind !== "extra"
                  ? `<button class="btn btn-secondary" data-edit-cat="monthly:${cat.id}">Edit Category</button>`
                  : ``
              }
              ${
                cat.kind !== "extra"
                  ? `<button class="btn btn-ghost" data-del-cat="monthly:${cat.id}">Delete Category</button>`
                  : ``
              }
            </div>

            ${
              catExpenses.length
                ? `
              <div class="detail-list">
                ${catExpenses
                  .slice()
                  .sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""))
                  .map((ex) => inlineExpenseCardHtml(ex))
                  .join("")}
              </div>
            `
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
  const header = `
    <div class="thead listgrid">
      <div>Category</div>
      <div style="text-align:right;">Left / Total</div>
      <div style="text-align:right;">&nbsp;</div>
    </div>
  `;

  if (annualBudgetTable) {
    annualBudgetTable.innerHTML = header + emptyRow("Annual wiring next (needs exact annual_items/annual_ledger schema).");
  }
  if (sinkingFundTable) {
    sinkingFundTable.innerHTML = sinkingHeaderHtml() + emptyRow("Annual wiring next (needs exact annual_items/annual_ledger schema).");
  }
}

function sinkingHeaderHtml() {
  return `
    <div class="thead listgrid">
      <div>Category</div>
      <div style="text-align:right;">Balance</div>
      <div style="text-align:right;">&nbsp;</div>
    </div>
  `;
}

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
      const [type, id] = btn.dataset.addExp.split(":");
      openExpenseModal({ mode: "add", type, categoryId: id });
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

function openExpenseModal({ mode, categoryId = null, expense = null } = {}) {
  if (!expenseModal) return;

  editingExpense = null;

  const b = getBudget(currentMonthKey);
  if (!b) return alert("Create the month first.");

  refreshExpenseCategoryDropdown();

  if (mode === "edit" && expense) {
    editingExpense = { id: expense.id, mode: "edit" };
    expenseModalTitle.textContent = "Edit Expense";
    expVendor.value = expense.vendor || "";
    expItem.value = expense.item || "";
    expAmount.value = moneyToInput(expense.amount || 0);
    expDate.value = expense.dateISO || todayISO();
    expNote.value = expense.note || "";
    expCategory.value = expense.categoryId || "";
  } else {
    editingExpense = { id: null, mode: "add" };
    expenseModalTitle.textContent = "Add Expense";
    expVendor.value = "";
    expItem.value = "";
    expAmount.value = "";
    expDate.value = todayISO();
    expNote.value = "";
    if (categoryId && expCategory.querySelector(`option[value="${cssEscape(categoryId)}"]`)) {
      expCategory.value = categoryId;
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
  const category_key = expCategory?.value || "";
  const note = (expNote?.value || "").trim();

  if (!vendor) throw new Error("Vendor is required.");
  if (!item) throw new Error("Item is required.");
  if (!dateISO) throw new Error("Date is required.");
  if (!category_key) throw new Error("Category is required.");
  if (category_key === EXTRA_ID) throw new Error("Extra cannot be selected.");
  if (!amount || toCents(amount) === 0) throw new Error("Amount must be non-zero.");

  const payload = {
    vendor,
    item,
    amount_cents: toCents(amount),
    expense_date: dateISO,
    category_key,
    note,
  };

  if (editingExpense?.mode === "edit" && editingExpense.id) {
    await updateExpense(editingExpense.id, payload);
  } else {
    await insertExpense(payload);
  }

  if (addAnother) {
    openExpenseModal({ mode: "add", categoryId: category_key });
  } else {
    closeModal(expenseModal);
  }
}

function refreshExpenseCategoryDropdown() {
  const b = getBudget(currentMonthKey);
  if (!b || !expCategory) return;

  const cats = (b.monthlyCategories || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  expCategory.innerHTML = cats
    .filter((c) => c.id !== EXTRA_ID)
    .map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`)
    .join("");
}

function bindExpenseCardActions(container) {
  if (!container) return;

  container.querySelectorAll("[data-del-exp]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await deleteExpense(btn.dataset.delExp);
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
