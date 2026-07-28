(function () {
  "use strict";

  function goToTopPageWithConfirm() {
    const shouldLeave = window.confirm(
      "トップページに戻りますか？\n回答途中の内容は保存されません。"
    );

    if (shouldLeave) {
      window.location.href = "index.html";
    }
  }

  function installTopReturnButton() {
    const quizContainer = document.getElementById("quiz-container");

    if (!quizContainer || document.getElementById("quiz-top-return")) {
      return;
    }

    const button = document.createElement("button");
    button.id = "quiz-top-return";
    button.className = "quiz-top-return";
    button.type = "button";
    button.textContent = "トップに戻る";
    button.setAttribute("aria-label", "回答を中断してトップページに戻る");
    button.addEventListener("click", goToTopPageWithConfirm);
    document.body.appendChild(button);

    const syncVisibility = () => {
      button.hidden = quizContainer.style.display === "none";
    };

    const visibilityObserver = new MutationObserver(syncVisibility);
    visibilityObserver.observe(quizContainer, {
      attributes: true,
      attributeFilter: ["style"],
    });
    button.quizVisibilityObserver = visibilityObserver;
    syncVisibility();
  }

  window.goToTopPageWithConfirm = goToTopPageWithConfirm;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installTopReturnButton, { once: true });
  } else {
    installTopReturnButton();
  }
})();
