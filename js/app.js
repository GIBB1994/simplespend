/* SimpleSpend v0.8 (AStep 7 — READS WIRED, WRITES DISABLED)
  - AStep 7 goal: Render from Supabase READS (budgets/month/categories/expenses)
  - NO WRITES (no inserts/updates/deletes; no RPC; no localStorage saving)
  - Extra bucket uses backend truth: category_key = "extra99"
*/

const APP_FALLBACK_VERSION = "v0.8";
const STORAGE_KEY = "simplespend_v08";

// AStep 7: hard read-only
const READ_ONLY = true;

// Backend truth (AStep 2/3/4): Extra is monthly_categories.category_key = "extra99"
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
let amountMode = "left"; // "left" or "spent" (global toggle; not used for sinking funds)

// -------------------- App state --------------------
let state = null;
let currentMonthKey = null;
let _booted = false;

// Supabase wiring (AStep 7)
let supa = null;
let authedUser = null;

// Read snapshot from Supabase
let ss = {
  budgets: [],
  activeBudgetId: null,
  month: null,
  monthlyCategories: [],
  monthlyExpenses: [],
  annualItems: [],
  annualLedger: [],
};

// -------------------- Init (auth-gated) --------------------
export async function initApp({ supabase, user }) {
  if (_booted) return;
  _booted = true;

  supa = supabase;
  authedUser = user;

  console.log("Signed in:", user?.email || "(unknown)");

  // AStep 7: do NOT use localStorage as truth
  state = { budgets: {} };

  currentMonthKey = getMonthKey(new Date());

  await loadVersionBadge();

  // Boot reads once (budgets + current month)
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
    if (!bid) {
      // No budgets yet for this user
      ss.activeBudgetId = null;

      // Keep UI usable, show message
      const ae = document.getElementById("authError");
      if (ae) ae.textContent = "No budgets found for this user yet. (AStep 8 will add create-budget UI.)";

      // Ensure current month looks missing
      delete state.budgets[currentMonthKey];
      return;
    }

    ss.activeBudgetId = bid;

    await fetchMonthBundle({ budgetId: bid, monthKey: currentMonthKey });
    hydrateLocalMonthFromSupabase({ monthKey: currentMonthKey });
  } catch (err) {
    console.error("Boot reads failed:", err);
    const ae = document.getElementById("authError");
    if (ae) ae.textContent = err?.message || String(err);
  }
}

// -------------------- Supabase READS (AStep 7) --------------------
async function fetchBudgetsForUser() {
  // RLS ensures we only see budgets we belong to
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

  // v1: pick most recent
  return ss.budgets[0].id;
}

async function fetchMonthBundle({ budgetId, monthKey }) {
  // months: may not exist yet
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

// Map Supabase rows into the existing in-memory shape the UI expects
function hydrateLocalMonthFromSupabase({ monthKey }) {
  if (!state) state = { budgets: {} };
  if (!state.budgets) state.budgets = {};

  // If month doesn't exist in Supabase, remove local month so missing-state shows
  if (!ss.month) {
    delete state.budgets[monthKey];
    return;
  }

  const b = {
    income: fromCents(ss.month.income_cents || 0),
    monthlyCategories: (ss.monthlyCategories || [])
      .slice()
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
      // Extra is hidden and never selectable; UI shows Extra only if it has expenses
      .filter((c) => !c.is_extra)
      .map((c) => ({
        id: c.category_key, // IMPORTANT: use category_key as id
        name: c.name,
        budgeted: fromCents(c.budgeted_cents || 0),
        sort_order: Number(c.sort_order) || 0,
      })),
    annualCategories: [], // AStep 7: annual reads later
    expenses: (ss.monthlyExpenses || []).map((e) => ({
      id: e.id,
      type: "monthly",
      categoryId: e.category_key, // IMPORTANT: category_key
      vendor: e.vendor || "",
      item: e.item || "",
      amount: fromCents(e.amount_cents || 0),
      dateISO: e.expense_date || "",
      note: e.note || "",
    })),
    contributions: [], // AStep 7: annual ledger reads later
  };

  state.budgets[monthKey] = b;
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

  createMonthBtn?.addEventListener("click", () => {
    alert("AStep 7 is read-only. Month creation comes in AStep 8.");
  });

  addExpenseBtn?.addEventListener("click", () => {
    alert("AStep 7 is read-only. Adding expenses comes in AStep 8.");
  });

  // Income input (disabled in read-only, but keep defensive)
  incomeInput?.addEventListener("focus", () => incomeInput.select());
  incomeInput?.addEventListener("click", () => incomeInput.select());
  incomeInput?.addEventListener("input", () => {
    if (READ_ONLY) {
      alert("AStep 7 is read-only. Income editing comes in AStep 8.");
      // snap back
      const b = getBudget(currentMonthKey);
      if (incomeInput && b) incomeInput.value = moneyToInput(b.income);
      return;
    }
  });

  // Add monthly category (disabled)
  addMonthlyCategoryBtn?.addEventListener("click", async () => {
    alert("AStep 7 is read-only. Adding categories comes in AStep 8.");
  });

  // Add annual item (disabled)
  addAnnualCategoryBtn?.addEventListener("click", async () => {
    alert("AStep 7 is read-only. Annual items come in AStep 8.");
  });

  // Expense modal close
  closeExpenseModalBtn?.addEventListener("click", () => closeModal(expenseModal));
  expenseModal?.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeModal(expenseModal);
  });

  saveExpenseBtn?.addEventListener("click", () => {
    alert("AStep 7 is read-only. Saving expenses comes in AStep 8.");
  });
  saveAndAddAnotherBtn?.addEventListener("click", () => {
    alert("AStep 7 is read-only. Saving expenses comes in AStep 8.");
  });

  // Prompt modal close
  promptModal?.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeModal(promptModal);
  });
  closePromptModalBtn?.addEventListener("click", () => closeModal(promptModal));
  promptCancelBtn?.addEventListener("click", () => closeModal(promptModal));
}

