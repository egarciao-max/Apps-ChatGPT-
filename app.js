const storeKey = "mun-debate-state";
const defaultState = {
  country: "",
  committee: "",
  focus: "",
  topic: "",
  positionPaper: "",
  debateLog: [],
  strikes: 0,
  theme: "auto",
};

const state = loadState();

const activeCountry = document.getElementById("activeCountry");
const activeCommittee = document.getElementById("activeCommittee");
const strikeCount = document.getElementById("strikeCount");

const setupForm = document.getElementById("setupForm");
const countrySelect = document.getElementById("countrySelect");
const committeeSelect = document.getElementById("committeeSelect");
const focusInput = document.getElementById("focusInput");
const saveSetup = document.getElementById("saveSetup");

const paperForm = document.getElementById("paperForm");
const topicInput = document.getElementById("topicInput");
const paperInput = document.getElementById("paperInput");
const submitPaper = document.getElementById("submitPaper");
const paperStatus = document.getElementById("paperStatus");

const debateLog = document.getElementById("debateLog");
const speechForm = document.getElementById("speechForm");
const speechInput = document.getElementById("speechInput");
const strikeWarning = document.getElementById("strikeWarning");
const clearDebate = document.getElementById("clearDebate");

const resolutionInput = document.getElementById("resolutionInput");
const feedbackPanel = document.getElementById("feedbackPanel");
const generateFeedback = document.getElementById("generateFeedback");

const pronounRegex = /\b(i|me|my|mine|myself|we|us|our|ours|ourselves|you|your|yours|yourself|yourselves|i'm|i've|i am|we're|we are|you're|you are)\b/i;

function loadState() {
  const stored = localStorage.getItem(storeKey);
  if (!stored) return { ...defaultState };
  try {
    return { ...defaultState, ...JSON.parse(stored) };
  } catch (error) {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function updateHeader() {
  activeCountry.textContent = state.country || "Not selected";
  activeCommittee.textContent = state.committee || "Not selected";
  strikeCount.textContent = `${state.strikes} / 3`;
}

function renderPaperStatus() {
  if (!state.positionPaper) {
    paperStatus.textContent = "Awaiting submission.";
    return;
  }
  paperStatus.textContent = "Position paper submitted for review.";
}

function renderDebateLog() {
  debateLog.innerHTML = "";
  if (!state.debateLog.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No speeches submitted yet. The dais awaits recognition.";
    debateLog.appendChild(empty);
    return;
  }

  state.debateLog.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "debate-entry";
    item.innerHTML = `
      <div class="meta">${entry.time} • ${entry.speaker}</div>
      <strong>${entry.title}</strong>
      <div>${entry.content}</div>
      ${entry.badge ? `<span class="badge ${entry.badgeClass}">${entry.badge}</span>` : ""}
    `;
    debateLog.appendChild(item);
  });
}

function updateFormValues() {
  countrySelect.value = state.country;
  committeeSelect.value = state.committee;
  focusInput.value = state.focus;
  topicInput.value = state.topic;
  paperInput.value = state.positionPaper;
}

function addDebateEntry({ speaker, title, content, badge, badgeClass = "" }) {
  state.debateLog.unshift({
    speaker,
    title,
    content,
    badge,
    badgeClass,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });
  saveState();
  renderDebateLog();
}

function buildAiResponse(speech) {
  const country = state.country || "the delegate";
  const committee = state.committee || "the committee";
  const focusLine = state.focus ? `The dais notes the emphasis on ${state.focus}.` : "";
  return `The representative of ${country} has been acknowledged. ${focusLine} ${committee} encourages a solution-oriented statement, concise operative language, and respect for diplomatic decorum. The chair invites elaboration on actionable mechanisms and multilateral alignment.`.trim();
}

function handleStrike(speech) {
  if (!pronounRegex.test(speech)) {
    strikeWarning.textContent = "";
    return false;
  }
  state.strikes = Math.min(state.strikes + 1, 3);
  strikeWarning.textContent = "Strike issued: avoid first- or second-person language. Maintain third-person formal speech.";
  return true;
}

function initSetup() {
  saveSetup.addEventListener("click", () => {
    if (!setupForm.reportValidity()) return;
    state.country = countrySelect.value;
    state.committee = committeeSelect.value;
    state.focus = focusInput.value.trim();
    saveState();
    updateHeader();
  });
}

function initPositionPaper() {
  submitPaper.addEventListener("click", () => {
    if (!paperForm.reportValidity()) return;
    state.topic = topicInput.value.trim();
    state.positionPaper = paperInput.value.trim();
    saveState();
    renderPaperStatus();
    addDebateEntry({
      speaker: "AI Secretariat",
      title: "Position paper received",
      content: "The dais confirms receipt and will evaluate alignment with committee mandate, evidence base, and diplomatic tone.",
      badge: "Review queued",
    });
  });
}

function initSpeechForm() {
  speechForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!speechForm.reportValidity()) return;
    if (!state.country || !state.committee) {
      strikeWarning.textContent = "Select a country and committee before speaking.";
      return;
    }

    const speech = speechInput.value.trim();
    if (!speech) return;

    const strikeIssued = handleStrike(speech);
    updateHeader();

    addDebateEntry({
      speaker: state.country,
      title: "Delegate speech",
      content: speech,
      badge: strikeIssued ? `Strike ${state.strikes}` : "Compliant",
      badgeClass: strikeIssued ? "danger" : "",
    });

    addDebateEntry({
      speaker: "AI Delegate",
      title: "Response from opposing delegation",
      content: buildAiResponse(speech),
      badge: "Formal response",
    });

    speechForm.reset();
  });

  clearDebate.addEventListener("click", () => {
    state.debateLog = [];
    state.strikes = 0;
    saveState();
    updateHeader();
    renderDebateLog();
  });
}

function initFeedback() {
  generateFeedback.addEventListener("click", () => {
    const draft = resolutionInput.value.trim();
    if (!draft) {
      feedbackPanel.innerHTML = "<p class=\"muted\">Add a draft resolution before requesting feedback.</p>";
      return;
    }

    feedbackPanel.innerHTML = `
      <p><strong>Formal review</strong></p>
      <ul>
        <li>Ensure operative clauses begin with present-tense verbs and maintain consistent numbering.</li>
        <li>Reference multilateral frameworks relevant to ${state.committee || "the committee"}.</li>
        <li>Avoid informal phrasing, subjective adjectives, or first/second-person language.</li>
        <li>Include verification mechanisms, funding sources, and timelines where appropriate.</li>
      </ul>
    `;
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

updateHeader();
updateFormValues();
renderPaperStatus();
renderDebateLog();
initSetup();
initPositionPaper();
initSpeechForm();
initFeedback();
initTheme();
