(function () {
  "use strict";

  function getProgressState() {
    try {
      if (
        typeof currentQuestion === "number" &&
        typeof quizData !== "undefined" &&
        Array.isArray(quizData) &&
        quizData.length > 0
      ) {
        return {
          current: Math.min(Math.max(currentQuestion + 1, 1), quizData.length),
          total: quizData.length,
        };
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  function installQuestionProgress() {
    const quizContainer = document.getElementById("quiz-container");
    const quizContent = document.getElementById("quiz-content");
    const question = document.getElementById("question");

    if (
      !quizContainer ||
      !quizContent ||
      !question ||
      document.getElementById("quiz-question-progress")
    ) {
      return;
    }

    const progress = document.createElement("div");
    progress.id = "quiz-question-progress";
    progress.className = "quiz-question-progress";
    progress.setAttribute("aria-label", "クイズの進捗");
    progress.innerHTML = `
      <div class="quiz-question-progress__meta">
        <span class="quiz-question-progress__label">現在の問題</span>
        <strong id="quiz-question-progress-count" class="quiz-question-progress__count" aria-live="polite" aria-atomic="true"></strong>
      </div>
      <div
        id="quiz-question-progress-track"
        class="quiz-question-progress__track"
        role="progressbar"
        aria-label="回答の進捗"
        aria-valuemin="1"
      >
        <span id="quiz-question-progress-bar" class="quiz-question-progress__bar"></span>
      </div>
    `;
    quizContainer.insertBefore(progress, quizContent);

    const count = document.getElementById("quiz-question-progress-count");
    const track = document.getElementById("quiz-question-progress-track");
    const bar = document.getElementById("quiz-question-progress-bar");

    function renderProgress() {
      const state = getProgressState();

      if (!state) {
        progress.hidden = true;
        return;
      }

      const percentage = (state.current / state.total) * 100;
      progress.hidden = false;
      count.textContent = `問題 ${state.current} / ${state.total}`;
      track.setAttribute("aria-valuenow", String(state.current));
      track.setAttribute("aria-valuemax", String(state.total));
      track.setAttribute("aria-valuetext", `${state.total}問中${state.current}問目`);
      bar.style.width = `${percentage}%`;
    }

    const questionObserver = new MutationObserver(renderProgress);
    questionObserver.observe(question, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    progress.questionObserver = questionObserver;
    renderProgress();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installQuestionProgress, { once: true });
  } else {
    installQuestionProgress();
  }
})();
