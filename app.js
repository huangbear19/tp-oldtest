const data = window.KAOGUTI_DATA;
const alphabet = ["A", "B", "C", "D"];

const state = {
  selectedChapters: new Set(data.chapters.map((chapter) => chapter.number)),
  mode: "random",
  keyword: "",
  questionCount: 20,
  quiz: [],
  answers: new Map(),
  results: [],
  submitted: false,
};

const elements = {
  totalQuestionCount: document.querySelector("#totalQuestionCount"),
  totalChapterCount: document.querySelector("#totalChapterCount"),
  setupView: document.querySelector("#setupView"),
  practiceView: document.querySelector("#practiceView"),
  chapterList: document.querySelector("#chapterList"),
  chapterSearchInput: document.querySelector("#chapterSearchInput"),
  keywordInput: document.querySelector("#keywordInput"),
  questionCountInput: document.querySelector("#questionCountInput"),
  questionCountRange: document.querySelector("#questionCountRange"),
  availableCount: document.querySelector("#availableCount"),
  startButton: document.querySelector("#startButton"),
  randomPickButton: document.querySelector("#randomPickButton"),
  selectAllChaptersButton: document.querySelector("#selectAllChaptersButton"),
  clearChaptersButton: document.querySelector("#clearChaptersButton"),
  resetSettingsButton: document.querySelector("#resetSettingsButton"),
  questionColumn: document.querySelector("#questionColumn"),
  answeredCount: document.querySelector("#answeredCount"),
  quizCount: document.querySelector("#quizCount"),
  progressBar: document.querySelector("#progressBar"),
  gradeButton: document.querySelector("#gradeButton"),
  retryWrongButton: document.querySelector("#retryWrongButton"),
  newQuizButton: document.querySelector("#newQuizButton"),
  backToSetupButton: document.querySelector("#backToSetupButton"),
  scoreBox: document.querySelector("#scoreBox"),
  scoreText: document.querySelector("#scoreText"),
  scorePercent: document.querySelector("#scorePercent"),
  chapterTemplate: document.querySelector("#chapterTemplate"),
  questionTemplate: document.querySelector("#questionTemplate"),
};

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function saveSettings() {
  localStorage.setItem("kaoguti-settings", JSON.stringify({
    chapters: [...state.selectedChapters],
    mode: state.mode,
    keyword: state.keyword,
    questionCount: state.questionCount,
  }));
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("kaoguti-settings"));
    if (!saved) return;
    if (Array.isArray(saved.chapters) && saved.chapters.length > 0) {
      state.selectedChapters = new Set(saved.chapters);
    }
    if (saved.mode === "random" || saved.mode === "ordered") state.mode = saved.mode;
    if (typeof saved.keyword === "string") state.keyword = saved.keyword;
    if (Number.isFinite(saved.questionCount)) state.questionCount = saved.questionCount;
  } catch {
    localStorage.removeItem("kaoguti-settings");
  }
}

function filteredQuestions() {
  const keyword = normalizeText(state.keyword);
  return data.questions.filter((question) => {
    if (!state.selectedChapters.has(question.chapterNumber)) return false;
    if (!keyword) return true;
    return normalizeText([
      question.prompt,
      question.fullText,
      question.chapterTitle,
      question.source,
      question.year,
      question.number,
    ].join(" ")).includes(keyword);
  });
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function setQuestionCount(value) {
  const available = filteredQuestions().length;
  const max = Math.max(1, available);
  state.questionCount = Math.min(Math.max(1, Number(value) || 1), max);
  elements.questionCountInput.value = state.questionCount;
  elements.questionCountRange.value = state.questionCount;
  saveSettings();
}

function updateAvailability() {
  const available = filteredQuestions().length;
  const max = Math.max(1, Math.min(available, 100));
  elements.availableCount.textContent = available;
  elements.questionCountInput.max = Math.max(1, available);
  elements.questionCountRange.max = max;
  if (available > 0 && state.questionCount > available) {
    state.questionCount = available;
  }
  elements.questionCountInput.value = state.questionCount;
  elements.questionCountRange.value = Math.min(state.questionCount, max);
  elements.startButton.disabled = available === 0 || state.selectedChapters.size === 0;
}

function renderChapters() {
  const filter = normalizeText(elements.chapterSearchInput.value);
  elements.chapterList.replaceChildren();

  for (const chapter of data.chapters) {
    const label = `${chapter.source} ${chapter.title}`;
    if (filter && !normalizeText(label).includes(filter)) continue;

    const fragment = elements.chapterTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".chapter-row");
    const input = fragment.querySelector("input");
    input.checked = state.selectedChapters.has(chapter.number);
    input.addEventListener("change", () => {
      if (input.checked) state.selectedChapters.add(chapter.number);
      else state.selectedChapters.delete(chapter.number);
      updateAvailability();
      saveSettings();
    });
    row.dataset.chapter = chapter.number;
    fragment.querySelector(".chapter-number").textContent = `第 ${chapter.number} 章`;
    fragment.querySelector(".chapter-title").textContent = chapter.title;
    fragment.querySelector(".chapter-count").textContent = `${chapter.count} 題`;
    elements.chapterList.append(fragment);
  }
}

