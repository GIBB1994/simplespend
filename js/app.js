/* SimpleSpend (localStorage prototype)
   - Month-first budgets
   - Monthly categories: inline expand with chevron + animation
   - Annual categories: inline expand with chevron + animation + contributions (deletable)
   - Totals use cents math (shows negative correctly)
   - Version badge reads VERSION.txt
*/

const APP_FALLBACK_VERSION = "v0.4";
const STORAGE_KEY = "simplespend_v04";

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

let expanded = { type: null, id: null }; // {type:"monthly"|"annual", id:"..."}

/*
state = {
  budgets: {
    "YYYY-MM": {
      income: number,
      monthlyCategories: [{id, name, budgeted}],
      annualCategories: [{id, name, target, balance}],
      expenses: [{ id, type, categoryId, vendor, item, amount, dateISO, note }],
      contributions: [{ id, categoryId, amount, dateISO, note }]
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

  // FIX: income typing (avoid "0.005000")
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

    const res = await promptForm("Add Annual Category", [
      { key:"name", label:"Name", type:"text", placeholder:"Vacation" },
      { key:"target", label:"Annual Target", type:"money", placeholder:"2000.00" },
      { key:"balance", label:"Starting Balance", type:"money", placeholder:"0.00" }
    ]);
    if (!res) return;

    b.annualCategories.push({
      id: uid(),
      name: res.name.trim() || "Unnamed",
      target: parseMoney(res.target),
      balance: parseMoney(res.balance)
    });

    saveState();
    render();
  });

  addExpenseBtn.addEventListener("click", () => openExpenseModal());

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

  renderTotalsOnly();
  renderMonthlyTable();
  renderAnnualTable();
  refreshExpenseCategoryDropdown();
}

function renderTotalsOnly(){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const incomeC = toCents(b.income);

  const monthlyBudgetedC = sumCents(b.monthlyCategories.map(c => toCents(c.budgeted)));
  const monthlySpentC = sumCents(getMonthExpenses(b, "monthly").map(x => toCents(x.amount)));

  const plannedC = incomeC - monthlyBudgetedC;     // can go negative
  const leftC = incomeC - monthlySpentC;           // MUST show negative when overspent

  plannedRemainingEl.textContent = fmtMoney(fromCents(plannedC));
  leftToSpendEl.textContent = fmtMoney(fromCents(leftC));

  plannedRemainingEl.className = "stat-value " + (plannedC < 0 ? "negative" : "positive");
  leftToSpendEl.className = "stat-value " + (leftC < 0 ? "negative" : "positive");
}

// -------------------- Monthly Table --------------------
function renderMonthlyTable(){
  const b = getBudget(currentMonthKey);
  const expenses = getMonthExpenses(b, "monthly");

  const head = `
    <div class="thead">
      <div>Category</div>
      <div class="money">Budgeted</div>
      <div class="money">Spent</div>
      <div class="money">Remaining</div>
      <div></div>
    </div>
  `;

  let html = head;

  if (!b.monthlyCategories.length){
    monthlyTable.innerHTML = head + emptyRow("No monthly categories yet. Add one.");
    return;
  }

  b.monthlyCategories.forEach(cat => {
    const spentC = sumCents(expenses.filter(e => e.categoryId === cat.id).map(e => toCents(e.amount)));
    const budgetedC = toCents(cat.budgeted);
    const remainingC = budgetedC - spentC;

    const remClass = remainingC < 0 ? "negative" : "positive";
    const isOpen = expanded.type === "monthly" && expanded.id === cat.id;

    html += `
      <div class="trow" data-toggle-category="monthly:${cat.id}">
        <div class="catcell">
          <span class="chev ${isOpen ? "open" : ""}">›</span>
          <div style="min-width:0;">
            <div>${escapeHtml(cat.name)}</div>
          </div>
        </div>
        <div class="money">${fmtMoney(fromCents(budgetedC))}</div>
        <div class="money">${fmtMoney(fromCents(spentC))}</div>
        <div class="money ${remClass}">${fmtMoney(fromCents(remainingC))}</div>
        <div class="row" style="justify-content:flex-end;">
          <button class="icon-btn" data-edit-monthly="${cat.id}" title="Edit">Edit</button>
          <button class="icon-btn" data-del-monthly="${cat.id}" title="Delete">Del</button>
        </div>
      </div>
    `;

    const list = expenses
      .filter(e => (e.categoryId || null) === cat.id)
      .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""));

    html += `
      <div class="detail-row">
        <div class="detail-anim ${isOpen ? "open" : ""}">
          <div class="detail-inner">
            <div class="detail-muted">${monthKeyToLabel(currentMonthKey)} • Monthly</div>
            ${list.length ? `
              <div class="detail-list">
                ${list.map(ex => inlineExpenseCardHtml(ex)).join("")}
              </div>
            ` : `<div class="detail-muted">No expenses for this category in this month.</div>`}
          </div>
        </div>
      </div>
    `;
  });

  monthlyTable.innerHTML = html;

  monthlyTable.querySelectorAll("[data-toggle-category]").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const [type, id] = row.dataset.toggleCategory.split(":");
      expanded = (expanded.type === type && expanded.id === id)
        ? { type:null, id:null }
        : { type, id };
      render();
    });
  });

  monthlyTable.querySelectorAll("[data-edit-monthly]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.editMonthly;
      const cat = b.monthlyCategories.find(c => c.id === id);
      if (!cat) return;

      const res = await promptForm("Edit Monthly Category", [
        { key:"name", label:"Name", type:"text", value: cat.name },
        { key:"budgeted", label:"Budgeted", type:"money", value: moneyToInput(cat.budgeted) }
      ]);
      if (!res) return;

      cat.name = res.name.trim() || cat.name;
      cat.budgeted = parseMoney(res.budgeted);

      saveState();
      render();
    });
  });

  monthlyTable.querySelectorAll("[data-del-monthly]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.delMonthly;

      if (!confirm("Delete this monthly category? Expenses will remain but be uncategorized (you can reassign).")) return;

      b.monthlyCategories = b.monthlyCategories.filter(c => c.id !== id);
      b.expenses.forEach(ex => {
        if (ex.type === "monthly" && ex.categoryId === id) ex.categoryId = null;
      });

      if (expanded.type === "monthly" && expanded.id === id) expanded = { type:null, id:null };

      saveState();
      render();
    });
  });

  monthlyTable.querySelectorAll("[data-del-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteExpense(btn.dataset.delExp); });
  });
  monthlyTable.querySelectorAll("[data-edit-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); editExpense(btn.dataset.editExp); });
  });
}

// -------------------- Annual Table --------------------
function renderAnnualTable(){
  const b = getBudget(currentMonthKey);
  const year = currentMonthKey.slice(0,4);
  const ytd = getYearToDateAnnualStats(year);

  const head = `
    <div class="thead annual-grid">
      <div>Category</div>
      <div class="money">Target</div>
      <div class="money">YTD Spent</div>
      <div class="money">Balance</div>
      <div></div>
    </div>
  `;

  let html = head;

  if (!b.annualCategories.length){
    annualTable.innerHTML = head + emptyRow("No annual categories yet. Add one.");
    return;
  }

  const monthAnnualEx = getMonthExpenses(b, "annual");
  const monthContrib = (b.contributions || []);

  b.annualCategories.forEach(cat => {
    const stats = ytd[cat.id] || { spent: 0 };
    const targetC = toCents(cat.target);
    const spentYtdC = toCents(stats.spent);
    const remainingOfTargetC = targetC - spentYtdC;
    const remClass = remainingOfTargetC < 0 ? "negative" : "positive";

    const balanceC = toCents(cat.balance);
    const isOpen = expanded.type === "annual" && expanded.id === cat.id;

    html += `
      <div class="trow annual-grid" data-toggle-category="annual:${cat.id}">
        <div class="catcell">
          <span class="chev ${isOpen ? "open" : ""}">›</span>
          <div style="min-width:0;">
            <div>${escapeHtml(cat.name)}</div>
            <div class="cell-muted">
              <span class="small-pill">${fmtMoney(fromCents(remainingOfTargetC))} of target remaining</span>
            </div>
          </div>
        </div>
        <div class="money">${fmtMoney(fromCents(targetC))}</div>
        <div class="money ${remClass}">${fmtMoney(fromCents(spentYtdC))}</div>
        <div class="money">${fmtMoney(fromCents(balanceC))}</div>
        <div class="row" style="justify-content:flex-end;">
          <button class="icon-btn" data-contrib="${cat.id}" title="Contribute">+ Add</button>
          <button class="icon-btn" data-edit-annual="${cat.id}" title="Edit">Edit</button>
          <button class="icon-btn" data-del-annual="${cat.id}" title="Delete">Del</button>
        </div>
      </div>
    `;

    const exList = monthAnnualEx
      .filter(e => (e.categoryId || null) === cat.id)
      .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""));

    const contribList = monthContrib
      .filter(c => (c.categoryId || null) === cat.id)
      .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""));

    const hasAny = contribList.length || exList.length;

    html += `
      <div class="detail-row">
        <div class="detail-anim ${isOpen ? "open" : ""}">
          <div class="detail-inner">
            <div class="detail-muted">${monthKeyToLabel(currentMonthKey)} • Annual (this month)</div>

            ${contribList.length ? `
              <div class="detail-muted">Contributions</div>
              <div class="detail-list">
                ${contribList.map(c => inlineContributionCardHtml(c)).join("")}
              </div>
            ` : ``}

            ${exList.length ? `
              <div class="detail-muted">Expenses</div>
              <div class="detail-list">
                ${exList.map(ex => inlineExpenseCardHtml(ex)).join("")}
              </div>
            ` : (hasAny ? `` : `<div class="detail-muted">No annual activity for this category in this month.</div>`)}
          </div>
        </div>
      </div>
    `;
  });

  annualTable.innerHTML = html;

  annualTable.querySelectorAll("[data-toggle-category]").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const [type, id] = row.dataset.toggleCategory.split(":");
      expanded = (expanded.type === type && expanded.id === id)
        ? { type:null, id:null }
        : { type, id };
      render();
    });
  });

  annualTable.querySelectorAll("[data-contrib]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const b = getBudget(currentMonthKey);
      if (!b) return;

      const catId = btn.dataset.contrib;
      const cat = b.annualCategories.find(c => c.id === catId);
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

      cat.balance = fromCents(toCents(cat.balance) + toCents(amt));

      b.contributions.push({
        id: uid(),
        categoryId: catId,
        amount: amt,
        dateISO: res.dateISO || todayISO(),
        note: (res.note || "").trim()
      });

      saveState();
      render();
    });
  });

  annualTable.querySelectorAll("[data-edit-annual]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const b = getBudget(currentMonthKey);
      if (!b) return;

      const id = btn.dataset.editAnnual;
      const cat = b.annualCategories.find(c => c.id === id);
      if (!cat) return;

      const res = await promptForm("Edit Annual Category", [
        { key:"name", label:"Name", type:"text", value: cat.name },
        { key:"target", label:"Annual Target", type:"money", value: moneyToInput(cat.target) },
        { key:"balance", label:"Balance", type:"money", value: moneyToInput(cat.balance) }
      ]);
      if (!res) return;

      cat.name = res.name.trim() || cat.name;
      cat.target = parseMoney(res.target);
      cat.balance = parseMoney(res.balance);

      saveState();
      render();
    });
  });

  annualTable.querySelectorAll("[data-del-annual]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = getBudget(currentMonthKey);
      if (!b) return;

      const id = btn.dataset.delAnnual;

      if (!confirm("Delete this annual category? Expenses remain but become uncategorized.")) return;

      b.annualCategories = b.annualCategories.filter(c => c.id !== id);
      b.expenses.forEach(ex => {
        if (ex.type === "annual" && ex.categoryId === id) ex.categoryId = null;
      });
      b.contributions = b.contributions.filter(c => c.categoryId !== id);

      if (expanded.type === "annual" && expanded.id === id) expanded = { type:null, id:null };

      saveState();
      render();
    });
  });

  annualTable.querySelectorAll("[data-del-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteExpense(btn.dataset.delExp); });
  });
  annualTable.querySelectorAll("[data-edit-exp]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); editExpense(btn.dataset.editExp); });
  });

  annualTable.querySelectorAll("[data-del-contrib]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteContribution(btn.dataset.delContrib); });
  });
}

// -------------------- Inline cards --------------------
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

function inlineContributionCardHtml(c){
  const note = c.note ? escapeHtml(c.note) : "";
  return `
    <div class="detail-card">
      <div class="detail-card-top">
        <div>
          <div class="exp-main">Contribute</div>
          ${note ? `<div class="exp-sub">${note}</div>` : ``}
          <div class="exp-sub">${escapeHtml(c.dateISO || "")}</div>
        </div>
        <div class="money positive">${fmtMoney(c.amount)}</div>
      </div>
      <div class="detail-actions">
        <button class="icon-btn" data-del-contrib="${c.id}">Delete</button>
      </div>
    </div>
  `;
}

// -------------------- Expense Modal --------------------
function openExpenseModal(prefill = {}){
  const b = getBudget(currentMonthKey);
  if (!b){
    alert("Create this month budget first.");
    return;
  }

  refreshExpenseCategoryDropdown();

  expVendor.value = prefill.vendor ?? "";
  expItem.value = prefill.item ?? "";
  expAmount.value = prefill.amount != null ? moneyToInput(prefill.amount) : "";
  expDate.value = prefill.dateISO ?? todayISO();
  expCategory.value = prefill.categoryKey ?? (expCategory.options[0]?.value || "");
  expNote.value = prefill.note ?? "";

  expenseModal.dataset.editingId = prefill.id || "";
  openModal(expenseModal);
  expVendor.focus();
}

function refreshExpenseCategoryDropdown(){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const opts = [];

  opts.push({ value:"monthly:null", label:"(Monthly) Uncategorized" });
  b.monthlyCategories.forEach(c => opts.push({ value:`monthly:${c.id}`, label:`(Monthly) ${c.name}` }));

  opts.push({ value:"annual:null", label:"(Annual) Uncategorized" });
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

  const [type, categoryIdRaw] = (expCategory.value || "monthly:null").split(":");
  const categoryId = categoryIdRaw === "null" ? null : categoryIdRaw;

  const editingId = expenseModal.dataset.editingId || "";
  const existing = editingId ? b.expenses.find(e => e.id === editingId) : null;

  if (existing && existing.type === "annual"){
    adjustAnnualBalance(b, existing.categoryId, +existing.amount); // undo previous
  }

  const record = { id: existing ? existing.id : uid(), type, categoryId, vendor, item, amount, dateISO, note };

  if (existing) Object.assign(existing, record);
  else b.expenses.push(record);

  if (type === "annual"){
    adjustAnnualBalance(b, categoryId, -amount);
  }

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

function deleteExpense(expId){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const idx = b.expenses.findIndex(e => e.id === expId);
  if (idx === -1) return;

  if (!confirm("Delete this expense?")) return;

  const ex = b.expenses[idx];
  if (ex.type === "annual"){
    adjustAnnualBalance(b, ex.categoryId, +ex.amount); // undo
  }

  b.expenses.splice(idx, 1);
  saveState();
  render();
}

function editExpense(expId){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const ex = b.expenses.find(e => e.id === expId);
  if (!ex) return;

  openExpenseModal({
    id: ex.id,
    vendor: ex.vendor,
    item: ex.item,
    amount: ex.amount,
    dateISO: ex.dateISO,
    categoryKey: `${ex.type}:${ex.categoryId ?? "null"}`,
    note: ex.note
  });
}

// -------------------- Contributions --------------------
function deleteContribution(contribId){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const idx = (b.contributions || []).findIndex(c => c.id === contribId);
  if (idx === -1) return;

  if (!confirm("Delete this contribution?")) return;

  const c = b.contributions[idx];

  const cat = b.annualCategories.find(a => a.id === c.categoryId);
  if (cat){
    cat.balance = fromCents(toCents(cat.balance) - toCents(c.amount));
  }

  b.contributions.splice(idx, 1);
  saveState();
  render();
}

// -------------------- Annual Balance Helpers --------------------
function adjustAnnualBalance(budget, categoryId, delta){
  if (!categoryId) return;
  const cat = budget.annualCategories.find(c => c.id === categoryId);
  if (!cat) return;
  cat.balance = fromCents(toCents(cat.balance) + toCents(delta));
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

    base.annualCategories = prev.annualCategories.map(c => ({
      id: uid(),
      name: c.name,
      target: c.target || 0,
      balance: c.balance || 0
    }));
  }

  state.budgets[monthKey] = base;
  saveState();
}

// -------------------- Year-to-date stats --------------------
function getYearToDateAnnualStats(yearStr){
  const stats = {};
  Object.entries(state.budgets).forEach(([mk, b]) => {
    if (!mk.startsWith(yearStr + "-")) return;
    (b.expenses || []).forEach(ex => {
      if (ex.type !== "annual") return;
      const cid = ex.categoryId || "null";
      if (!stats[cid]) stats[cid] = { spent: 0 };
      stats[cid].spent += (ex.amount || 0);
    });
  });
  return stats;
}

// -------------------- Prompt Modal --------------------
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

    const cleanup = () => {
      closeModal(promptModal);
      promptOkBtn.removeEventListener("click", ok);
      promptCancelBtn.removeEventListener("click", cancel);
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    promptOkBtn.addEventListener("click", ok);
    promptCancelBtn.addEventListener("click", cancel);

    openModal(promptModal);

    const first = promptFields.querySelector("input");
    if (first) first.focus();
  });
}

// -------------------- Utilities --------------------
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
  // Keep negatives as negatives (no clamping). Also avoids "-0.00" by cents math upstream.
  const val = Number(n);
  const safe = Number.isFinite(val) ? val : 0;
  return safe.toLocaleString(undefined, { style:"currency", currency:"USD" });
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
    <div class="trow" style="cursor:default;">
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
