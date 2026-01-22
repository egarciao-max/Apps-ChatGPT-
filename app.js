const state = {
  settings: {
    weeklyBudget: 50,
    weekStart: 0,
    savingsGoal: 150,
    savingsSaved: 20,
  },
  expenses: [],
  editingId: null,
};

const elements = {
  moneyLeft: document.getElementById("moneyLeft"),
  weekRange: document.getElementById("weekRange"),
  weeklyBudget: document.getElementById("weeklyBudget"),
  weekStartLabel: document.getElementById("weekStartLabel"),
  budgetValue: document.getElementById("budgetValue"),
  savingsGoal: document.getElementById("savingsGoal"),
  goalProgress: document.getElementById("goalProgress"),
  goalProgressLabel: document.getElementById("goalProgressLabel"),
  goalSavedLabel: document.getElementById("goalSavedLabel"),
  historyList: document.getElementById("historyList"),
  historyCount: document.getElementById("historyCount"),
  topCategory: document.getElementById("topCategory"),
  avgDaily: document.getElementById("avgDaily"),
  weekTotal: document.getElementById("weekTotal"),
  installBtn: document.getElementById("installBtn"),
};

const expenseForm = document.getElementById("expenseForm");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const noteInput = document.getElementById("note");
const dateInput = document.getElementById("date");

const budgetInput = document.getElementById("budgetInput");
const goalInput = document.getElementById("goalInput");
const goalSavedInput = document.getElementById("goalSavedInput");
const weekStartSelect = document.getElementById("weekStartSelect");

const editAmount = document.getElementById("editAmount");
const editCategory = document.getElementById("editCategory");
const editNote = document.getElementById("editNote");
const editDate = document.getElementById("editDate");

const saveBudget = document.getElementById("saveBudget");
const saveGoal = document.getElementById("saveGoal");
const saveSettings = document.getElementById("saveSettings");
const saveEdit = document.getElementById("saveEdit");

const sheets = document.querySelectorAll(".sheet");
const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");

let installPrompt = null;

const storageKeys = {
  settings: "glassbudget_settings",
  expenses: "glassbudget_expenses",
};

const currency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);

