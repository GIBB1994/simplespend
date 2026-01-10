/* SimpleSpend v0.7 (Annual Budgets + Sinking Funds)
   Annual Budgets:
     - Year-scoped ledger
     - Copies categories (name/target/initial) into new year on first use
     - Row: Left / TotalAvailable (TotalAvailable = target + initial + contributions)
     - Left = TotalAvailable - spent
     - Ring drains as Left drains

   Sinking Funds:
     - Global ledger (rollover)
     - Row: Balance only
     - Balance = (initial + contributions) - spent
     - Target displayed as goal line under name

   Extra bucket:
     - NEVER selectable in Add Expense
     - Only appears when populated
     - Receives expenses on category delete
*/

const APP_FALLBACK_VERSION = "v0.7";
const STORAGE_KEY = "simplespend_v07";

const EXTRA_ID = "__extra__";
const EXTRA_NAME = "Extra";

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
const annualTable = document.getElementById("annualTable");

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

let expanded = { type: null, id: null }; // type: "monthly"|"annualBudget"|"fund"
let amountMode = "left"; // "left" or "spent"

/*
state = {
  budgets: {
    "YYYY-MM": {
      income: number,
      monthlyCategories: [{id, name, budgeted}],
      expenses: [{ id, kind:"monthly"|"annualBudget", categoryId, vendor, item, amount, dateISO, note }]
    }
  },
  annual: {
    years: {
      "YYYY": {
        categories: [{ id, name, target, initial }],
        contributions: [{ id, categoryId, amount, dateISO, note }]
      }
    },
    funds: {
      categories: [{ id, name, target, initial }],
      contributions: [{ id, categoryId, amount, dateISO, note }],
      expenses: [{ id, categoryId, vendor, item, amount, dateISO, note }]
    }
  }
}
*/

let state = loadState();
let currentMonthKey = getMonthKey(new Date());

// -------------------- Init --------------------
loadVersionBadge();
seedMonthSelect();
setMonth(currentMonthKey);
wireEvents();
render();

// -------------------- Version --------------------
async function loadVersionBadge(){
  const badge = document.getElementById("versionBadge");
  if (!badge) return;

  try{
    const res = await fetch("./VERSION.txt", { cache: "no-store" });
    if (!res.ok) throw new Error("Bad response");
    const txt = (await res.text()).trim();
    badge.textContent = txt || APP_FALLBACK_VERSION;
  } catch {
    badge.textContent = APP_FALLBACK_VERSION;
  }
}

// -------------------- Events --------------------
function wireEvents(){
  prevMonthBtn.addEventListener("click", () => setMonth(addMonths(currentMonthKey, -1)));
  nextMonthBtn.addEventListener("click", () => setMonth(addMonths(currentMonthKey, +1)));
  monthSelect.addEventListener("change", () => setMonth(monthSelect.value));

  createMonthBtn.addEventListener("click", () => {
    createBudgetForMonth(currentMonthKey, copyPrevCheckbox.checked);
    render();
  });

  incomeInput.addEventListener("focus", () => incomeInput.select());
  incomeInput.addEventListener("click", () => incomeInput.select());

  incomeInput.addEventListener("input", () => {
    const b = getBudget(currentMonthKey);
    if (!b) return;
    b.income = parseMoney(incomeInput.value);
    saveState();
    renderTotalsOnly();
  });

  addMonthlyCategoryBtn.addEventListener("click", async () => {
    const b = getBudget(currentMonthKey);
    if (!b) return;

    const res = await promptForm("Add Monthly Category", [
      { key:"name", label:"Name", type:"text", placeholder:"Groceries" },
      { key:"budgeted", label:"Budgeted", type:"money", placeholder:"0.00" }
    ]);
    if (!res) return;

    b.monthlyCategories.push({
      id: uid(),
      name: (res.name || "").trim() || "Unnamed",
      budgeted: parseMoney(res.budgeted)
    });

    saveState();
    render();
  });

  addAnnualCategoryBtn.addEventListener("click", async () => {
    const year = getYearFromMonthKey(currentMonthKey);
    ensureAnnualReadyForYear(year); // also clones last year if needed

    const res = await promptForm(`Add Annual (${year})`, [
      { key:"name", label:"Name", type:"text", placeholder:"Christmas / Vacation / Car Repairs" },
      { key:"type", label:"Type", type:"select", options:[
        { value:"budget", label:"Annual Budget (resets yearly)" },
        { value:"fund", label:"Sinking Fund (rollover)" }
      ], value:"budget" },
      { key:"target", label:"Target", type:"money", placeholder:"2000.00" },
      { key:"initial", label:"Initial", type:"money", placeholder:"0.00" }
    ]);
    if (!res) return;

    const id = uid();
    const name = (res.name || "").trim() || "Unnamed";
    const target = parseMoney(res.target);
    const initial = parseMoney(res.initial);
    const type = res.type === "fund" ? "fund" : "budget";

    if (type === "budget"){
      state.annual.years[year].categories.push({ id, name, target, initial });
    } else {
      state.annual.funds.categories.push({ id, name, target, initial });
    }

    saveState();
    render();
  });

  addExpenseBtn.addEventListener("click", () => openExpenseModal({}));

  closeExpenseModalBtn.addEventListener("click", () => closeModal(expenseModal));
  expenseModal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeModal(expenseModal);
  });

  saveExpenseBtn.addEventListener("click", () => saveExpense({ keepOpen:false }));
  saveAndAddAnotherBtn.addEventListener("click", () => saveExpense({ keepOpen:true }));

  promptModal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close === "true") closeModal(promptModal);
  });
  closePromptModalBtn.addEventListener("click", () => closeModal(promptModal));
  promptCancelBtn.addEventListener("click", () => closeModal(promptModal));
}

// -------------------- Rendering --------------------
function render(){
  seedMonthSelect();
  monthSelect.value = currentMonthKey;

  const b = getBudget(currentMonthKey);
  if (!b){
    monthMissingState.classList.remove("hidden");
    monthExistsState.classList.add("hidden");
    return;
  }

  monthMissingState.classList.add("hidden");
  monthExistsState.classList.remove("hidden");

  incomeInput.value = moneyToInput(b.income);

  ensureAnnualReadyForYear(getYearFromMonthKey(currentMonthKey));

  renderTotalsOnly();
  renderMonthlyTable();
  renderAnnualTable();
  refreshExpenseCategoryDropdown();
}

