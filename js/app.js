/* SimpleSpend v0.6
   - Medium theme in CSS
   - 3-column category list: Category | Left/Total (toggle to Spent/Total) | progress ring
   - Actions removed from main rows; actions live inside expanded category
   - Extra (hidden uncategorized):
       * NEVER selectable in Add Expense
       * ONLY appears when a category is deleted and expenses become orphaned
       * Auto-hides when empty
*/

const APP_FALLBACK_VERSION = "v0.6";
const STORAGE_KEY = "simplespend_v06";

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

let expanded = { type: null, id: null }; // type: "monthly"|"annual"
let amountMode = "left"; // "left" or "spent" (global toggle)

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

  // Income typing: select all (prevents 0.005000 nonsense)
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

  const plannedC = incomeC - monthlyBudgetedC; // can go negative
  const leftC = incomeC - monthlySpentC;       // can go negative

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

  // Build category list (+ Extra only if needed)
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
      ? `${fmtMoney(fromCents(leftC))} / ${fmtMoney(fromCents(totalC))}`
      : `${fmtMoney(fromCents(spentC))} / ${fmtMoney(fromCents(totalC))}`;

    const lineClass = (amountMode === "left" ? (leftC < 0) : false) ? "negative" : "";

    const pct = progressPct(spentC, totalC);
    const ringColor = ringTone(spentC, totalC);
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
          <div class="amountmode">${amountMode === "left" ? "tap to show spent" : "tap to show left"}</div>
        </button>

        <div class="ring" style="${ringStyle(pct, ringColor)}"></div>
      </div>
    `;

    // Detail block
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

// -------------------- Annual Table --------------------
function renderAnnualTable(){
  const b = getBudget(currentMonthKey);
  const year = currentMonthKey.slice(0,4);
  const ytd = getYearToDateAnnualStats(year);

  const header = `
    <div class="thead listgrid">
      <div>Category</div>
      <div style="text-align:right;">${amountMode === "left" ? "Left / Total" : "Spent / Total"}</div>
      <div style="text-align:right;">&nbsp;</div>
    </div>
  `;

  const monthAnnualEx = getMonthExpenses(b, "annual");

  const rows = [];
  b.annualCategories.forEach(c => rows.push({ id:c.id, name:c.name, total:c.target, kind:"normal" }));

  const extraSpentC = sumCents(monthAnnualEx.filter(e => e.categoryId === EXTRA_ID).map(e => toCents(e.amount)));
  if (extraSpentC !== 0){
    rows.push({ id:EXTRA_ID, name:EXTRA_NAME, total:0, kind:"extra" });
  }

  if (!rows.length){
    annualTable.innerHTML = header + emptyRow("No annual categories yet. Add one.");
    return;
  }

  let html = header;

  rows.forEach(cat => {
    const monthCatEx = monthAnnualEx.filter(e => e.categoryId === cat.id);

    // annual spent/left use YTD
    const ytdSpent = (ytd[cat.id]?.spent ?? 0);
    const spentC = toCents(ytdSpent);
    const totalC = toCents(cat.total || 0);
    const leftC = totalC - spentC;

    const line = amountMode === "left"
      ? `${fmtMoney(fromCents(leftC))} / ${fmtMoney(fromCents(totalC))}`
      : `${fmtMoney(fromCents(spentC))} / ${fmtMoney(fromCents(totalC))}`;

    const lineClass = (amountMode === "left" ? (leftC < 0) : false) ? "negative" : "";

    const pct = progressPct(spentC, totalC);
    const ringColor = ringTone(spentC, totalC);
    const isOpen = expanded.type === "annual" && expanded.id === cat.id;

    html += `
      <div class="trow listgrid" data-toggle="annual:${cat.id}">
        <div class="catcell">
          <span class="chev ${isOpen ? "open" : ""}">›</span>
          <div style="min-width:0;">
            <div class="catname">${escapeHtml(cat.name)}</div>
            ${cat.kind === "extra" ? `<div class="catsub">Hidden uncategorized. Reassign these.</div>` : ``}
          </div>
        </div>

        <button class="amountbtn" data-toggle-amount="1" type="button" aria-label="Toggle amount mode">
          <div class="amountline money ${lineClass}">${escapeHtml(line)}</div>
          <div class="amountmode">${amountMode === "left" ? "tap to show spent" : "tap to show left"}</div>
        </button>

        <div class="ring" style="${ringStyle(pct, ringColor)}"></div>
      </div>
    `;

    const contribs = (b.contributions || []).filter(c => c.categoryId === cat.id);

    html += `
      <div class="detail-row">
        <div class="detail-anim ${isOpen ? "open" : ""}">
          <div class="detail-inner">
            <div class="detail-muted">${year} • Annual (YTD) • this month shown below</div>

            <div class="row row-wrap row-gap">
              ${cat.kind !== "extra"
                ? `<button class="btn btn-primary" data-add-exp="annual:${cat.id}">+ Add Expense</button>`
                : ``}
              ${cat.kind !== "extra"
                ? `<button class="btn btn-secondary" data-contrib="annual:${cat.id}">+ Contribution</button>`
                : ``}
              ${cat.kind !== "extra"
                ? `<button class="btn btn-secondary" data-edit-cat="annual:${cat.id}">Edit Category</button>`
                : ``}
              ${cat.kind !== "extra"
                ? `<button class="btn btn-ghost" data-del-cat="annual:${cat.id}">Delete Category</button>`
                : ``}
            </div>

            ${contribs.length ? `
              <div class="detail-muted">Contributions (this month)</div>
              <div class="detail-list">
                ${contribs
                  .slice()
                  .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""))
                  .map(c => inlineContributionCardHtml(c))
                  .join("")}
              </div>
            ` : ``}

            <div class="detail-muted">Expenses (this month)</div>
            ${monthCatEx.length ? `
              <div class="detail-list">
                ${monthCatEx
                  .slice()
                  .sort((a,b)=> (a.dateISO||"").localeCompare(b.dateISO||""))
                  .map(ex => inlineExpenseCardHtml(ex))
                  .join("")}
              </div>
            ` : `<div class="cell-muted">No annual expenses in this category this month.</div>`}
          </div>
        </div>
      </div>
    `;
  });

  annualTable.innerHTML = html;

  bindListInteractions(annualTable);
  bindExpenseCardActions(annualTable);
  bindContributionActions(annualTable);
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

  // Amount toggle (global)
  container.querySelectorAll("[data-toggle-amount]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
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
  }

  saveState();
  render();
}

function deleteCategory(type, id){
  const b = getBudget(currentMonthKey);
  if (!b) return;

  const label = (type === "monthly") ? "monthly" : "annual";
  if (!confirm(`Delete this ${label} category? Existing expenses will move to "${EXTRA_NAME}".`)) return;

  // Move expenses to Extra (do not delete; do not hide)
  b.expenses.forEach(ex => {
    if (ex.type === type && ex.categoryId === id){
      ex.categoryId = EXTRA_ID;
    }
  });

  if (type === "monthly"){
    b.monthlyCategories = b.monthlyCategories.filter(c => c.id !== id);
  } else {
    // If annual, also leave contributions alone (they still belong to that category id).
    // But once the category is deleted, contributions become meaningless; simplest is to move/delete them.
    // We’ll move contributions to nowhere by deleting them (since Extra isn't a fund).
    b.contributions = (b.contributions || []).filter(c => c.categoryId !== id);
    b.annualCategories = b.annualCategories.filter(c => c.id !== id);
  }

  if (expanded.type === type && expanded.id === id) expanded = {type:null, id:null};

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

  // preselect category if provided (must not be Extra)
  if (prefill?.type && prefill?.categoryId && prefill.categoryId !== EXTRA_ID){
    const key = `${prefill.type}:${prefill.categoryId}`;
    const exists = Array.from(expCategory.options).some(o => o.value === key);
    if (exists) expCategory.value = key;
  } else if (prefill?.type && prefill?.categoryId === EXTRA_ID){
    // editing an Extra expense => force user to choose a real category
    expCategory.selectedIndex = 0;
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

  const editingId = expenseModal.dataset.editingId || "";
  const existing = editingId ? b.expenses.find(e => e.id === editingId) : null;

  // Undo annual balance if existing annual
  if (existing && existing.type === "annual"){
    adjustAnnualBalance(b, existing.categoryId, +existing.amount);
  }

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

  // Apply annual balance if annual
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

  const ex = b.expenses[idx];

  // Undo annual balance effect
  if (ex.type === "annual"){
    adjustAnnualBalance(b, ex.categoryId, +ex.amount);
  }

  b.expenses.splice(idx, 1);

  // If Extra empties out, it auto-hides via render logic
  saveState();
  render();
}

// -------------------- Contributions --------------------
async function addContribution(catId){
  const b = getBudget(currentMonthKey);
  if (!b) return;

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
}

function bindContributionActions(container){
  container.querySelectorAll("[data-del-contrib]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); deleteContribution(btn.dataset.delContrib); });
  });
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

// -------------------- Annual balance helpers --------------------
function adjustAnnualBalance(budget, categoryId, delta){
  if (!categoryId || categoryId === EXTRA_ID) return;
  const cat = budget.annualCategories.find(c => c.id === categoryId);
  if (!cat) return;
  cat.balance = fromCents(toCents(cat.balance) + toCents(delta));
}

// -------------------- YTD stats --------------------
function getYearToDateAnnualStats(yearStr){
  const stats = {};
  Object.entries(state.budgets).forEach(([mk, b]) => {
    if (!mk.startsWith(yearStr + "-")) return;
    (b.expenses || []).forEach(ex => {
      if (ex.type !== "annual") return;
      const cid = ex.categoryId || null;
      if (!cid) return;
      if (!stats[cid]) stats[cid] = { spent: 0 };
      stats[cid].spent += (ex.amount || 0);
    });
  });
  return stats;
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

// -------------------- Ring helpers --------------------
function progressPct(spentC, totalC){
  if (totalC <= 0){
    return spentC > 0 ? 1 : 0;
  }
  const p = spentC / totalC;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return p;
}

function ringTone(spentC, totalC){
  // Over budget -> red. Otherwise green/yellow based on remaining.
  if (totalC > 0 && spentC > totalC) return "bad";
  const pct = progressPct(spentC, totalC);
  if (pct < 0.65) return "accent";
  if (pct < 0.90) return "warn";
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

    const first = promptFields.querySelector("input");
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
