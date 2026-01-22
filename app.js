const storeKey = "glassbudget-data";
const defaultData = {
  weeklyBudget: 50,
  weekStart: 1,
  goalAmount: 100,
  goalSaved: 20,
  transactions: [],
  theme: "auto",
};

const state = loadState();

const weekTitle = document.getElementById("weekTitle");
const moneyLeft = document.getElementById("moneyLeft");
const budgetSummary = document.getElementById("budgetSummary");
const budgetProgress = document.getElementById("budgetProgress");
const budgetStatus = document.getElementById("budgetStatus");
const weeklyBudgetDisplay = document.getElementById("weeklyBudgetDisplay");
const weekStartDisplay = document.getElementById("weekStartDisplay");
const goalSummary = document.getElementById("goalSummary");
const goalProgress = document.getElementById("goalProgress");
const goalStatus = document.getElementById("goalStatus");
const recentList = document.getElementById("recentList");
const historyList = document.getElementById("historyList");
const categoryTotals = document.getElementById("categoryTotals");
const topCategory = document.getElementById("topCategory");
const avgDaily = document.getElementById("avgDaily");

const expenseForm = document.getElementById("expenseForm");
const expenseAmount = document.getElementById("expenseAmount");
const expenseCategory = document.getElementById("expenseCategory");
const expenseNote = document.getElementById("expenseNote");
const expenseDate = document.getElementById("expenseDate");

const budgetModal = document.getElementById("budgetModal");
const weeklyBudgetInput = document.getElementById("weeklyBudgetInput");
const weekStartInput = document.getElementById("weekStartInput");
const goalModal = document.getElementById("goalModal");
const goalAmountInput = document.getElementById("goalAmountInput");
const goalSavedInput = document.getElementById("goalSavedInput");

const transactionTemplate = document.getElementById("transactionTemplate");