function renderMode() {
  document.querySelectorAll(".segment").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.mode);
  });
}

function renderSetup() {
  elements.totalQuestionCount.textContent = data.questions.length;
  elements.totalChapterCount.textContent = data.chapters.length;
  elements.keywordInput.value = state.keyword;
  renderMode();
  renderChapters();
  updateAvailability();
}

function startQuiz(questions = null) {
  const pool = questions ?? filteredQuestions();
  const sorted = [...pool].sort((a, b) => a.year - b.year || a.number - b.number);
  const selected = state.mode === "random" ? shuffle(sorted) : sorted;
  state.quiz = selected.slice(0, Math.min(state.questionCount, selected.length));
  state.answers = new Map();
  state.results = [];
  state.submitted = false;

  elements.setupView.classList.add("is-hidden");
  elements.practiceView.classList.remove("is-hidden");
  elements.scoreBox.classList.add("is-hidden");
  elements.retryWrongButton.classList.add("is-hidden");
  elements.gradeButton.disabled = false;

  renderQuestions();
  updateProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function choiceMode(question) {
  return question.answer.mode === "multi" ? "multi" : "single";
}

function selectedLetters(questionId) {
  return [...(state.answers.get(questionId) ?? new Set())].sort();
}

function setChoice(question, letter) {
  if (state.submitted) return;
  const current = new Set(state.answers.get(question.id) ?? []);
  if (choiceMode(question) === "single") {
    if (current.has(letter)) current.clear();
    else {
      current.clear();
      current.add(letter);
    }
  } else if (current.has(letter)) {
    current.delete(letter);
  } else {
    current.add(letter);
  }
  if (current.size === 0) state.answers.delete(question.id);
  else state.answers.set(question.id, current);
  renderQuestionSelection(question.id);
  updateProgress();
}

function renderQuestions() {
  elements.questionColumn.replaceChildren();
  state.quiz.forEach((question, index) => {
    const fragment = elements.questionTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".question-card");
    card.id = `q-${question.id}`;
    card.dataset.questionId = question.id;
    fragment.querySelector(".question-meta").replaceChildren(
      metaChip(`#${index + 1}`),
      metaChip(`${question.year} 年第 ${question.number} 題`),
      metaChip(question.source),
      metaChip(question.chapterTitle),
    );
    fragment.querySelector("h3").textContent = question.prompt;

    const options = fragment.querySelector(".options");
    for (const option of question.options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      button.dataset.questionId = question.id;
      button.dataset.letter = option.key;
      button.addEventListener("click", () => setChoice(question, option.key));

      const key = document.createElement("span");
      key.className = "option-key";
      key.textContent = option.key;

      const text = document.createElement("span");
      text.className = "option-text";
      text.textContent = option.text;

      button.append(key, text);
      options.append(button);
    }
    elements.questionColumn.append(fragment);
  });
}