// -------------------- Month lifecycle --------------------
async function setMonth(monthKey) {
  currentMonthKey = monthKey;
  expanded = { type: null, id: null };

  if (monthSelect) monthSelect.value = currentMonthKey;

  const bid = ss.activeBudgetId;
  if (bid) {
    try {
      await fetchMonthBundle({ budgetId: bid, monthKey });
      hydrateLocalMonthFromSupabase({ monthKey });
    } catch (err) {
      console.error("Month read failed:", err);
      const ae = document.getElementById("authError");
      if (ae) ae.textContent = err?.message || String(err);
      // Force missing view if reads failed
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

  const b = getBudget(currentMonthKey);
  if (!b) {
    monthMissingState?.classList.remove("hidden");
    monthExistsState?.classList.add("hidden");

    // In read-only, hide copy-prev checkbox (no create anyway)
    if (copyPrevCheckbox) copyPrevCheckbox.disabled = true;
    if (createMonthBtn) createMonthBtn.disabled = true;
    return;
  }

  monthMissingState?.classList.add("hidden");
  monthExistsState?.classList.remove("hidden");

  // Read-only UX: disable inputs/actions that would write
  if (incomeInput) {
    incomeInput.disabled = READ_ONLY;
    incomeInput.value = moneyToInput(b.income);
  }
  if (addExpenseBtn) addExpenseBtn.disabled = READ_ONLY;
  if (addMonthlyCategoryBtn) addMonthlyCategoryBtn.disabled = READ_ONLY;
  if (addAnnualCategoryBtn) addAnnualCategoryBtn.disabled = READ_ONLY;

  renderTotalsOnly();
  renderMonthlyTable();
  renderAnnualTables();
  refreshExpenseCategoryDropdown();
}

function renderTotalsOnly() {
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const incomeC = toCents(b.income);
  const monthlyBudgetedC = sumCents((b.monthlyCategories || []).map((c) => toCents(c.budgeted)));
  const monthlySpentC = sumCents(getMonthExpenses(b, "monthly").map((x) => toCents(x.amount)));

  const plannedC = incomeC - monthlyBudgetedC; // can go negative
  const leftC = incomeC - monthlySpentC; // can go negative

  if (plannedRemainingEl) {
    plannedRemainingEl.textContent = fmtMoneyNoCents(fromCents(plannedC));
    plannedRemainingEl.className = "stat-value " + (plannedC < 0 ? "negative" : "positive");
  }
  if (leftToSpendEl) {
    leftToSpendEl.textContent = fmtMoneyNoCents(fromCents(leftC));
    leftToSpendEl.className = "stat-value " + (leftC < 0 ? "negative" : "positive");
  }
}

// -------------------- Monthly Table --------------------
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

    // Ring drains as remaining decreases (full when left=total)
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

// -------------------- Annual Tables (AStep 7: read-only placeholders) --------------------
function renderAnnualTables() {
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const header = `
    <div class="thead listgrid">
      <div>Category</div>
      <div style="text-align:right;">${amountMode === "left" ? "Left / Total" : "Spent / Total"}</div>
      <div style="text-align:right;">&nbsp;</div>
    </div>
  `;

  if (annualBudgetTable) {
    annualBudgetTable.innerHTML = header + emptyRow("Annual reads will be wired in AStep 7.5 / 7.6 (or AStep 8).");
    bindListInteractions(annualBudgetTable);
    bindExpenseCardActions(annualBudgetTable);
    bindContributionActions(annualBudgetTable);
  }

  if (sinkingFundTable) {
    sinkingFundTable.innerHTML = sinkingHeaderHtml() + emptyRow("Sinking funds will be wired after annual reads are added.");
    bindListInteractions(sinkingFundTable);
    bindExpenseCardActions(sinkingFundTable);
    bindContributionActions(sinkingFundTable);
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

// -------------------- List interactions --------------------
function bindListInteractions(container) {
  if (!container) return;

  // Expand/collapse rows
  container.querySelectorAll("[data-toggle]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const [type, id] = row.dataset.toggle.split(":");
      expanded = expanded.type === type && expanded.id === id ? { type: null, id: null } : { type, id };
      render();
    });
  });

  // Amount toggle (global) — only if present and enabled
  container.querySelectorAll("[data-toggle-amount]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.toggleAmount !== "1") return; // sinking funds use 0
      amountMode = amountMode === "left" ? "spent" : "left";
      render();
    });
  });

  // Add expense
  container.querySelectorAll("[data-add-exp]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (READ_ONLY) return alert("AStep 7 is read-only. Adding expenses comes in AStep 8.");
      const [type, id] = btn.dataset.addExp.split(":");
      openExpenseModal({ type, categoryId: id });
    });
  });

  // Edit category
  container.querySelectorAll("[data-edit-cat]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (READ_ONLY) return alert("AStep 7 is read-only. Editing categories comes in AStep 8.");
    });
  });

  // Delete category
  container.querySelectorAll("[data-del-cat]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (READ_ONLY) return alert("AStep 7 is read-only. Deleting categories comes in AStep 8.");
    });
  });

  // Contribution (annual)
  container.querySelectorAll("[data-contrib]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (READ_ONLY) return alert("AStep 7 is read-only. Contributions come in AStep 8.");
    });
  });
}