const weekDays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function loadState() {
  const stored = localStorage.getItem(storeKey);
  if (!stored) return { ...defaultData };
  try {
    return { ...defaultData, ...JSON.parse(stored) };
  } catch (error) {
    return { ...defaultData };
  }
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function formatCurrency(value) {
  return `$${Number(value).toFixed(2)}`;
}

function currentWeekRange(date = new Date()) {
  const start = new Date(date);
  const diff = (start.getDay() - state.weekStart + 7) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function setDefaultDate() {
  const today = new Date();
  expenseDate.valueAsDate = today;
}

function addTransaction(transaction) {
  state.transactions.unshift(transaction);
  saveState();
  render();
}

function updateTransaction(id, updates) {
  const item = state.transactions.find((tx) => tx.id === id);
  if (!item) return;
  Object.assign(item, updates);
  saveState();
  render();
}

function deleteTransaction(id) {
  state.transactions = state.transactions.filter((tx) => tx.id !== id);
  saveState();
  render();
}

function render() {
  const { start, end } = currentWeekRange();
  const weekTransactions = state.transactions.filter((tx) => {
    const date = new Date(tx.date);
    return date >= start && date <= end;
  });

  const spent = weekTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const moneyRemaining = Math.max(state.weeklyBudget - spent, 0);
  const progress = state.weeklyBudget ? Math.min((spent / state.weeklyBudget) * 100, 100) : 0;

  weekTitle.textContent = `Week of ${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
  moneyLeft.textContent = formatCurrency(moneyRemaining);
  budgetSummary.textContent = `Budget ${formatCurrency(state.weeklyBudget)} • Spent ${formatCurrency(spent)}`;
  budgetProgress.style.width = `${progress}%`;
  budgetStatus.textContent = moneyRemaining > 0 ? "On track for the week." : "Budget maxed. Go slow.";

  weeklyBudgetDisplay.textContent = formatCurrency(state.weeklyBudget);
  weekStartDisplay.textContent = weekDays[state.weekStart];

  goalSummary.textContent = `${formatCurrency(state.goalSaved)} / ${formatCurrency(state.goalAmount)}`;
  const goalProgressValue = state.goalAmount ? Math.min((state.goalSaved / state.goalAmount) * 100, 100) : 0;
  goalProgress.style.width = `${goalProgressValue}%`;
  goalStatus.textContent = goalProgressValue >= 100 ? "Goal reached!" : "Every dollar counts ✨";

  renderTransactions(recentList, state.transactions.slice(0, 4));
  renderTransactions(historyList, state.transactions);
  renderInsights();
}

function renderTransactions(list, transactions) {
  list.innerHTML = "";
  if (!transactions.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No transactions yet.";
    list.appendChild(empty);
    return;
  }

  transactions.forEach((tx) => {
    const node = transactionTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".list-title").textContent = tx.note || tx.category;
    node.querySelector(".list-sub").textContent = `${tx.category} • ${new Date(tx.date).toLocaleDateString()}`;
    node.querySelector(".list-amount").textContent = `-${formatCurrency(tx.amount)}`;

    node.querySelector(".edit").addEventListener("click", () => openEdit(tx));
    node.querySelector(".delete").addEventListener("click", () => deleteTransaction(tx.id));

    list.appendChild(node);
  });
}

function renderInsights() {
  const totals = {};
  state.transactions.forEach((tx) => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  topCategory.textContent = top ? `${top[0]} ${formatCurrency(top[1])}` : "--";

  const { start } = currentWeekRange();
  const today = new Date();
  const days = Math.max(1, Math.ceil((today - start) / (1000 * 60 * 60 * 24)) + 1);
  const spentThisWeek = state.transactions
    .filter((tx) => new Date(tx.date) >= start)
    .reduce((sum, tx) => sum + tx.amount, 0);
  avgDaily.textContent = formatCurrency(spentThisWeek / days);

  categoryTotals.innerHTML = "";
  Object.entries(totals).forEach(([category, amount]) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `<p class="list-title">${category}</p><p class="list-amount">${formatCurrency(amount)}</p>`;
    categoryTotals.appendChild(item);
  });
  if (!Object.keys(totals).length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Add transactions to see insights.";
    categoryTotals.appendChild(empty);
  }
}

function openEdit(transaction) {
  expenseAmount.value = transaction.amount;
  expenseCategory.value = transaction.category;
  expenseNote.value = transaction.note;
  expenseDate.value = transaction.date;
  expenseForm.dataset.editing = transaction.id;
  showView("add");
}

function showView(id) {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === id);
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === id);
  });
}

function openModal(modal) {
  modal.classList.add("open");
}

function closeModal(modal) {
  modal.classList.remove("open");
}

function initNavigation() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.target));
  });

  document.getElementById("jumpHistory").addEventListener("click", () => showView("history"));
}

function initModals() {
  document.getElementById("openBudget").addEventListener("click", () => {
    weeklyBudgetInput.value = state.weeklyBudget;
    weekStartInput.value = state.weekStart;
    openModal(budgetModal);
  });
  document.getElementById("openGoal").addEventListener("click", () => {
    goalAmountInput.value = state.goalAmount;
    goalSavedInput.value = state.goalSaved;
    openModal(goalModal);
  });

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(document.getElementById(btn.dataset.close)));
  });

  document.getElementById("saveBudget").addEventListener("click", () => {
    state.weeklyBudget = Number(weeklyBudgetInput.value) || 0;
    state.weekStart = Number(weekStartInput.value);
    saveState();
    closeModal(budgetModal);
    render();
  });

  document.getElementById("saveGoal").addEventListener("click", () => {
    state.goalAmount = Number(goalAmountInput.value) || 0;
    state.goalSaved = Number(goalSavedInput.value) || 0;
    saveState();
    closeModal(goalModal);
    render();
  });
}

function initForm() {
  expenseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = {
      id: expenseForm.dataset.editing || crypto.randomUUID(),
      amount: Number(expenseAmount.value),
      category: expenseCategory.value,
      note: expenseNote.value.trim(),
      date: expenseDate.value,
    };

    if (expenseForm.dataset.editing) {
      updateTransaction(expenseForm.dataset.editing, data);
      delete expenseForm.dataset.editing;
    } else {
      addTransaction(data);
    }

    expenseForm.reset();
    setDefaultDate();
    showView("home");
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      expenseAmount.value = chip.dataset.amount;
      expenseCategory.value = chip.dataset.category;
      expenseNote.value = "";
      setDefaultDate();
      showView("add");
    });
  });

  document.getElementById("clearHistory").addEventListener("click", () => {
    if (!state.transactions.length) return;
    state.transactions = [];
    saveState();
    render();
  });
}

function initTheme() {
  const toggleTheme = document.getElementById("toggleTheme");
  const icon = toggleTheme.querySelector(".icon");

  const applyTheme = (theme) => {
    if (theme === "light") {
      document.documentElement.style.colorScheme = "light";
      document.body.dataset.theme = "light";
      icon.textContent = "☾";
    } else if (theme === "dark") {
      document.documentElement.style.colorScheme = "dark";
      document.body.dataset.theme = "dark";
      icon.textContent = "☀";
    } else {
      document.body.dataset.theme = "auto";
      document.documentElement.style.colorScheme = "light dark";
      icon.textContent = "◎";
    }
  };

  toggleTheme.addEventListener("click", () => {
    const order = ["auto", "light", "dark"];
    const next = order[(order.indexOf(state.theme) + 1) % order.length];
    state.theme = next;
    saveState();
    applyTheme(next);
  });

  applyTheme(state.theme);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
}

setDefaultDate();
initNavigation();
initModals();
initForm();
initTheme();
render();
registerServiceWorker();