function renderTotalsOnly(){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const incomeC = toCents(b.income);
  const monthlyBudgetedC = sumCents((b.monthlyCategories || []).map(c => toCents(c.budgeted)));
  const monthlySpentC = sumCents(getMonthExpenses(b, "monthly").map(x => toCents(x.amount)));

  const plannedC = incomeC - monthlyBudgetedC;
  const leftC = incomeC - monthlySpentC;

  plannedRemainingEl.textContent = fmtMoney(fromCents(plannedC));
  leftToSpendEl.textContent = fmtMoney(fromCents(leftC));

  plannedRemainingEl.className = "stat-value " + (plannedC < 0 ? "negative" : "positive");
  leftToSpendEl.className = "stat-value " + (leftC < 0 ? "negative" : "positive");
}

// -------------------- Monthly Table --------------------
function renderMonthlyTable(){
  const b = getBudget(currentMonthKey);
  const expenses = getMonthExpenses(b, "monthly");

  const header = `
    <div class="thead listgrid">
      <div>Category</div>
      <div style="text-align:right;">${amountMode === "left" ? "Left / Total" : "Spent / Total"}</div>
      <div style="text-align:right;">&nbsp;</div>
    </div>
  `;

  const rows = [];
  (b.monthlyCategories || []).forEach(c => rows.push({ id:c.id, name:c.name, total:c.budgeted, kind:"normal" }));

  const extraSpentC = sumCents(expenses.filter(e => e.categoryId === EXTRA_ID).map(e => toCents(e.amount)));
  if (extraSpentC !== 0){
    rows.push({ id:EXTRA_ID, name:EXTRA_NAME, total:0, kind:"extra" });
  }

  if (!rows.length){
    monthlyTable.innerHTML = header + emptyRow("No monthly categories yet. Add one.");
    return;
  }

  let html = header;

  rows.forEach(cat => {
    const catExpenses = expenses.filter(e => e.categoryId === cat.id);
    const spentC = sumCents(catExpenses.map(e => toCents(e.amount)));
    const totalC = toCents(cat.total || 0);
    const leftC = totalC - spentC;

    const line = amountMode === "left"
      ? `${fmtMoney0(fromCents(leftC))} / ${fmtMoney0(fromCents(totalC))}`
      : `${fmtMoney0(fromCents(spentC))} / ${fmtMoney0(fromCents(totalC))}`;

    const lineClass = (amountMode === "left" && leftC < 0) ? "negative" : "";

    // Ring drains with remaining
    const pct = remainingPct(leftC, totalC);
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

        <div class="ring" style="${ringStyle(pct, ringColor)}"></div>
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

            ${catExpenses.length ? `
              <div class="detail-list">
                ${catExpenses
                  .slice()
                  .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""))
                  .map(ex => inlineExpenseCardHtml(ex))
                  .join("")}
              </div>
            ` : `<div class="cell-muted">No expenses in this category this month.</div>`}
          </div>
        </div>
      </div>
    `;
  });

  monthlyTable.innerHTML = html;

  bindListInteractions(monthlyTable);
  bindMonthlyExpenseCardActions(monthlyTable);
}

// -------------------- Annual Table (Budgets + Funds) --------------------
function renderAnnualTable(){
  const year = getYearFromMonthKey(currentMonthKey);
  ensureAnnualReadyForYear(year);

  const y = state.annual.years[year];
  const funds = state.annual.funds;

  const header = `
    <div class="thead listgrid">
      <div>Category</div>
      <div style="text-align:right;">${amountMode === "left" ? "Left / Total" : "Spent / Total"}</div>
      <div style="text-align:right;">&nbsp;</div>
    </div>
  `;

  let html = header;

  // ---------- Annual Budgets (year scoped)
  const budgetCats = (y.categories || []);
  const yearBudgetSpentByCat = getYearAnnualBudgetSpentByCat(year); // money
  const yearBudgetExpensesAll = getYearAnnualBudgetExpensesAll(year); // with _monthKey
  const yearContribs = (y.contributions || []);

  html += `<div class="subhead">Annual Budgets • ${year} (resets yearly)</div>`;

  if (!budgetCats.length){
    html += emptyRow("No annual budget items yet. Add one.");
  } else {
    // Extra appears if populated
    const extraSpent = yearBudgetSpentByCat[EXTRA_ID] || 0;
    const rows = budgetCats.map(c => ({...c, kind:"normal"}));
    if (extraSpent !== 0) rows.push({ id:EXTRA_ID, name:EXTRA_NAME, target:0, initial:0, kind:"extra" });

    rows.forEach(cat => {
      const spent = Number(yearBudgetSpentByCat[cat.id] || 0);
      const contrib = sumMoney(yearContribs.filter(c => c.categoryId === cat.id).map(c => c.amount || 0));
      const target = Number(cat.target || 0);
      const initial = Number(cat.initial || 0);

      // Your model:
      // TotalAvailable = target + initial + contributions
      // Left = TotalAvailable - spent
      const totalAvailable = target + initial + contrib;
      const left = totalAvailable - spent;

      const totalC = toCents(totalAvailable);
      const leftC = toCents(left);
      const spentC = toCents(spent);

      const line = amountMode === "left"
        ? `${fmtMoney0(fromCents(leftC))} / ${fmtMoney0(fromCents(totalC))}`
        : `${fmtMoney0(fromCents(spentC))} / ${fmtMoney0(fromCents(totalC))}`;

      const lineClass = (amountMode === "left" && leftC < 0) ? "negative" : "";

      const pct = remainingPct(leftC, totalC);
      const tone = remainingTone(leftC, totalC);

      const isOpen = expanded.type === "annualBudget" && expanded.id === cat.id;

      const sub = cat.kind === "extra"
        ? `<div class="catsub">Hidden uncategorized. Reassign these.</div>`
        : `<div class="catsub">Target: ${escapeHtml(fmtMoney0(target))} • Initial: ${escapeHtml(fmtMoney0(initial))}</div>`;

      html += `
        <div class="trow listgrid" data-toggle="annualBudget:${cat.id}">
          <div class="catcell">
            <span class="chev ${isOpen ? "open" : ""}">›</span>
            <div style="min-width:0;">
              <div class="catname">${escapeHtml(cat.name)}</div>
              ${sub}
            </div>
          </div>

          <button class="amountbtn" data-toggle-amount="1" type="button" aria-label="Toggle amount mode">
            <div class="amountline money ${lineClass}">${escapeHtml(line)}</div>
          </button>

          <div class="ring" style="${ringStyle(pct, tone)}"></div>
        </div>

        <div class="detail-row">
          <div class="detail-anim ${isOpen ? "open" : ""}">
            <div class="detail-inner">
              <div class="detail-muted">${year} • Annual Budget (YTD)</div>

              <div class="row row-wrap row-gap">
                ${cat.kind !== "extra" ? `<button class="btn btn-primary" data-add-exp="annualBudget:${cat.id}">+ Add Expense</button>` : ``}
                ${cat.kind !== "extra" ? `<button class="btn btn-secondary" data-contrib="annualBudget:${cat.id}">+ Contribution</button>` : ``}
                ${cat.kind !== "extra" ? `<button class="btn btn-secondary" data-edit-annual="annualBudget:${cat.id}">Edit</button>` : ``}
                ${cat.kind !== "extra" ? `<button class="btn btn-ghost" data-del-annual="annualBudget:${cat.id}">Delete</button>` : ``}
              </div>

              <div class="detail-muted">
                Total: <span class="money">${escapeHtml(fmtMoney0(totalAvailable))}</span>
                • Left: <span class="money ${left < 0 ? "negative" : ""}">${escapeHtml(fmtMoney0(left))}</span>
              </div>

              <div class="detail-muted">Contributions (YTD)</div>
              ${renderContributionList(yearContribs.filter(c => c.categoryId === cat.id), { scope:"year", year })}

              <div class="detail-muted">Expenses (YTD)</div>
              ${renderAnnualBudgetExpenseList(
                yearBudgetExpensesAll.filter(ex => ex.categoryId === cat.id),
                { year }
              )}
            </div>
          </div>
        </div>
      `;
    });
  }

  // ---------- Sinking Funds (global)
  const fundCats = (funds.categories || []);
  const fundSpentByCat = getFundSpentByCat(); // money
  const fundExpensesAll = (funds.expenses || []);
  const fundContribsAll = (funds.contributions || []);

  html += `<div class="subhead">Sinking Funds • All-time (rollover)</div>`;

  if (!fundCats.length){
    html += emptyRow("No sinking funds yet. Add one.");
  } else {
    const extraSpent = fundSpentByCat[EXTRA_ID] || 0;
    const rows = fundCats.map(c => ({...c, kind:"normal"}));
    if (extraSpent !== 0) rows.push({ id:EXTRA_ID, name:EXTRA_NAME, target:0, initial:0, kind:"extra" });

    rows.forEach(cat => {
      const spent = Number(fundSpentByCat[cat.id] || 0);
      const contrib = sumMoney(fundContribsAll.filter(c => c.categoryId === cat.id).map(c => c.amount || 0));
      const target = Number(cat.target || 0);
      const initial = Number(cat.initial || 0);

      // Fund model:
      // TotalFunded = initial + contributions
      // Balance = TotalFunded - spent
      const totalFunded = initial + contrib;
      const balance = totalFunded - spent;

      // Row shows BALANCE ONLY (no cents)
      const line = fmtMoney0(balance);
      const lineClass = balance < 0 ? "negative" : "";

      // Ring: keep consistent “drain” using Balance/TotalFunded (if totalFunded > 0)
      const totalC = toCents(totalFunded);
      const leftC = toCents(balance);
      const pct = remainingPct(leftC, totalC);
      const tone = remainingTone(leftC, totalC);

      const isOpen = expanded.type === "fund" && expanded.id === cat.id;

      const sub = cat.kind === "extra"
        ? `<div class="catsub">Hidden uncategorized. Reassign these.</div>`
        : `<div class="catsub">Goal: ${escapeHtml(fmtMoney0(target))} • Initial: ${escapeHtml(fmtMoney0(initial))}</div>`;

      html += `
        <div class="trow listgrid" data-toggle="fund:${cat.id}">
          <div class="catcell">
            <span class="chev ${isOpen ? "open" : ""}">›</span>
            <div style="min-width:0;">
              <div class="catname">${escapeHtml(cat.name)}</div>
              ${sub}
            </div>
          </div>

          <button class="amountbtn" data-toggle-amount="1" type="button" aria-label="Toggle amount mode">
            <div class="amountline money ${lineClass}">${escapeHtml(line)}</div>
          </button>

          <div class="ring" style="${ringStyle(pct, tone)}"></div>
        </div>

        <div class="detail-row">
          <div class="detail-anim ${isOpen ? "open" : ""}">
            <div class="detail-inner">
              <div class="detail-muted">Sinking Fund • All-time</div>

              <div class="row row-wrap row-gap">
                ${cat.kind !== "extra" ? `<button class="btn btn-primary" data-add-exp="fund:${cat.id}">+ Add Expense</button>` : ``}
                ${cat.kind !== "extra" ? `<button class="btn btn-secondary" data-contrib="fund:${cat.id}">+ Contribution</button>` : ``}
                ${cat.kind !== "extra" ? `<button class="btn btn-secondary" data-edit-annual="fund:${cat.id}">Edit</button>` : ``}
                ${cat.kind !== "extra" ? `<button class="btn btn-ghost" data-del-annual="fund:${cat.id}">Delete</button>` : ``}
              </div>

              <div class="detail-muted">
                Funded: <span class="money">${escapeHtml(fmtMoney0(totalFunded))}</span>
                • Balance: <span class="money ${balance < 0 ? "negative" : ""}">${escapeHtml(fmtMoney0(balance))}</span>
              </div>

              <div class="detail-muted">Contributions (All-time)</div>
              ${renderContributionList(fundContribsAll.filter(c => c.categoryId === cat.id), { scope:"fund" })}

              <div class="detail-muted">Expenses (All-time)</div>
              ${renderFundExpenseList(fundExpensesAll.filter(ex => ex.categoryId === cat.id))}
            </div>
          </div>
        </div>
      `;
    });
  }

  annualTable.innerHTML = html;

  bindListInteractions(annualTable);
  bindMonthlyExpenseCardActions(annualTable);      // only hits monthly cards inside monthly section if any (safe)
  bindAnnualBudgetExpenseActions(annualTable);
  bindFundExpenseActions(annualTable);
  bindContributionActions(annualTable);
  bindAnnualCategoryActions(annualTable);
}

// -------------------- Group Render Helpers --------------------
function renderContributionList(list, meta){
  if (!list.length) return `<div class="cell-muted">No contributions.</div>`;

  const sorted = list.slice().sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""));
  return `
    <div class="detail-list">
      ${sorted.map(c => inlineContributionCardHtml(c, meta)).join("")}
    </div>
  `;
}

function renderAnnualBudgetExpenseList(list, meta){
  if (!list.length) return `<div class="cell-muted">No expenses.</div>`;

  const sorted = list.slice().sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""));
  return `
    <div class="detail-list">
      ${sorted.map(ex => inlineAnnualBudgetExpenseCardHtml(ex, meta)).join("")}
    </div>
  `;
}

function renderFundExpenseList(list){
  if (!list.length) return `<div class="cell-muted">No expenses.</div>`;

  const sorted = list.slice().sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""));
  return `
    <div class="detail-list">
      ${sorted.map(ex => inlineFundExpenseCardHtml(ex)).join("")}
    </div>
  `;
}

// -------------------- List interactions --------------------
function bindListInteractions(container){
  container.querySelectorAll("[data-toggle]").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const [type, id] = row.dataset.toggle.split(":");
      expanded = (expanded.type === type && expanded.id === id) ? {type:null, id:null} : {type, id};
      render();
    });
  });

  container.querySelectorAll("[data-toggle-amount]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      amountMode = (amountMode === "left") ? "spent" : "left";
      render();
    });
  });

  container.querySelectorAll("[data-add-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const [type, id] = btn.dataset.addExp.split(":");
      openExpenseModal({ kind:type, categoryId:id });
    });
  });

  container.querySelectorAll("[data-contrib]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const [scope, id] = btn.dataset.contrib.split(":"); // annualBudget|fund
      await addContribution(scope, id);
    });
  });
}

// -------------------- Annual category actions (edit/delete) --------------------
function bindAnnualCategoryActions(container){
  container.querySelectorAll("[data-edit-annual]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const [scope, id] = btn.dataset.editAnnual.split(":"); // annualBudget|fund
      await editAnnualCategory(scope, id);
    });
  });

  container.querySelectorAll("[data-del-annual]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const [scope, id] = btn.dataset.delAnnual.split(":");
      deleteAnnualCategory(scope, id);
    });
  });
}

async function editAnnualCategory(scope, id){
  const year = getYearFromMonthKey(currentMonthKey);
  ensureAnnualReadyForYear(year);

  const isFund = scope === "fund";
  const list = isFund ? state.annual.funds.categories : state.annual.years[year].categories;
  const cat = (list || []).find(c => c.id === id);
  if (!cat) return;

  const res = await promptForm("Edit Annual", [
    { key:"name", label:"Name", type:"text", value: cat.name },
    { key:"target", label:"Target", type:"money", value: moneyToInput(cat.target) },
    { key:"initial", label:"Initial", type:"money", value: moneyToInput(cat.initial) }
  ]);
  if (!res) return;

  cat.name = (res.name || "").trim() || cat.name;
  cat.target = parseMoney(res.target);
  cat.initial = parseMoney(res.initial);

  saveState();
  render();
}

function deleteAnnualCategory(scope, id){
  const year = getYearFromMonthKey(currentMonthKey);
  ensureAnnualReadyForYear(year);

  if (scope === "annualBudget"){
    if (!confirm(`Delete this annual budget item for ${year}? Its expenses will move to "${EXTRA_NAME}" and contributions will be deleted.`)) return;

    // Move ALL year annualBudget expenses to Extra
    Object.entries(state.budgets).forEach(([mk, bud]) => {
      if (!mk.startsWith(year + "-")) return;
      (bud.expenses || []).forEach(ex => {
        if (ex.kind === "annualBudget" && ex.categoryId === id){
          ex.categoryId = EXTRA_ID;
        }
      });
    });

    // Delete contributions for this cat in year
    state.annual.years[year].contributions = (state.annual.years[year].contributions || []).filter(c => c.categoryId !== id);

    // Remove category
    state.annual.years[year].categories = (state.annual.years[year].categories || []).filter(c => c.id !== id);

  } else {
    if (!confirm(`Delete this sinking fund? Its expenses will move to "${EXTRA_NAME}" and contributions will be deleted.`)) return;

    // Move fund expenses to Extra (global)
    state.annual.funds.expenses.forEach(ex => {
      if (ex.categoryId === id) ex.categoryId = EXTRA_ID;
    });

    state.annual.funds.contributions = (state.annual.funds.contributions || []).filter(c => c.categoryId !== id);
    state.annual.funds.categories = (state.annual.funds.categories || []).filter(c => c.id !== id);
  }

  if (expanded.id === id) expanded = { type:null, id:null };

  saveState();
  render();
}

// -------------------- Category actions (monthly) --------------------
async function editMonthlyCategory(id){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const cat = (b.monthlyCategories || []).find(c => c.id === id);
  if (!cat) return;

  const res = await promptForm("Edit Monthly Category", [
    { key:"name", label:"Name", type:"text", value: cat.name },
    { key:"budgeted", label:"Budgeted", type:"money", value: moneyToInput(cat.budgeted) }
  ]);
  if (!res) return;

  cat.name = (res.name || "").trim() || cat.name;
  cat.budgeted = parseMoney(res.budgeted);

  saveState();
  render();
}

function deleteMonthlyCategory(id){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  if (!confirm(`Delete this monthly category? Existing expenses will move to "${EXTRA_NAME}".`)) return;

  (b.expenses || []).forEach(ex => {
    if (ex.kind === "monthly" && ex.categoryId === id){
      ex.categoryId = EXTRA_ID;
    }
  });

  b.monthlyCategories = (b.monthlyCategories || []).filter(c => c.id !== id);

  if (expanded.type === "monthly" && expanded.id === id) expanded = {type:null, id:null};

  saveState();
  render();
}

// -------------------- Expense modal --------------------
function openExpenseModal(prefill){
  const b = getBudget(currentMonthKey);
  if (!b){
    alert("Create this month budget first.");
    return;
  }

  refreshExpenseCategoryDropdown();

  if (expCategory.options.length === 0){
    alert("Create at least one category first.");
    return;
  }

  const editing = Boolean(prefill?.id);
  expenseModalTitle.textContent = editing ? "Edit Expense" : "Add Expense";

  expVendor.value = prefill.vendor ?? "";
  expItem.value = prefill.item ?? "";
  expAmount.value = (prefill.amount != null) ? moneyToInput(prefill.amount) : "";
  expDate.value = prefill.dateISO ?? todayISO();
  expNote.value = prefill.note ?? "";

  expenseModal.dataset.editingId = prefill.id || "";
  expenseModal.dataset.editingScope = prefill._scope || "";     // "month"|"fund"
  expenseModal.dataset.editingMonthKey = prefill._monthKey || ""; // for annualBudget edits across year

  // preselect
  if (prefill?.kind && prefill?.categoryId && prefill.categoryId !== EXTRA_ID){
    const key = `${prefill.kind}:${prefill.categoryId}`;
    const exists = Array.from(expCategory.options).some(o => o.value === key);
    if (exists) expCategory.value = key;
    else expCategory.selectedIndex = 0;
  } else {
    expCategory.selectedIndex = 0;
  }

  openModal(expenseModal);
  expVendor.focus();
}

function refreshExpenseCategoryDropdown(){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const year = getYearFromMonthKey(currentMonthKey);
  ensureAnnualReadyForYear(year);

  const opts = [];

  // Monthly categories
  (b.monthlyCategories || []).forEach(c => opts.push({ value:`monthly:${c.id}`, label:`(Monthly) ${c.name}` }));

  // Annual budget categories for this year
  (state.annual.years[year].categories || []).forEach(c => opts.push({ value:`annualBudget:${c.id}`, label:`(Annual Budget ${year}) ${c.name}` }));

  // Sinking funds
  (state.annual.funds.categories || []).forEach(c => opts.push({ value:`fund:${c.id}`, label:`(Sinking Fund) ${c.name}` }));

  expCategory.innerHTML = opts.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("");
}

function saveExpense({ keepOpen }){
  const vendor = expVendor.value.trim();
  const item = expItem.value.trim();
  const amount = parseMoney(expAmount.value);
  const dateISO = expDate.value || todayISO();
  const note = expNote.value.trim();

  if (!amount || amount === 0){
    alert("Amount must be greater than 0.");
    return;
  }

  if (!expCategory.value){
    alert("Pick a category (Extra is not allowed).");
    return;
  }

  const [kind, categoryId] = expCategory.value.split(":");
  if (!kind || !categoryId || categoryId === EXTRA_ID){
    alert("Pick a valid category (Extra is not allowed).");
    return;
  }

  const year = getYearFromMonthKey(currentMonthKey);

  // Guard: annual budgets must stay within the current year
  if (kind === "annualBudget" && !String(dateISO).startsWith(year + "-")){
    alert(`Annual budget expenses must be within ${year}.`);
    return;
  }

  // Determine where to store the expense
  const editingId = expenseModal.dataset.editingId || "";
  const editingScope = expenseModal.dataset.editingScope || ""; // month|fund
  const editingMonthKey = expenseModal.dataset.editingMonthKey || "";

  if (kind === "fund"){
    // Stored globally
    const list = state.annual.funds.expenses;

    const existing = editingId && editingScope === "fund"
      ? list.find(e => e.id === editingId)
      : null;

    const record = {
      id: existing ? existing.id : uid(),
      categoryId,
      vendor, item, amount, dateISO, note
    };

    if (existing) Object.assign(existing, record);
    else list.push(record);

  } else {
    // Stored in a month budget
    const monthKeyToSave = (editingId && editingScope === "month" && editingMonthKey) ? editingMonthKey : currentMonthKey;
    const b = getBudget(monthKeyToSave);
    if (!b){
      alert("That month budget does not exist. Create it first.");
      return;
    }

    const existing = editingId && editingScope === "month"
      ? (b.expenses || []).find(e => e.id === editingId)
      : null;

    const record = {
      id: existing ? existing.id : uid(),
      kind, // monthly | annualBudget
      categoryId,
      vendor, item, amount, dateISO, note
    };

    if (existing) Object.assign(existing, record);
    else (b.expenses ||= []).push(record);
  }

  saveState();
  render();

  if (keepOpen){
    expenseModal.dataset.editingId = "";
    expenseModal.dataset.editingScope = "";
    expenseModal.dataset.editingMonthKey = "";
    expVendor.value = "";
    expItem.value = "";
    expAmount.value = "";
    expNote.value = "";
    expVendor.focus();
  } else {
    closeModal(expenseModal);
  }
}

// -------------------- Expense cards (Monthly in-month) --------------------
function bindMonthlyExpenseCardActions(container){
  container.querySelectorAll("[data-edit-month-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.editMonthExp;
      editMonthExpense(id);
    });
  });
  container.querySelectorAll("[data-del-month-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.delMonthExp;
      deleteMonthExpense(id);
    });
  });

  // Monthly category actions
  container.querySelectorAll("[data-edit-cat]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.editCat.split(":")[1];
      await editMonthlyCategory(id);
    });
  });
  container.querySelectorAll("[data-del-cat]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.delCat.split(":")[1];
      deleteMonthlyCategory(id);
    });
  });
}

function inlineExpenseCardHtml(ex){
  const title = `${escapeHtml(ex.vendor || "")}${ex.item ? " • " + escapeHtml(ex.item) : ""}`.trim() || "(No vendor/item)";
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
        <button class="icon-btn" data-edit-month-exp="${ex.id}">Edit</button>
        <button class="icon-btn" data-del-month-exp="${ex.id}">Delete</button>
      </div>
    </div>
  `;
}

function editMonthExpense(expId){
  const b = getBudget(currentMonthKey);
  if (!b) return;
  const ex = (b.expenses || []).find(e => e.id === expId && (e.kind === "monthly" || e.kind === "annualBudget"));
  if (!ex) return;

  openExpenseModal({
    id: ex.id,
    _scope: "month",
    _monthKey: currentMonthKey,
    kind: ex.kind,
    categoryId: ex.categoryId,
    vendor: ex.vendor,
    item: ex.item,
    amount: ex.amount,
    dateISO: ex.dateISO,
    note: ex.note
  });
}

function deleteMonthExpense(expId){
  const b = getBudget(currentMonthKey);
  if (!b) return;
  const idx = (b.expenses || []).findIndex(e => e.id === expId);
  if (idx === -1) return;
  if (!confirm("Delete this expense?")) return;

  b.expenses.splice(idx, 1);
  saveState();
  render();
}

// -------------------- Annual Budget expenses (YTD across year) --------------------
function inlineAnnualBudgetExpenseCardHtml(ex){
  const title = `${escapeHtml(ex.vendor || "")}${ex.item ? " • " + escapeHtml(ex.item) : ""}`.trim() || "(No vendor/item)";
  const note = ex.note ? escapeHtml(ex.note) : "";
  const mk = ex._monthKey || "";
  return `
    <div class="detail-card">
      <div class="detail-card-top">
        <div>
          <div class="exp-main">${title}</div>
          ${note ? `<div class="exp-sub">${note}</div>` : ``}
          <div class="exp-sub">${escapeHtml(ex.dateISO || "")}${mk ? ` • ${escapeHtml(monthKeyToLabel(mk))}` : ``}</div>
        </div>
        <div class="money">${fmtMoney(ex.amount)}</div>
      </div>
      <div class="detail-actions">
        <button class="icon-btn" data-edit-ab-exp="${ex.id}" data-ab-mk="${escapeAttr(mk)}">Edit</button>
        <button class="icon-btn" data-del-ab-exp="${ex.id}" data-ab-mk="${escapeAttr(mk)}">Delete</button>
      </div>
    </div>
  `;
}

function bindAnnualBudgetExpenseActions(container){
  container.querySelectorAll("[data-edit-ab-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      editAnnualBudgetExpense(btn.dataset.editAbExp, btn.dataset.abMk);
    });
  });
  container.querySelectorAll("[data-del-ab-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteAnnualBudgetExpense(btn.dataset.delAbExp, btn.dataset.abMk);
    });
  });
}