// -------------------- Expense modal (blocked in AStep 7) --------------------
function openExpenseModal(_prefill) {
  alert("AStep 7 is read-only. Expense modal will be wired to Supabase writes in AStep 8.");
}

function refreshExpenseCategoryDropdown() {
  const b = getBudget(currentMonthKey);
  if (!b || !expCategory) return;

  // Read-only: we keep dropdown empty, because modal is blocked anyway
  expCategory.innerHTML = "";
}

// -------------------- Expense cards --------------------
function bindExpenseCardActions(container) {
  if (!container) return;

  container.querySelectorAll("[data-del-exp]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (READ_ONLY) return alert("AStep 7 is read-only. Deleting expenses comes in AStep 8.");
    });
  });
  container.querySelectorAll("[data-edit-exp]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (READ_ONLY) return alert("AStep 7 is read-only. Editing expenses comes in AStep 8.");
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
        <button class="icon-btn" data-edit-exp="${ex.id}">Edit</button>
        <button class="icon-btn" data-del-exp="${ex.id}">Delete</button>
      </div>
    </div>
  `;
}

// -------------------- Contributions (blocked) --------------------
function bindContributionActions(container) {
  if (!container) return;

  container.querySelectorAll("[data-del-contrib]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (READ_ONLY) return alert("AStep 7 is read-only. Deleting contributions comes in AStep 8.");
    });
  });
  container.querySelectorAll("[data-edit-contrib]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (READ_ONLY) return alert("AStep 7 is read-only. Editing contributions comes in AStep 8.");
    });
  });
}

// -------------------- Ring helpers (drain by remaining) --------------------
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

// -------------------- Storage / utilities --------------------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { budgets: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { budgets: {} };
    if (!parsed.budgets) parsed.budgets = {};
    return parsed;
  } catch {
    return { budgets: {} };
  }
}

function saveState() {
  if (READ_ONLY) return; // AStep 7: no local persistence
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

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

  // include any loaded months (from reads)
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

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
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