function metaChip(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function renderQuestionSelection(questionId) {
  const selected = state.answers.get(questionId) ?? new Set();
  document.querySelectorAll(`[data-question-id="${CSS.escape(questionId)}"].option-button`).forEach((button) => {
    button.classList.toggle("is-selected", selected.has(button.dataset.letter));
  });
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  return [...a].sort().every((letter, index) => letter === [...b].sort()[index]);
}

function isCorrect(question) {
  if (question.answer.mode === "giveaway") return true;
  const selected = selectedLetters(question.id);
  if (selected.length === 0) return false;
  return question.answer.acceptedSets.some((accepted) => sameSet(selected, accepted));
}

function gradeQuiz() {
  state.submitted = true;
  state.results = state.quiz.map((question) => ({
    id: question.id,
    correct: isCorrect(question),
    selected: selectedLetters(question.id),
  }));

  const correctCount = state.results.filter((result) => result.correct).length;
  const total = state.results.length;
  const percent = total ? Math.round((correctCount / total) * 100) : 0;
  elements.scoreText.textContent = `${correctCount} / ${total}`;
  elements.scorePercent.textContent = `${percent}%`;
  elements.scoreBox.classList.remove("is-hidden");
  elements.retryWrongButton.classList.toggle("is-hidden", correctCount === total);
  elements.gradeButton.disabled = true;

  renderCorrections();
  updateProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function answerLabel(question) {
  if (question.answer.mode === "giveaway") return `${question.answer.raw}，本題送分`;
  return question.answer.raw || question.answer.acceptedSets.map((set) => set.join("、")).join(" / ");
}

function renderCorrections() {
  for (const question of state.quiz) {
    const result = state.results.find((item) => item.id === question.id);
    const card = document.querySelector(`#q-${CSS.escape(question.id)}`);
    const correction = card.querySelector(".correction");
    card.classList.toggle("is-correct", result.correct);
    card.classList.toggle("is-wrong", !result.correct);

    const acceptedLetters = new Set(question.answer.acceptedSets.flat());
    card.querySelectorAll(".option-button").forEach((button) => {
      const letter = button.dataset.letter;
      const selected = result.selected.includes(letter);
      const answer = acceptedLetters.has(letter);
      button.disabled = true;
      button.classList.toggle("is-answer", answer);
      button.classList.toggle("is-wrong", selected && !answer);
      button.classList.toggle("is-missed", !selected && answer && !result.correct);
    });

    const chosen = result.selected.length ? result.selected.join("、") : "未作答";
    correction.classList.remove("is-hidden");
    correction.innerHTML = "";
    const answer = document.createElement("p");
    answer.innerHTML = `<strong>${result.correct ? "答對" : "訂正"}</strong>　你的答案：${chosen}；正確答案：${answerLabel(question)}`;
    const source = document.createElement("p");
    source.innerHTML = `<strong>出處</strong>　${question.source} ${question.chapterTitle}`;
    correction.append(answer, source);
  }
}

function updateProgress() {
  const answered = state.submitted ? state.quiz.length : state.answers.size;
  const total = state.quiz.length;
  elements.answeredCount.textContent = answered;
  elements.quizCount.textContent = total;
  elements.progressBar.style.width = `${total ? (answered / total) * 100 : 0}%`;
}

function retryWrong() {
  const wrongIds = new Set(state.results.filter((result) => !result.correct).map((result) => result.id));
  const wrongQuestions = state.quiz.filter((question) => wrongIds.has(question.id));
  state.questionCount = wrongQuestions.length;
  startQuiz(wrongQuestions);
}

function resetSettings() {
  state.selectedChapters = new Set(data.chapters.map((chapter) => chapter.number));
  state.mode = "random";
  state.keyword = "";
  state.questionCount = 20;
  localStorage.removeItem("kaoguti-settings");
  renderSetup();
}

function randomPickChapters() {
  const count = Math.min(5, data.chapters.length);
  const picked = shuffle(data.chapters).slice(0, count).map((chapter) => chapter.number);
  state.selectedChapters = new Set(picked);
  state.mode = "random";
  renderSetup();
  saveSettings();
}

function bindEvents() {
  elements.questionCountInput.addEventListener("input", (event) => setQuestionCount(event.target.value));
  elements.questionCountRange.addEventListener("input", (event) => setQuestionCount(event.target.value));
  elements.keywordInput.addEventListener("input", (event) => {
    state.keyword = event.target.value;
    updateAvailability();
    saveSettings();
  });
  elements.chapterSearchInput.addEventListener("input", renderChapters);
  elements.startButton.addEventListener("click", () => startQuiz());
  elements.gradeButton.addEventListener("click", gradeQuiz);
  elements.retryWrongButton.addEventListener("click", retryWrong);
  elements.newQuizButton.addEventListener("click", () => startQuiz());
  elements.backToSetupButton.addEventListener("click", () => {
    elements.practiceView.classList.add("is-hidden");
    elements.setupView.classList.remove("is-hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  elements.resetSettingsButton.addEventListener("click", resetSettings);
  elements.randomPickButton.addEventListener("click", randomPickChapters);
  elements.selectAllChaptersButton.addEventListener("click", () => {
    state.selectedChapters = new Set(data.chapters.map((chapter) => chapter.number));
    renderChapters();
    updateAvailability();
    saveSettings();
  });
  elements.clearChaptersButton.addEventListener("click", () => {
    state.selectedChapters.clear();
    renderChapters();
    updateAvailability();
    saveSettings();
  });
  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      renderMode();
      saveSettings();
    });
  });
}

loadSettings();
bindEvents();
renderSetup();