function findAnnualBudgetExpense(year, expId){
  for (const [mk, bud] of Object.entries(state.budgets || {})){
    if (!mk.startsWith(year + "-")) continue;
    const ex = (bud.expenses || []).find(e => e.id === expId && e.kind === "annualBudget");
    if (ex) return { monthKey: mk, budget: bud, expense: ex };
  }
  return null;
}

function editAnnualBudgetExpense(expId, monthKeyHint){
  const year = getYearFromMonthKey(currentMonthKey);
  let found = null;

  if (monthKeyHint && state.budgets[monthKeyHint]){
    const bud = state.budgets[monthKeyHint];
    const ex = (bud.expenses || []).find(e => e.id === expId && e.kind === "annualBudget");
    if (ex) found = { monthKey: monthKeyHint, budget: bud, expense: ex };
  }
  if (!found) found = findAnnualBudgetExpense(year, expId);
  if (!found) return;

  const ex = found.expense;

  openExpenseModal({
    id: ex.id,
    _scope: "month",
    _monthKey: found.monthKey,
    kind: "annualBudget",
    categoryId: ex.categoryId,
    vendor: ex.vendor,
    item: ex.item,
    amount: ex.amount,
    dateISO: ex.dateISO,
    note: ex.note
  });
}

function deleteAnnualBudgetExpense(expId, monthKeyHint){
  const year = getYearFromMonthKey(currentMonthKey);
  let found = null;

  if (monthKeyHint && state.budgets[monthKeyHint]){
    const bud = state.budgets[monthKeyHint];
    const idx = (bud.expenses || []).findIndex(e => e.id === expId && e.kind === "annualBudget");
    if (idx !== -1) found = { budget: bud, idx };
  }
  if (!found){
    const f = findAnnualBudgetExpense(year, expId);
    if (f){
      const idx = (f.budget.expenses || []).findIndex(e => e.id === expId && e.kind === "annualBudget");
      if (idx !== -1) found = { budget: f.budget, idx };
    }
  }
  if (!found) return;

  if (!confirm("Delete this expense?")) return;

  found.budget.expenses.splice(found.idx, 1);
  saveState();
  render();
}

