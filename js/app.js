const VERSION = "v1.0";
document.getElementById("versionBadge").textContent = VERSION;

const STORAGE = "simplespend_v1";
const EXTRA_ID = "__extra__";

let state = JSON.parse(localStorage.getItem(STORAGE) || "{}");
state.budgets ||= {};

let currentMonth = getMonthKey(new Date());

const monthSelect = document.getElementById("monthSelect");
const monthlyTable = document.getElementById("monthlyTable");
const annualTable = document.getElementById("annualTable");
const incomeInput = document.getElementById("incomeInput");
const plannedRemaining = document.getElementById("plannedRemaining");
const leftToSpend = document.getElementById("leftToSpend");

seedMonths();
render();

document.getElementById("createMonthBtn").onclick = () => {
  state.budgets[currentMonth] = {
    income:0,
    monthly:[],
    annual:[],
    expenses:[]
  };
  save();
  render();
};

document.getElementById("addMonthlyCategory").onclick = () => {
  const name = prompt("Monthly category name?");
  const amt = parseFloat(prompt("Budgeted amount?")||0);
  getBudget().monthly.push({id:uid(),name,budgeted:amt});
  save(); render();
};

document.getElementById("addAnnualCategory").onclick = () => {
  const name = prompt("Annual category name?");
  const target = parseFloat(prompt("Annual target?")||0);
  getBudget().annual.push({
    id:uid(),name,target,boost:0
  });
  // ❌ NO monthly category creation
  save(); render();
};

incomeInput.oninput = () => {
  getBudget().income = parseFloat(incomeInput.value)||0;
  save(); renderTotals();
};

function render(){
  monthSelect.value=currentMonth;
  const b=getBudget();
  document.getElementById("missingMonth").classList.toggle("hidden",!!b);
  document.getElementById("budgetView").classList.toggle("hidden",!b);
  if(!b)return;
  incomeInput.value=b.income.toFixed(2);
  renderTotals();
  renderMonthly();
  renderAnnual();
}

function renderTotals(){
  const b=getBudget();
  const spentMonth = b.expenses.filter(e=>e.type==="monthly")
    .reduce((s,e)=>s+e.amount,0);
  const budgeted = b.monthly.reduce((s,c)=>s+c.budgeted,0);
  plannedRemaining.textContent = money(b.income-budgeted);
  leftToSpend.textContent = money(b.income-spentMonth);
  leftToSpend.classList.toggle("negative",b.income-spentMonth<0);
}

function renderMonthly(){
  const b=getBudget();
  monthlyTable.innerHTML="";
  b.monthly.forEach(c=>{
    const spent=b.expenses.filter(e=>e.categoryId===c.id)
      .reduce((s,e)=>s+e.amount,0);
    monthlyTable.innerHTML+=`
      <div class="category-row">
        <div>${c.name}</div>
        <div>${money(c.budgeted-spent)} / ${money(c.budgeted)}</div>
      </div>`;
  });
}

function renderAnnual(){
  annualTable.innerHTML="";
  const year=currentMonth.slice(0,4);
  const totals = {};
  Object.entries(state.budgets).forEach(([k,b])=>{
    if(!k.startsWith(year))return;
    b.expenses.filter(e=>e.type==="annual").forEach(e=>{
      totals[e.categoryId]=(totals[e.categoryId]||0)+e.amount;
    });
  });

  getBudget().annual.forEach(c=>{
    const spent=totals[c.id]||0;
    const available=c.target+c.boost;
    annualTable.innerHTML+=`
      <div class="category-row">
        <div>${c.name}</div>
        <div>${money(available-spent)} / ${money(available)}</div>
      </div>`;
  });
}

function getBudget(){return state.budgets[currentMonth]}
function save(){localStorage.setItem(STORAGE,JSON.stringify(state))}
function uid(){return Math.random().toString(36).slice(2)}
function money(n){return "$"+(n||0).toFixed(2)}
function getMonthKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")}
function seedMonths(){
  const now=new Date();
  for(let i=-6;i<=6;i++){
    const d=new Date(now.getFullYear(),now.getMonth()+i,1);
    const k=getMonthKey(d);
    monthSelect.innerHTML+=`<option value="${k}">${d.toLocaleString("default",{month:"long",year:"numeric"})}</option>`;
  }
  monthSelect.onchange=e=>{currentMonth=e.target.value;render()}
}