const formatDate = (date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const formatDateInput = (date) => date.toISOString().split("T")[0];

const getStartOfWeek = (date, startDay) => {
  const start = new Date(date);
  const currentDay = start.getDay();
  const diff = (currentDay - startDay + 7) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const getEndOfWeek = (start) => {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const withinWeek = (date, startDay) => {
  const start = getStartOfWeek(new Date(), startDay);
  const end = getEndOfWeek(start);
  return date >= start && date <= end;
};

const getWeekLabel = () => {
  const start = getStartOfWeek(new Date(), state.settings.weekStart);
  const end = getEndOfWeek(start);
  return `${formatDate(start)} - ${formatDate(end)}`;
};

const saveState = () => {
  localStorage.setItem(storageKeys.settings, JSON.stringify(state.settings));
  localStorage.setItem(storageKeys.expenses, JSON.stringify(state.expenses));
};

const loadState = () => {
  const settingsRaw = localStorage.getItem(storageKeys.settings);
  const expensesRaw = localStorage.getItem(storageKeys.expenses);
  if (settingsRaw) {
    state.settings = { ...state.settings, ...JSON.parse(settingsRaw) };
  }
  if (expensesRaw) {
    state.expenses = JSON.parse(expensesRaw);
  }
};

const updateTheme = () => {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.body.classList.toggle("dark", isDark);
};

const openSheet = (id) => {
  const sheet = document.getElementById(id);
  if (sheet) {
    sheet.classList.add("show");
    sheet.setAttribute("aria-hidden", "false");
  }
};

const closeSheets = () => {
  sheets.forEach((sheet) => {
    sheet.classList.remove("show");
    sheet.setAttribute("aria-hidden", "true");
  });
};

const renderSummary = () => {
  const weekTotal = state.expenses
    .filter((item) => withinWeek(new Date(item.date), state.settings.weekStart))
    .reduce((sum, item) => sum + item.amount, 0);
  const remaining = Math.max(state.settings.weeklyBudget - weekTotal, 0);

  elements.moneyLeft.textContent = currency(remaining);
  elements.weeklyBudget.textContent = currency(state.settings.weeklyBudget);
  elements.budgetValue.textContent = currency(state.settings.weeklyBudget);
  elements.weekRange.textContent = `Week of ${getWeekLabel()}`;

  elements.savingsGoal.textContent = currency(state.settings.savingsGoal);
  elements.goalSavedLabel.textContent = `${currency(state.settings.savingsSaved)} saved`;

  const percent = state.settings.savingsGoal
    ? Math.min((state.settings.savingsSaved / state.settings.savingsGoal) * 100, 100)
    : 0;
  elements.goalProgress.style.width = `${percent}%`;
  elements.goalProgressLabel.textContent = `${Math.round(percent)}% saved`;

  const weekStartDayName = new Date(2023, 0, 1 + state.settings.weekStart).toLocaleDateString(
    "en-US",
    { weekday: "long" }
  );
  elements.weekStartLabel.textContent = weekStartDayName;
};

const renderHistory = () => {
  elements.historyList.innerHTML = "";
  if (!state.expenses.length) {
    elements.historyList.innerHTML = `<p class="muted">No expenses yet. Add your first purchase.</p>`;
    elements.historyCount.textContent = "0 items";
    return;
  }

  state.expenses
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((item) => {
      const container = document.createElement("div");
      container.className = "list-item";
      container.innerHTML = `
        <div class="row between">
          <strong>${item.category}</strong>
          <strong>${currency(item.amount)}</strong>
        </div>
        <div class="item-meta">
          <span>${formatDate(new Date(item.date))}</span>
          <span>${item.note || "—"}</span>
        </div>
        <div class="item-actions">
          <button class="action-btn" data-edit="${item.id}">Edit</button>
          <button class="action-btn" data-delete="${item.id}">Delete</button>
        </div>
      `;
      elements.historyList.appendChild(container);
    });

  elements.historyCount.textContent = `${state.expenses.length} items`;
};

const renderInsights = () => {
  const categories = {};
  const weekExpenses = state.expenses.filter((item) =>
    withinWeek(new Date(item.date), state.settings.weekStart)
  );
  const weekTotal = weekExpenses.reduce((sum, item) => sum + item.amount, 0);

  weekExpenses.forEach((item) => {
    categories[item.category] = (categories[item.category] || 0) + item.amount;
  });

  const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  elements.topCategory.textContent = topCategory ? `${topCategory[0]} (${currency(topCategory[1])})` : "—";

  const daysTracked = weekExpenses.length
    ? new Set(weekExpenses.map((item) => item.date)).size
    : 0;
  const avgDaily = daysTracked ? weekTotal / daysTracked : 0;

  elements.avgDaily.textContent = currency(avgDaily);
  elements.weekTotal.textContent = currency(weekTotal);
};

const renderAll = () => {
  renderSummary();
  renderHistory();
  renderInsights();
  saveState();
};

const setDefaultDate = () => {
  dateInput.value = formatDateInput(new Date());
};

const addExpense = (expense) => {
  state.expenses.push(expense);
  renderAll();
};

const updateExpense = (id, updates) => {
  const index = state.expenses.findIndex((item) => item.id === id);
  if (index >= 0) {
    state.expenses[index] = { ...state.expenses[index], ...updates };
  }
  renderAll();
};

const deleteExpense = (id) => {
  state.expenses = state.expenses.filter((item) => item.id !== id);
  renderAll();
};

const switchView = (target) => {
  views.forEach((view) => view.classList.toggle("active", view.id === target));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.target === target));
};

navItems.forEach((item) => {
  item.addEventListener("click", () => switchView(item.dataset.target));
});

sheets.forEach((sheet) => {
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet || event.target.hasAttribute("data-close")) {
      closeSheets();
    }
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSheets();
  }
});

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number.parseFloat(amountInput.value);
  if (!amount) {
    return;
  }
  addExpense({
    id: crypto.randomUUID(),
    amount,
    category: categoryInput.value,
    note: noteInput.value.trim(),
    date: dateInput.value,
  });
  expenseForm.reset();
  setDefaultDate();
  switchView("history");
});

document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => openSheet(button.dataset.open));
});

saveBudget.addEventListener("click", () => {
  const value = Number.parseFloat(budgetInput.value) || 0;
  state.settings.weeklyBudget = value;
  closeSheets();
  renderAll();
});

saveGoal.addEventListener("click", () => {
  const goal = Number.parseFloat(goalInput.value) || 0;
  const saved = Number.parseFloat(goalSavedInput.value) || 0;
  state.settings.savingsGoal = goal;
  state.settings.savingsSaved = saved;
  closeSheets();
  renderAll();
});

saveSettings.addEventListener("click", () => {
  state.settings.weekStart = Number.parseInt(weekStartSelect.value, 10);
  closeSheets();
  renderAll();
});

saveEdit.addEventListener("click", () => {
  if (!state.editingId) {
    return;
  }
  updateExpense(state.editingId, {
    amount: Number.parseFloat(editAmount.value) || 0,
    category: editCategory.value,
    note: editNote.value.trim(),
    date: editDate.value,
  });
  state.editingId = null;
  closeSheets();
});

historyList.addEventListener("click", (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) {
    const expense = state.expenses.find((item) => item.id === editId);
    if (expense) {
      state.editingId = expense.id;
      editAmount.value = expense.amount;
      editCategory.value = expense.category;
      editNote.value = expense.note;
      editDate.value = expense.date;
      openSheet("editSheet");
    }
  }
  if (deleteId) {
    deleteExpense(deleteId);
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  elements.installBtn.hidden = false;
});

elements.installBtn.addEventListener("click", async () => {
  if (!installPrompt) {
    return;
  }
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  elements.installBtn.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateTheme);

loadState();
updateTheme();
setDefaultDate();
weekStartSelect.value = state.settings.weekStart;
budgetInput.value = state.settings.weeklyBudget;
goalInput.value = state.settings.savingsGoal;
goalSavedInput.value = state.settings.savingsSaved;
renderAll();