// -------------------- Fund expenses (global) --------------------
function inlineFundExpenseCardHtml(ex){
  const title = `${escapeHtml(ex.vendor || "")}${ex.item ? " • " + escapeHtml(ex.item) : ""}`.trim() || "(No vendor/item)";
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
        <button class="icon-btn" data-edit-fund-exp="${ex.id}">Edit</button>
        <button class="icon-btn" data-del-fund-exp="${ex.id}">Delete</button>
      </div>
    </div>
  `;
}

function bindFundExpenseActions(container){
  container.querySelectorAll("[data-edit-fund-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.editFundExp;
      const ex = state.annual.funds.expenses.find(x => x.id === id);
      if (!ex) return;

      openExpenseModal({
        id: ex.id,
        _scope: "fund",
        kind: "fund",
        categoryId: ex.categoryId,
        vendor: ex.vendor,
        item: ex.item,
        amount: ex.amount,
        dateISO: ex.dateISO,
        note: ex.note
      });
    });
  });

  container.querySelectorAll("[data-del-fund-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.delFundExp;
      const idx = state.annual.funds.expenses.findIndex(x => x.id === id);
      if (idx === -1) return;
      if (!confirm("Delete this expense?")) return;

      state.annual.funds.expenses.splice(idx, 1);
      saveState();
      render();
    });
  });
}

// -------------------- Contributions --------------------
function inlineContributionCardHtml(c, meta){
  const note = c.note ? escapeHtml(c.note) : "";
  const subtitle = meta?.scope === "year"
    ? escapeHtml(c.dateISO || "")
    : escapeHtml(c.dateISO || "");

  return `
    <div class="detail-card">
      <div class="detail-card-top">
        <div>
          <div class="exp-main">Contribute</div>
          ${note ? `<div class="exp-sub">${note}</div>` : ``}
          <div class="exp-sub">${subtitle}</div>
        </div>
        <div class="money positive">${fmtMoney(c.amount)}</div>
      </div>
      <div class="detail-actions">
        <button class="icon-btn" data-edit-contrib="${c.id}" data-contrib-scope="${escapeAttr(meta?.scope||"")}" data-contrib-year="${escapeAttr(meta?.year||"")}">Edit</button>
        <button class="icon-btn" data-del-contrib="${c.id}" data-contrib-scope="${escapeAttr(meta?.scope||"")}" data-contrib-year="${escapeAttr(meta?.year||"")}">Delete</button>
      </div>
    </div>
  `;
}

function bindContributionActions(container){
  container.querySelectorAll("[data-edit-contrib]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await editContribution(btn.dataset.editContrib, btn.dataset.contribScope, btn.dataset.contribYear);
    });
  });
  container.querySelectorAll("[data-del-contrib]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteContribution(btn.dataset.delContrib, btn.dataset.contribScope, btn.dataset.contribYear);
    });
  });
}

async function addContribution(scope, catId){
  const year = getYearFromMonthKey(currentMonthKey);
  ensureAnnualReadyForYear(year);

  const isFund = scope === "fund";
  const cats = isFund ? state.annual.funds.categories : state.annual.years[year].categories;
  const cat = (cats || []).find(c => c.id === catId);
  if (!cat) return;

  const res = await promptForm(`Contribute to ${cat.name}`, [
    { key:"amount", label:"Amount", type:"money", placeholder:"0.00" },
    { key:"dateISO", label:"Date", type:"date", value: todayISO() },
    { key:"note", label:"Note", type:"text", placeholder:"Optional" }
  ]);
  if (!res) return;

  const amt = parseMoney(res.amount);
  if (!amt || amt === 0){
    alert("Amount must be greater than 0.");
    return;
  }

  const dateISO = res.dateISO || todayISO();
  if (!isFund && !String(dateISO).startsWith(year + "-")){
    alert(`Contribution date must be within ${year}.`);
    return;
  }

  const bucket = isFund ? state.annual.funds.contributions : state.annual.years[year].contributions;

  bucket.push({
    id: uid(),
    categoryId: catId,
    amount: amt,
    dateISO,
    note: (res.note || "").trim()
  });

  saveState();
  render();
}

async function editContribution(contribId, scope, year){
  const y = String(year || "");
  const isFund = scope === "fund";
  if (!isFund){
    ensureAnnualReadyForYear(y);
  }

  const bucket = isFund ? state.annual.funds.contributions : state.annual.years[y].contributions;
  const c = (bucket || []).find(x => x.id === contribId);
  if (!c) return;

  const res = await promptForm("Edit Contribution", [
    { key:"amount", label:"Amount", type:"money", value: moneyToInput(c.amount) },
    { key:"dateISO", label:"Date", type:"date", value: c.dateISO || todayISO() },
    { key:"note", label:"Note", type:"text", value: c.note || "" }
  ]);
  if (!res) return;

  const amt = parseMoney(res.amount);
  if (!amt || amt === 0){
    alert("Amount must be greater than 0.");
    return;
  }

  const dateISO = res.dateISO || todayISO();
  if (!isFund && !String(dateISO).startsWith(y + "-")){
    alert(`Contribution date must be within ${y}.`);
    return;
  }

  c.amount = amt;
  c.dateISO = dateISO;
  c.note = (res.note || "").trim();

  saveState();
  render();
}

function deleteContribution(contribId, scope, year){
  const y = String(year || "");
  const isFund = scope === "fund";
  if (!isFund){
    ensureAnnualReadyForYear(y);
  }

  const bucket = isFund ? state.annual.funds.contributions : state.annual.years[y].contributions;
  const idx = (bucket || []).findIndex(c => c.id === contribId);
  if (idx === -1) return;
  if (!confirm("Delete this contribution?")) return;

  bucket.splice(idx, 1);
  saveState();
  render();
}

// -------------------- Annual Budget stats --------------------
function getYearAnnualBudgetSpentByCat(year){
  const spent = {};
  for (const [mk, bud] of Object.entries(state.budgets || {})){
    if (!mk.startsWith(year + "-")) continue;
    (bud.expenses || []).forEach(ex => {
      if (ex.kind !== "annualBudget") return;
      const cid = ex.categoryId || null;
      if (!cid) return;
      spent[cid] = (spent[cid] || 0) + (ex.amount || 0);
    });
  }
  return spent;
}

function getYearAnnualBudgetExpensesAll(year){
  const out = [];
  for (const [mk, bud] of Object.entries(state.budgets || {})){
    if (!mk.startsWith(year + "-")) continue;
    (bud.expenses || []).forEach(ex => {
      if (ex.kind !== "annualBudget") return;
      out.push({ ...ex, _monthKey: mk });
    });
  }
  return out;
}

// -------------------- Fund stats --------------------
function getFundSpentByCat(){
  const spent = {};
  (state.annual.funds.expenses || []).forEach(ex => {
    const cid = ex.categoryId || null;
    if (!cid) return;
    spent[cid] = (spent[cid] || 0) + (ex.amount || 0);
  });
  return spent;
}

// -------------------- Month lifecycle --------------------
function setMonth(monthKey){
  currentMonthKey = monthKey;
  expanded = { type: null, id: null };
  render();
}

function createBudgetForMonth(monthKey, copyPrev){
  if (state.budgets[monthKey]) return;

  const prevKey = addMonths(monthKey, -1);
  const prev = state.budgets[prevKey];

  const base = {
    income: 0,
    monthlyCategories: [],
    expenses: []
  };

  if (copyPrev && prev){
    base.income = prev.income || 0;
    base.monthlyCategories = (prev.monthlyCategories || []).map(c => ({
      id: uid(),
      name: c.name,
      budgeted: c.budgeted || 0
    }));
  }

  state.budgets[monthKey] = base;
  saveState();
}

// -------------------- Annual Year setup (auto-copy last year budgets only) --------------------
function ensureAnnualReadyForYear(year){
  if (!state.annual) state.annual = { years:{}, funds:{ categories:[], contributions:[], expenses:[] } };
  if (!state.annual.years) state.annual.years = {};
  if (!state.annual.funds) state.annual.funds = { categories:[], contributions:[], expenses:[] };

  if (!state.annual.years[year]){
    // Create year shell
    state.annual.years[year] = { categories: [], contributions: [] };

    // Auto-copy previous year's categories (target+initial) ONLY (no contributions/expenses)
    const prevYear = String(Number(year) - 1);
    const prev = state.annual.years[prevYear];
    if (prev && (prev.categories || []).length){
      state.annual.years[year].categories = prev.categories.map(c => ({
        id: uid(),
        name: c.name,
        target: c.target || 0,
        initial: c.initial || 0
      }));
    }
  }
}

// -------------------- Ring helpers (drain with remaining) --------------------
function remainingPct(leftC, totalC){
  if (totalC <= 0) return 0;
  const p = leftC / totalC;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return p;
}

function remainingTone(leftC, totalC){
  if (totalC > 0 && leftC < 0) return "bad";
  const pct = remainingPct(leftC, totalC);
  if (pct >= 0.35) return "accent";
  if (pct >= 0.10) return "warn";
  return "bad";
}

function ringStyle(pct, tone){
  const deg = Math.round(360 * pct);
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--accent)";
  return `background: conic-gradient(${color} ${deg}deg, rgba(71,84,103,.18) 0deg);`;
}

// -------------------- Prompt modal --------------------
function promptForm(title, fields){
  return new Promise((resolve) => {
    promptTitle.textContent = title;

    promptFields.innerHTML = fields.map(f => {
      const value = f.value ?? "";
      const inputId = "pf_" + f.key;

      if (f.type === "date"){
        return `
          <label class="field field-span-2">
            <span>${escapeHtml(f.label)}</span>
            <input class="input" id="${inputId}" type="date" value="${escapeAttr(value)}" />
          </label>
        `;
      }

      if (f.type === "money"){
        return `
          <label class="field">
            <span>${escapeHtml(f.label)}</span>
            <input class="input input-money" id="${inputId}" inputmode="decimal"
                   placeholder="${escapeAttr(f.placeholder||"0.00")}"
                   value="${escapeAttr(value)}" />
          </label>
        `;
      }

      if (f.type === "select"){
        const opts = (f.options || []).map(o =>
          `<option value="${escapeAttr(o.value)}"${String(o.value)===String(value) ? " selected" : ""}>${escapeHtml(o.label)}</option>`
        ).join("");
        return `
          <label class="field field-span-2">
            <span>${escapeHtml(f.label)}</span>
            <select class="select" id="${inputId}">${opts}</select>
          </label>
        `;
      }

      return `
        <label class="field field-span-2">
          <span>${escapeHtml(f.label)}</span>
          <input class="input" id="${inputId}" type="text"
                 placeholder="${escapeAttr(f.placeholder||"")}"
                 value="${escapeAttr(value)}" />
        </label>
      `;
    }).join("");

    const ok = () => {
      const out = {};
      fields.forEach(f => {
        const el = document.getElementById("pf_" + f.key);
        out[f.key] = el ? el.value : "";
      });
      cleanup();
      resolve(out);
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    const cleanup = () => {
      closeModal(promptModal);
      promptOkBtn.removeEventListener("click", ok);
      promptCancelBtn.removeEventListener("click", cancel);
    };

    promptOkBtn.addEventListener("click", ok);
    promptCancelBtn.addEventListener("click", cancel);

    openModal(promptModal);

    const first = promptFields.querySelector("input,select");
    if (first) first.focus();
  });
}

// -------------------- Storage / migration / utilities --------------------
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return freshState();

    // Base shape
    if (!parsed.budgets) parsed.budgets = {};
    if (!parsed.annual) parsed.annual = { years:{}, funds:{ categories:[], contributions:[], expenses:[] } };

    // Migration from older v0.7 year-only shape (annualByYear)
    if (parsed.annualByYear && !parsed.annual?.years){
      parsed.annual = { years:{}, funds:{ categories:[], contributions:[], expenses:[] } };
      for (const [year, y] of Object.entries(parsed.annualByYear)){
        parsed.annual.years[year] = {
          categories: (y.categories || []).map(c => ({
            id: c.id,
            name: c.name,
            target: c.target || 0,
            initial: c.balance || 0 // older “balance” becomes “initial”
          })),
          contributions: (y.contributions || []).map(c => ({...c}))
        };
      }
      delete parsed.annualByYear;
    }

    // Ensure funds container
    if (!parsed.annual.funds) parsed.annual.funds = { categories:[], contributions:[], expenses:[] };
    if (!parsed.annual.years) parsed.annual.years = {};

    return parsed;
  } catch {
    return freshState();
  }
}

function freshState(){
  return {
    budgets:{},
    annual:{
      years:{},
      funds:{ categories:[], contributions:[], expenses:[] }
    }
  };
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getBudget(monthKey){
  return state.budgets[monthKey] || null;
}

function getMonthExpenses(budget, kind){
  return (budget.expenses || []).filter(e => e.kind === kind);
}

function seedMonthSelect(){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 24, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 12, 1);

  const keys = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth()+1, 1)){
    keys.push(getMonthKey(d));
  }

  Object.keys(state.budgets || {}).forEach(k => { if (!keys.includes(k)) keys.push(k); });

  keys.sort();
  monthSelect.innerHTML = keys.map(k => `<option value="${k}">${escapeHtml(monthKeyToLabel(k))}</option>`).join("");
}

function getMonthKey(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
}

function getYearFromMonthKey(monthKey){
  return String(monthKey).slice(0,4);
}

function monthKeyToLabel(k){
  const [y,m] = k.split("-").map(x=>parseInt(x,10));
  const dt = new Date(y, (m-1), 1);
  return dt.toLocaleString(undefined, { month:"long", year:"numeric" });
}

function addMonths(monthKey, delta){
  const [y, m] = monthKey.split("-").map(n => parseInt(n,10));
  const d = new Date(y, m-1 + delta, 1);
  return getMonthKey(d);
}

function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function parseMoney(v){
  if (v == null) return 0;
  const s = String(v).replace(/[^0-9.\-]/g,"");
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function toCents(n){
  const val = Number(n);
  if (!Number.isFinite(val)) return 0;
  return Math.round(val * 100);
}

function fromCents(c){
  return (Number(c) || 0) / 100;
}

function sumCents(arr){
  return arr.reduce((a,b)=> a + (Number(b) || 0), 0);
}

function sumMoney(arr){
  return arr.reduce((a,b)=> a + (Number(b) || 0), 0);
}

function fmtMoney(n){
  const val = Number(n);
  const safe = Number.isFinite(val) ? val : 0;
  return safe.toLocaleString(undefined, { style:"currency", currency:"USD" });
}

// No cents, negatives as -$50 (not parentheses)
function fmtMoney0(n){
  const val = Number(n);
  const safe = Number.isFinite(val) ? val : 0;
  const abs = Math.abs(safe);
  const formatted = abs.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  return safe < 0 ? "-" + formatted : formatted;
}

function moneyToInput(n){
  const val = Number(n);
  const safe = Number.isFinite(val) ? val : 0;
  return (Math.round(safe*100)/100).toFixed(2);
}

function openModal(el){
  el.classList.remove("hidden");
  const backdrop = el.querySelector(".modal-backdrop");
  if (backdrop) backdrop.dataset.close = "true";
}

function closeModal(el){
  el.classList.add("hidden");
}

function emptyRow(text){
  return `
    <div class="trow listgrid" style="cursor:default;">
      <div class="cell-muted" style="grid-column:1 / -1;">${escapeHtml(text)}</div>
    </div>
  `;
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function escapeAttr(str){
  return escapeHtml(str).replaceAll("\n"," ");
}
