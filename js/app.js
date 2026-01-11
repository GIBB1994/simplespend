/* SimpleSpend v0.7
  - Annual categories split into:
      * Annual Budgets (year-scoped, auto initial contribution = Budgeted)
      * Sinking Funds (year-scoped ledger with carry-forward initial(auto) from prior year ending balance)
  - Target does NOT participate in math. It is display-only (“Budgeted” for annual budgets, “Goal” for funds).
  - Category rollups show NO cents.
  - Rings are FULL when healthy and DRAIN as remaining decreases.
  - Extra (hidden uncategorized) enforced.
  - Annual detail shows ALL year entries (not just this month).
  - Contributions support Edit/Delete (initial(auto) is not directly editable).
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

let expanded = { type: null, id: null }; // type: "monthly"|"annual_budget"|"sinking_fund"
let amountMode = "left"; // "left" or "spent" (global toggle)

let state = loadState();
migrateLegacyStateIfNeeded();

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
      name: res.name.trim() || "Unnamed",
      budgeted: parseMoney(res.budgeted)
    });

    saveState();
    render();
  });

  addAnnualCategoryBtn.addEventListener("click", async () => {
    const b = getBudget(currentMonthKey);
    if (!b) return;

    const res = await promptForm("Add Annual Item", [
      { key:"kind", label:"Type", type:"select", options:[
        { value:"annual_budget", label:"Annual Budget" },
        { value:"sinking_fund", label:"Sinking Fund" }
      ]},
      { key:"name", label:"Name", type:"text", placeholder:"Vacation" },
      { key:"amount", label:"Budgeted / Goal", type:"money", placeholder:"2000.00" },
      { key:"start", label:"Starting Balance (fund only)", type:"money", placeholder:"0.00" }
    ]);
    if (!res) return;

    const kind = (res.kind === "sinking_fund") ? "sinking_fund" : "annual_budget";
    const id = uid();
    const name = res.name.trim() || "Unnamed";
    const amt = parseMoney(res.amount);
    const start = parseMoney(res.start);

    const cat = {
      id,
      kind,
      name,
      // display-only
      budgeted: kind === "annual_budget" ? amt : 0,
      goal: kind === "sinking_fund" ? amt : 0
    };

    b.annualCategories.push(cat);

    // Ensure initial(auto) for this year
    const year = currentMonthKey.slice(0,4);
    if (kind === "annual_budget"){
      upsertInitialAutoContribution({ year, categoryId:id, amount: cat.budgeted, mode:"set" });
    } else {
      // fund: starting balance goes into initial(auto) for current year if provided
      if (start && start !== 0){
        upsertInitialAutoContribution({ year, categoryId:id, amount: start, mode:"set" });
      } else {
        ensureSinkingFundCarryForward(year, id); // creates 0 initial if nothing to carry
      }
    }

    // propagate annual categories to other months in this year if they already exist
    propagateAnnualCategoryToYear(year, cat);

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

  // Keep annual category definitions consistent across the year (best-effort)
  syncAnnualCategoriesAcrossYear(currentMonthKey.slice(0,4));

  renderTotalsOnly();
  renderMonthlyTable();
  renderAnnualTables();
  refreshExpenseCategoryDropdown();
}

function renderTotalsOnly(){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const incomeC = toCents(b.income);

  const monthlyBudgetedC = sumCents(b.monthlyCategories.map(c => toCents(c.budgeted)));
  const monthlySpentC = sumCents(getMonthExpenses(b, "monthly").map(x => toCents(x.amount)));

  const plannedC = incomeC - monthlyBudgetedC;
  const leftC = incomeC - monthlySpentC;

  plannedRemainingEl.textContent = fmtMoneyNoCents(fromCents(plannedC));
  leftToSpendEl.textContent = fmtMoneyNoCents(fromCents(leftC));

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
  b.monthlyCategories.forEach(c => rows.push({ id:c.id, name:c.name, total:c.budgeted, kind:"normal" }));

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
      ? `${fmtMoneyNoCents(fromCents(leftC))} / ${fmtMoneyNoCents(fromCents(totalC))}`
      : `${fmtMoneyNoCents(fromCents(spentC))} / ${fmtMoneyNoCents(fromCents(totalC))}`;

    const lineClass = (amountMode === "left" && leftC < 0) ? "negative" : "";

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
              ${cat.kind !== "extra"
                ? `<button class="btn btn-primary" data-add-exp="monthly:${cat.id}">+ Add Expense</button>`
                : ``}
              ${cat.kind !== "extra"
                ? `<button class="btn btn-secondary" data-edit-cat="monthly:${cat.id}">Edit Category</button>`
                : ``}
              ${cat.kind !== "extra"
                ? `<button class="btn btn-ghost" data-del-cat="monthly:${cat.id}">Delete Category</button>`
                : ``}
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
  bindExpenseCardActions(monthlyTable);
}

// -------------------- Annual Tables --------------------
function renderAnnualTables(){
  const b = getBudget(currentMonthKey);
  const year = currentMonthKey.slice(0,4);

  // Ensure carry-forward is applied for sinking funds for this year (best-effort)
  b.annualCategories
    .filter(c => c.kind === "sinking_fund")
    .forEach(c => ensureSinkingFundCarryForward(year, c.id));

  const header = `
    <div class="thead listgrid">
      <div>Category</div>
      <div style="text-align:right;">${amountMode === "left" ? "Left / Total" : "Spent / Total"}</div>
      <div style="text-align:right;">&nbsp;</div>
    </div>
  `;

  // Annual budgets
  const budgets = b.annualCategories.filter(c => c.kind === "annual_budget");
  annualBudgetTable.innerHTML = budgets.length
    ? header + budgets.map(cat => annualBudgetRowHtml(cat, year)).join("")
    : header + emptyRow("No annual budgets yet. Add one.");

  // Sinking funds
  const funds = b.annualCategories.filter(c => c.kind === "sinking_fund");
  sinkingFundTable.innerHTML = funds.length
    ? sinkingHeaderHtml() + funds.map(cat => sinkingFundRowHtml(cat, year)).join("")
    : sinkingHeaderHtml() + emptyRow("No sinking funds yet. Add one.");

  bindListInteractions(annualBudgetTable);
  bindExpenseCardActions(annualBudgetTable);
  bindContributionActions(annualBudgetTable);

  bindListInteractions(sinkingFundTable);
  bindExpenseCardActions(sinkingFundTable);
  bindContributionActions(sinkingFundTable);
}

function annualBudgetRowHtml(cat, year){
  const ytd = getYearToDateAnnualLedger(year, cat.id);

  const totalC = toCents(ytd.contribTotal);
  const spentC = toCents(ytd.spentTotal);
  const leftC = totalC - spentC;

  const line = amountMode === "left"
    ? `${fmtMoneyNoCents(fromCents(leftC))} / ${fmtMoneyNoCents(fromCents(totalC))}`
    : `${fmtMoneyNoCents(fromCents(spentC))} / ${fmtMoneyNoCents(fromCents(totalC))}`;

  const lineClass = (amountMode === "left" && leftC < 0) ? "negative" : "";

  const pctRemain = remainingPct(leftC, totalC);
  const ringColor = remainingTone(leftC, totalC);
  const isOpen = expanded.type === "annual_budget" && expanded.id === cat.id;

  const contribs = ytd.contributions;
  const expenses = ytd.expenses;

  return `
    <div class="trow listgrid" data-toggle="annual_budget:${cat.id}">
      <div class="catcell">
        <span class="chev ${isOpen ? "open" : ""}">›</span>
        <div style="min-width:0;">
          <div class="catname">${escapeHtml(cat.name)}</div>
          <div class="catsub">Budgeted: ${escapeHtml(fmtMoneyNoCents(cat.budgeted || 0))}</div>
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
          <div class="detail-muted">${year} • Annual Budget</div>

          <div class="row row-wrap row-gap">
            <button class="btn btn-primary" data-add-exp="annual:${cat.id}">+ Add Expense</button>
            <button class="btn btn-secondary" data-contrib="annual:${cat.id}">+ Contribution</button>
            <button class="btn btn-secondary" data-edit-cat="annual:${cat.id}">Edit</button>
            <button class="btn btn-ghost" data-del-cat="annual:${cat.id}">Delete</button>
          </div>

          ${contribs.length ? `
            <div class="detail-muted">Contributions (year)</div>
            <div class="detail-list">
              ${contribs
                .slice()
                .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""))
                .map(c => inlineContributionCardHtml(c))
                .join("")}
            </div>
          ` : ``}

          <div class="detail-muted">Expenses (year)</div>
          ${expenses.length ? `
            <div class="detail-list">
              ${expenses
                .slice()
                .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""))
                .map(ex => inlineExpenseCardHtml(ex))
                .join("")}
            </div>
          ` : `<div class="cell-muted">No expenses yet this year.</div>`}
        </div>
      </div>
    </div>
  `;
}

function sinkingHeaderHtml(){
  // Sinking funds show balance only, but we keep header shape stable.
  return `
    <div class="thead listgrid">
      <div>Category</div>
      <div style="text-align:right;">Balance</div>
      <div style="text-align:right;">&nbsp;</div>
    </div>
  `;
}

function sinkingFundRowHtml(cat, year){
  const ytd = getYearToDateAnnualLedger(year, cat.id);

  const totalC = toCents(ytd.contribTotal);
  const spentC = toCents(ytd.spentTotal);
  const balC = totalC - spentC;

  const line = `${fmtMoneyNoCents(fromCents(balC))}`;
  const lineClass = balC < 0 ? "negative" : "";

  // Ring for sinking fund: based on goal if goal > 0, otherwise based on "non-negative"
  const goalC = toCents(cat.goal || 0);
  const pct = goalC > 0 ? clamp01((balC) / goalC) : (balC > 0 ? 1 : 0);
  const ringColor = (balC < 0) ? "bad" : (goalC > 0 && balC >= goalC) ? "accent" : "warn";
  const isOpen = expanded.type === "sinking_fund" && expanded.id === cat.id;

  const contribs = ytd.contributions;
  const expenses = ytd.expenses;

  return `
    <div class="trow listgrid" data-toggle="sinking_fund:${cat.id}">
      <div class="catcell">
        <span class="chev ${isOpen ? "open" : ""}">›</span>
        <div style="min-width:0;">
          <div class="catname">${escapeHtml(cat.name)}</div>
          ${cat.goal ? `<div class="catsub">Goal: ${escapeHtml(fmtMoneyNoCents(cat.goal || 0))}</div>` : ``}
        </div>
      </div>

      <button class="amountbtn" data-toggle-amount="0" type="button" aria-label="Balance">
        <div class="amountline money ${lineClass}">${escapeHtml(line)}</div>
      </button>

      <div class="ring" style="${ringStyle(pct, ringColor)}"></div>
    </div>

    <div class="detail-row">
      <div class="detail-anim ${isOpen ? "open" : ""}">
        <div class="detail-inner">
          <div class="detail-muted">${year} • Sinking Fund</div>

          <div class="row row-wrap row-gap">
            <button class="btn btn-primary" data-add-exp="annual:${cat.id}">+ Add Expense</button>
            <button class="btn btn-secondary" data-contrib="annual:${cat.id}">+ Contribution</button>
            <button class="btn btn-secondary" data-edit-cat="annual:${cat.id}">Edit</button>
            <button class="btn btn-ghost" data-del-cat="annual:${cat.id}">Delete</button>
          </div>

          ${contribs.length ? `
            <div class="detail-muted">Contributions (year)</div>
            <div class="detail-list">
              ${contribs
                .slice()
                .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""))
                .map(c => inlineContributionCardHtml(c))
                .join("")}
            </div>
          ` : ``}

          <div class="detail-muted">Expenses (year)</div>
          ${expenses.length ? `
            <div class="detail-list">
              ${expenses
                .slice()
                .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""))
                .map(ex => inlineExpenseCardHtml(ex))
                .join("")}
            </div>
          ` : `<div class="cell-muted">No expenses yet this year.</div>`}
        </div>
      </div>
    </div>
  `;
}

// -------------------- List interactions --------------------
function bindListInteractions(container){
  // Row expand/collapse
  container.querySelectorAll("[data-toggle]").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const [type, id] = row.dataset.toggle.split(":");
      expanded = (expanded.type === type && expanded.id === id) ? {type:null, id:null} : {type, id};
      render();
    });
  });

  // Amount toggle (global) — only if present
  container.querySelectorAll("[data-toggle-amount]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.toggleAmount !== "1") return; // sinking funds use 0
      amountMode = (amountMode === "left") ? "spent" : "left";
      render();
    });
  });

  // Add expense from category
  container.querySelectorAll("[data-add-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const [type, id] = btn.dataset.addExp.split(":");
      openExpenseModal({ type, categoryId:id });
    });
  });

  // Edit category
  container.querySelectorAll("[data-edit-cat]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const [type, id] = btn.dataset.editCat.split(":");
      await editCategory(type, id);
    });
  });

  // Delete category => orphan expenses to Extra
  container.querySelectorAll("[data-del-cat]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const [type, id] = btn.dataset.delCat.split(":");
      deleteCategory(type, id);
    });
  });

  // Contribution (annual)
  container.querySelectorAll("[data-contrib]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const [_, id] = btn.dataset.contrib.split(":");
      await addContribution(id);
    });
  });
}

// -------------------- Category actions --------------------
async function editCategory(type, id){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  if (type === "monthly"){
    const cat = b.monthlyCategories.find(c => c.id === id);
    if (!cat) return;

    const res = await promptForm("Edit Monthly Category", [
      { key:"name", label:"Name", type:"text", value: cat.name },
      { key:"budgeted", label:"Budgeted", type:"money", value: moneyToInput(cat.budgeted) }
    ]);
    if (!res) return;

    cat.name = res.name.trim() || cat.name;
    cat.budgeted = parseMoney(res.budgeted);

  } else {
    // annual edit applies across the whole year for consistency
    const year = currentMonthKey.slice(0,4);
    const cat = b.annualCategories.find(c => c.id === id);
    if (!cat) return;

    if (cat.kind === "annual_budget"){
      const res = await promptForm("Edit Annual Budget", [
        { key:"name", label:"Name", type:"text", value: cat.name },
        { key:"budgeted", label:"Budgeted", type:"money", value: moneyToInput(cat.budgeted || 0) }
      ]);
      if (!res) return;

      const newName = res.name.trim() || cat.name;
      const newBudgeted = parseMoney(res.budgeted);

      updateAnnualCategoryAcrossYear(year, id, (c) => {
        c.name = newName;
        c.budgeted = newBudgeted;
      });

      // Update initial(auto) to match Budgeted
      upsertInitialAutoContribution({ year, categoryId:id, amount: newBudgeted, mode:"set" });

    } else {
      const res = await promptForm("Edit Sinking Fund", [
        { key:"name", label:"Name", type:"text", value: cat.name },
        { key:"goal", label:"Goal", type:"money", value: moneyToInput(cat.goal || 0) }
      ]);
      if (!res) return;

      const newName = res.name.trim() || cat.name;
      const newGoal = parseMoney(res.goal);

      updateAnnualCategoryAcrossYear(year, id, (c) => {
        c.name = newName;
        c.goal = newGoal;
      });

      // ensure carry-forward stays correct
      ensureSinkingFundCarryForward(year, id);
    }
  }

  saveState();
  render();
}

function deleteCategory(type, id){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const label = (type === "monthly") ? "monthly" : "annual";
  if (!confirm(`Delete this ${label} category? Existing expenses will move to "${EXTRA_NAME}".`)) return;

  if (type === "monthly"){
    b.expenses.forEach(ex => {
      if (ex.type === "monthly" && ex.categoryId === id){
        ex.categoryId = EXTRA_ID;
      }
    });
    b.monthlyCategories = b.monthlyCategories.filter(c => c.id !== id);

  } else {
    const year = currentMonthKey.slice(0,4);

    // Move ANNUAL expenses for this year to Extra
    Object.entries(state.budgets).forEach(([mk, mb]) => {
      if (!mk.startsWith(year + "-")) return;
      (mb.expenses || []).forEach(ex => {
        if (ex.type === "annual" && ex.categoryId === id){
          ex.categoryId = EXTRA_ID;
        }
      });
      (mb.contributions || []).forEach(c => {
        if (c.categoryId === id){
          // delete contributions for deleted annual item (they can't meaningfully go to Extra)
          c._deleted = true;
        }
      });
      mb.contributions = (mb.contributions || []).filter(c => !c._deleted);
    });

    // Remove annual category from all months in the year
    Object.entries(state.budgets).forEach(([mk, mb]) => {
      if (!mk.startsWith(year + "-")) return;
      mb.annualCategories = (mb.annualCategories || []).filter(c => c.id !== id);
    });

    // If we were expanded, collapse
    if ((expanded.type === "annual_budget" || expanded.type === "sinking_fund") && expanded.id === id){
      expanded = {type:null, id:null};
    }
  }

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

  // If no categories exist, block adding expenses (Extra is not selectable)
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

  if (prefill?.type && prefill?.categoryId && prefill.categoryId !== EXTRA_ID){
    const key = `${prefill.type}:${prefill.categoryId}`;
    const exists = Array.from(expCategory.options).some(o => o.value === key);
    if (exists) expCategory.value = key;
  } else {
    expCategory.selectedIndex = 0;
  }

  expenseModal.dataset.editingId = prefill.id || "";
  openModal(expenseModal);
  expVendor.focus();
}

function refreshExpenseCategoryDropdown(){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const opts = [];

  // Monthly categories (exclude Extra)
  b.monthlyCategories.forEach(c => opts.push({ value:`monthly:${c.id}`, label:`(Monthly) ${c.name}` }));

  // Annual categories (exclude Extra)
  b.annualCategories.forEach(c => opts.push({ value:`annual:${c.id}`, label:`(Annual) ${c.name}` }));

  expCategory.innerHTML = opts.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("");
}

function saveExpense({ keepOpen }){
  const b = getBudget(currentMonthKey);
  if (!b) return;

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

  const [type, categoryId] = expCategory.value.split(":");
  if (!type || !categoryId || categoryId === EXTRA_ID){
    alert("Pick a valid category (Extra is not allowed).");
    return;
  }

  // annual expenses are year-scoped in display, but stored per-month;
  // we’ll still store in the selected month record for simplicity.
  const editingId = expenseModal.dataset.editingId || "";
  const existing = editingId ? b.expenses.find(e => e.id === editingId) : null;

  const record = {
    id: existing ? existing.id : uid(),
    type,
    categoryId,
    vendor,
    item,
    amount,
    dateISO,
    note
  };

  if (existing) Object.assign(existing, record);
  else b.expenses.push(record);

  saveState();
  render();

  if (keepOpen){
    expenseModal.dataset.editingId = "";
    expVendor.value = "";
    expItem.value = "";
    expAmount.value = "";
    expNote.value = "";
    expVendor.focus();
  } else {
    closeModal(expenseModal);
  }
}

// -------------------- Expense cards --------------------
function bindExpenseCardActions(container){
  container.querySelectorAll("[data-del-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteExpense(btn.dataset.delExp); });
  });
  container.querySelectorAll("[data-edit-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); editExpense(btn.dataset.editExp); });
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
        <button class="icon-btn" data-edit-exp="${ex.id}">Edit</button>
        <button class="icon-btn" data-del-exp="${ex.id}">Delete</button>
      </div>
    </div>
  `;
}

function editExpense(expId){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const ex = b.expenses.find(e => e.id === expId);
  if (!ex) return;

  openExpenseModal({
    id: ex.id,
    type: ex.type,
    categoryId: ex.categoryId,
    vendor: ex.vendor,
    item: ex.item,
    amount: ex.amount,
    dateISO: ex.dateISO,
    note: ex.note
  });
}

function deleteExpense(expId){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const idx = b.expenses.findIndex(e => e.id === expId);
  if (idx === -1) return;

  if (!confirm("Delete this expense?")) return;

  b.expenses.splice(idx, 1);

  saveState();
  render();
}

// -------------------- Contributions --------------------
async function addContribution(catId){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const cat = b.annualCategories.find(c => c.id === catId);
  if (!cat) return;

  const res = await promptForm(`Add Contribution`, [
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

  // store contribution in this month record; annual views aggregate across year
  b.contributions = b.contributions || [];
  b.contributions.push({
    id: uid(),
    categoryId: catId,
    amount: amt,
    dateISO: res.dateISO || todayISO(),
    note: (res.note || "").trim(),
    kind: "manual"
  });

  // for sinking funds, keep carry-forward sane
  if (cat.kind === "sinking_fund"){
    ensureSinkingFundCarryForward(currentMonthKey.slice(0,4), catId);
  }

  saveState();
  render();
}

function bindContributionActions(container){
  container.querySelectorAll("[data-del-contrib]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteContribution(btn.dataset.delContrib); });
  });
  container.querySelectorAll("[data-edit-contrib]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); editContribution(btn.dataset.editContrib); });
  });
}

function inlineContributionCardHtml(c){
  const note = c.note ? escapeHtml(c.note) : "";
  const isAuto = c.kind === "initial";

  return `
    <div class="detail-card">
      <div class="detail-card-top">
        <div>
          <div class="exp-main">Contribution ${isAuto ? `<span class="auto-pill">Initial (auto)</span>` : ``}</div>
          ${note ? `<div class="exp-sub">${note}</div>` : ``}
          <div class="exp-sub">${escapeHtml(c.dateISO || "")}</div>
        </div>
        <div class="money positive">${fmtMoney(c.amount)}</div>
      </div>
      <div class="detail-actions">
        ${isAuto ? `` : `<button class="icon-btn" data-edit-contrib="${c.id}">Edit</button>`}
        ${isAuto ? `` : `<button class="icon-btn" data-del-contrib="${c.id}">Delete</button>`}
      </div>
    </div>
  `;
}

function editContribution(contribId){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const year = currentMonthKey.slice(0,4);
  const found = findContributionInYear(year, contribId);
  if (!found) return;

  const { monthKey, rec } = found;
  if (rec.kind === "initial"){
    alert("Initial (auto) is controlled by Budgeted / carry-forward.");
    return;
  }

  promptForm("Edit Contribution", [
    { key:"amount", label:"Amount", type:"money", value: moneyToInput(rec.amount) },
    { key:"dateISO", label:"Date", type:"date", value: rec.dateISO || todayISO() },
    { key:"note", label:"Note", type:"text", value: rec.note || "" }
  ]).then(res => {
    if (!res) return;
    const amt = parseMoney(res.amount);
    if (!amt || amt === 0){
      alert("Amount must be greater than 0.");
      return;
    }

    const mb = getBudget(monthKey);
    const target = (mb.contributions || []).find(x => x.id === contribId);
    if (!target) return;

    target.amount = amt;
    target.dateISO = res.dateISO || target.dateISO;
    target.note = (res.note || "").trim();

    saveState();
    render();
  });
}

function deleteContribution(contribId){
  const year = currentMonthKey.slice(0,4);
  const found = findContributionInYear(year, contribId);
  if (!found) return;

  const { monthKey, rec } = found;

  if (rec.kind === "initial"){
    alert("Initial (auto) cannot be deleted.");
    return;
  }

  if (!confirm("Delete this contribution?")) return;

  const mb = getBudget(monthKey);
  mb.contributions = (mb.contributions || []).filter(c => c.id !== contribId);

  saveState();
  render();
}

function findContributionInYear(year, contribId){
  let out = null;
  Object.entries(state.budgets).forEach(([mk, b]) => {
    if (out) return;
    if (!mk.startsWith(year + "-")) return;
    const hit = (b.contributions || []).find(c => c.id === contribId);
    if (hit) out = { monthKey: mk, rec: hit };
  });
  return out;
}

// -------------------- Annual YTD aggregation --------------------
function getYearToDateAnnualLedger(yearStr, categoryId){
  const expenses = [];
  const contributions = [];

  Object.entries(state.budgets).forEach(([mk, b]) => {
    if (!mk.startsWith(yearStr + "-")) return;

    (b.expenses || []).forEach(ex => {
      if (ex.type !== "annual") return;
      if (ex.categoryId !== categoryId) return;
      expenses.push(ex);
    });

    (b.contributions || []).forEach(c => {
      if (c.categoryId !== categoryId) return;
      contributions.push(c);
    });
  });

  const spentTotal = expenses.reduce((a,x)=> a + (Number(x.amount)||0), 0);
  const contribTotal = contributions.reduce((a,x)=> a + (Number(x.amount)||0), 0);

  return { expenses, contributions, spentTotal, contribTotal };
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
    annualCategories: [],
    expenses: [],
    contributions: []
  };

  if (copyPrev && prev){
    base.income = prev.income || 0;

    base.monthlyCategories = prev.monthlyCategories.map(c => ({
      id: uid(),
      name: c.name,
      budgeted: c.budgeted || 0
    }));

    // annual categories keep SAME ids (critical)
    base.annualCategories = (prev.annualCategories || []).map(c => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      budgeted: c.budgeted || 0,
      goal: c.goal || 0
    }));
  }

  state.budgets[monthKey] = base;

  // If it's January, apply annual budget initial(auto)=budgeted, and sinking carry-forward initial(auto)
  const year = monthKey.slice(0,4);
  const m = monthKey.slice(5,7);

  if (m === "01"){
    // Annual budgets: ensure initial(auto)=budgeted
    base.annualCategories.filter(c => c.kind === "annual_budget").forEach(c => {
      upsertInitialAutoContribution({ year, categoryId: c.id, amount: c.budgeted || 0, mode:"set" });
    });

    // Sinking funds: carry-forward from prior year ending
    base.annualCategories.filter(c => c.kind === "sinking_fund").forEach(c => {
      ensureSinkingFundCarryForward(year, c.id);
    });
  }

  saveState();
}

// -------------------- Annual initial(auto) helpers --------------------
function upsertInitialAutoContribution({ year, categoryId, amount, mode }){
  // Stored in the January budget if it exists; otherwise stored in the earliest month found for that year; otherwise current month.
  const janKey = `${year}-01`;
  let targetKey = state.budgets[janKey] ? janKey : null;

  if (!targetKey){
    const keys = Object.keys(state.budgets).filter(k => k.startsWith(year + "-")).sort();
    targetKey = keys[0] || currentMonthKey;
    if (!state.budgets[targetKey]){
      // if current month budget doesn't exist yet, bail
      return;
    }
  }

  const b = state.budgets[targetKey];
  b.contributions = b.contributions || [];

  const existing = b.contributions.find(c => c.categoryId === categoryId && c.kind === "initial");
  const amt = Number(amount) || 0;

  if (existing){
    if (mode === "set"){
      existing.amount = amt;
      existing.dateISO = existing.dateISO || `${year}-01-01`;
      existing.note = existing.note || "";
    }
    return;
  }

  b.contributions.push({
    id: uid(),
    categoryId,
    amount: amt,
    dateISO: `${year}-01-01`,
    note: "",
    kind: "initial"
  });
}


  function ensureSinkingFundCarryForward(year, categoryId){
  const prevYear = String(Number(year) - 1);

  // Prior year ending balance:
  // balance = total contributions - total expenses (for that year)
  const prevLedger = getYearToDateAnnualLedger(prevYear, categoryId);
  const prevEnd = (Number(prevLedger.contribTotal)||0) - (Number(prevLedger.spentTotal)||0);

  // Set current year initial(auto) to that ending balance.
  // If prev year doesn't exist yet, this becomes 0.
  upsertInitialAutoContribution({ year, categoryId, amount: prevEnd, mode:"set" });
}




// -------------------- Annual category propagation --------------------
function propagateAnnualCategoryToYear(year, cat){
  Object.entries(state.budgets).forEach(([mk, b]) => {
    if (!mk.startsWith(year + "-")) return;
    b.annualCategories = b.annualCategories || [];
    const exists = b.annualCategories.some(x => x.id === cat.id);
    if (!exists) b.annualCategories.push({ ...cat });
  });
}

function updateAnnualCategoryAcrossYear(year, id, mutator){
  Object.entries(state.budgets).forEach(([mk, b]) => {
    if (!mk.startsWith(year + "-")) return;
    const cat = (b.annualCategories || []).find(c => c.id === id);
    if (cat) mutator(cat);
  });
}

function syncAnnualCategoriesAcrossYear(year){
  // pick the "most complete" annualCategories list from any month in this year as source
  const keys = Object.keys(state.budgets).filter(k => k.startsWith(year + "-")).sort();
  if (!keys.length) return;

  let source = null;
  for (const k of keys){
    const b = state.budgets[k];
    if ((b.annualCategories || []).length){
      source = b.annualCategories;
      break;
    }
  }
  if (!source) return;

  // ensure every month has the same set (by id)
  keys.forEach(k => {
    const b = state.budgets[k];
    b.annualCategories = b.annualCategories || [];
    source.forEach(sc => {
      const exists = b.annualCategories.some(x => x.id === sc.id);
      if (!exists) b.annualCategories.push({ ...sc });
    });
  });
}

// -------------------- Ring helpers (drain by remaining) --------------------
function remainingPct(leftC, totalC){
  if (totalC <= 0){
    return leftC > 0 ? 1 : 0;
  }
  return clamp01(leftC / totalC);
}

function remainingTone(leftC, totalC){
  if (totalC > 0 && leftC < 0) return "bad";
  const p = remainingPct(leftC, totalC);
  if (p >= 0.65) return "accent";
  if (p >= 0.20) return "warn";
  return "bad";
}

function ringStyle(pct, tone){
  const deg = Math.round(360 * pct);
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--good)";
  return `background: conic-gradient(${color} ${deg}deg, rgba(71,84,103,.18) 0deg);`;
}

function clamp01(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
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
          `<option value="${escapeAttr(o.value)}" ${String(o.value)===String(f.value)?"selected":""}>${escapeHtml(o.label)}</option>`
        ).join("");
        return `
          <label class="field">
            <span>${escapeHtml(f.label)}</span>
            <select class="select" id="${inputId}">
              ${opts}
            </select>
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

    const first = promptFields.querySelector("input, select");
    if (first) first.focus();
  });
}

// -------------------- Storage / utilities --------------------
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { budgets:{} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { budgets:{} };
    if (!parsed.budgets) parsed.budgets = {};
    return parsed;
  } catch {
    return { budgets:{} };
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getBudget(monthKey){
  return state.budgets[monthKey] || null;
}

function getMonthExpenses(budget, type){
  return (budget.expenses || []).filter(e => e.type === type);
}

function seedMonthSelect(){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 24, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 12, 1);

  const keys = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth()+1, 1)){
    keys.push(getMonthKey(d));
  }

  Object.keys(state.budgets).forEach(k => { if (!keys.includes(k)) keys.push(k); });

  keys.sort();
  monthSelect.innerHTML = keys.map(k => `<option value="${k}">${escapeHtml(monthKeyToLabel(k))}</option>`).join("");
}

function getMonthKey(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
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

function fmtMoney(n){
  const val = Number(n);
  const safe = Number.isFinite(val) ? val : 0;
  return safe.toLocaleString(undefined, { style:"currency", currency:"USD" });
}

function fmtMoneyNoCents(n){
  const val = Number(n);
  const safe = Number.isFinite(val) ? val : 0;
  // US locale already shows negatives as -$50 (not parentheses)
  return safe.toLocaleString(undefined, { style:"currency", currency:"USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

// -------------------- Migration (best-effort) --------------------
function migrateLegacyStateIfNeeded(){
  // If you had v0.6 data, it lived under simplespend_v06.
  // We'll try to import it once.
  if (Object.keys(state.budgets || {}).length) return;

  try{
    const raw = localStorage.getItem("simplespend_v06");
    if (!raw) return;
    const legacy = JSON.parse(raw);
    if (!legacy?.budgets) return;

    // Bring over month budgets as-is, but:
    // - remove old annual balance fields if present
    // - ensure annual categories have kind
    Object.entries(legacy.budgets).forEach(([mk, b]) => {
      const nb = {
        income: Number(b.income)||0,
        monthlyCategories: Array.isArray(b.monthlyCategories) ? b.monthlyCategories : [],
        annualCategories: Array.isArray(b.annualCategories) ? b.annualCategories.map(c => ({
          id: c.id,
          kind: c.kind || "annual_budget",
          name: c.name || "Unnamed",
          budgeted: Number(c.target ?? c.budgeted ?? 0) || 0,
          goal: Number(c.goal ?? 0) || 0
        })) : [],
        expenses: Array.isArray(b.expenses) ? b.expenses : [],
        contributions: Array.isArray(b.contributions) ? b.contributions.map(c => ({...c, kind: c.kind || "manual"})) : []
      };

      // ensure annual budget initial(auto) exists for each year-month set (only if Jan exists later)
      state.budgets[mk] = nb;
    });

    saveState();
  } catch {
    // ignore
  }
}
