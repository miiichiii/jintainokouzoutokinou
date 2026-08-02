(function () {
  const config = Object.assign(
    {
      liffId: "",
      apiBaseUrl: "https://line-anatomy-bot.onrender.com",
      quizSet: "jintainokouzoutokinou",
    },
    window.QUIZ_RUNTIME_CONFIG || {}
  );

  const state = {
    initPromise: null,
    ready: false,
    profile: null,
    submission: {
      phase: "idle",
      activePromise: null,
      lastResult: null,
    },
  };
  const PASS_PERCENTAGE = 80;

  function restoreLiffStateIfNeeded() {
    const params = new URLSearchParams(window.location.search);
    const stateValue = params.get("liff.state");
    if (!stateValue) {
      return false;
    }

    const targetUrl = new URL(decodeURIComponent(stateValue), window.location.href);
    const currentUrl = new URL(window.location.href);
    const sameTarget =
      targetUrl.pathname === currentUrl.pathname &&
      targetUrl.search === currentUrl.search &&
      targetUrl.hash === currentUrl.hash;

    if (!sameTarget) {
      window.location.replace(targetUrl.toString());
      return true;
    }
    return false;
  }

  function getQuizNo() {
    const match = window.location.pathname.match(/(\d+)(?:st|nd|rd|th)-test\.html$/i);
    return match ? Number(match[1]) : null;
  }

  function isLiffConfigured() {
    return Boolean(config.liffId && !/YOUR_|CHANGE_ME/i.test(config.liffId));
  }

  function isLocalPreview() {
    const host = window.location.hostname;
    return (
      window.location.protocol === "file:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".ts.net")
    );
  }

  function decorateCard(element, tone) {
    if (!element) {
      return;
    }
    const styles = {
      info: {
        background: "rgba(219, 234, 254, 0.85)",
        border: "1px solid rgba(96, 165, 250, 0.4)",
        color: "#1d4ed8",
      },
      success: {
        background: "rgba(220, 252, 231, 0.85)",
        border: "1px solid rgba(74, 222, 128, 0.45)",
        color: "#166534",
      },
      warning: {
        background: "rgba(254, 249, 195, 0.92)",
        border: "1px solid rgba(250, 204, 21, 0.5)",
        color: "#854d0e",
      },
      error: {
        background: "rgba(254, 226, 226, 0.92)",
        border: "1px solid rgba(248, 113, 113, 0.45)",
        color: "#b91c1c",
      },
    };
    const selected = styles[tone] || styles.info;
    element.style.display = "block";
    element.style.background = selected.background;
    element.style.border = selected.border;
    element.style.color = selected.color;
  }

  function setStatus(html, tone) {
    const element = document.getElementById("line-auth-status");
    if (!element) {
      return;
    }
    decorateCard(element, tone);
    element.innerHTML = html;
  }

  function setResult(html, tone) {
    const element = document.getElementById("attendance-link");
    if (!element) {
      return;
    }
    const resultContainer = document.getElementById("result-container");
    if (
      resultContainer &&
      resultContainer.parentNode &&
      element.parentNode === resultContainer.parentNode &&
      element.nextSibling !== resultContainer
    ) {
      resultContainer.parentNode.insertBefore(element, resultContainer);
    }
    decorateCard(element, tone);
    element.setAttribute("role", tone === "error" ? "alert" : "status");
    element.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
    element.style.fontSize = "1.05rem";
    element.style.fontWeight = "600";
    element.style.lineHeight = "1.6";
    element.style.padding = "18px";
    element.style.boxShadow = "0 8px 24px rgba(15, 23, 42, 0.12)";
    element.innerHTML = html;
  }

  function getResultActionButtons() {
    const resultContainer = document.getElementById("result-container");
    if (!resultContainer || typeof resultContainer.querySelectorAll !== "function") {
      return [];
    }
    return Array.from(resultContainer.querySelectorAll("button.nav-button"));
  }

  function setSubmissionPhase(phase) {
    state.submission.phase = phase;
    const saving = phase === "saving";
    getResultActionButtons().forEach((button) => {
      button.disabled = saving;
      button.setAttribute("aria-disabled", saving ? "true" : "false");
      button.style.opacity = saving ? "0.55" : "";
      button.style.cursor = saving ? "wait" : "";
    });
    if (document.documentElement) {
      document.documentElement.setAttribute("data-quiz-save-state", phase);
    }
  }

  function preventLeaveWhileSaving(event) {
    if (state.submission.phase !== "saving") {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  }

  function appendRetryButton() {
    const element = document.getElementById("attendance-link");
    if (!element || !state.submission.lastResult || document.getElementById("quiz-save-retry")) {
      return;
    }
    const button = document.createElement("button");
    button.id = "quiz-save-retry";
    button.type = "button";
    button.textContent = "結果の保存を再試行";
    button.style.display = "block";
    button.style.margin = "14px auto 0";
    button.style.padding = "12px 20px";
    button.style.border = "0";
    button.style.borderRadius = "999px";
    button.style.background = "#b91c1c";
    button.style.color = "#fff";
    button.style.font = "inherit";
    button.style.fontWeight = "700";
    button.style.cursor = "pointer";
    button.addEventListener("click", () => {
      submitQuizResult(state.submission.lastResult);
    });
    element.appendChild(button);
  }

  function formatDelta(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "";
    }
    if (value > 0) {
      return `+${value}`;
    }
    return `${value}`;
  }

  function formatClearedQuizLabels(labels) {
    if (!Array.isArray(labels) || labels.length === 0) {
      return "まだありません";
    }
    return labels.join(" / ");
  }

  function getQuizSet() {
    const quizSet = String(config.quizSet || "jintainokouzoutokinou").trim();
    return quizSet || "jintainokouzoutokinou";
  }

  function getApiBaseUrl() {
    return String(config.apiBaseUrl || "").replace(/\/$/, "");
  }

  async function fetchProgressSummary(accessToken) {
    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl || !accessToken) {
      return null;
    }

    const response = await fetch(`${apiBaseUrl}/quiz_api/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        line_access_token: accessToken,
        quiz_set: getQuizSet(),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return null;
    }
    return data;
  }

  async function initLiff() {
    if (state.initPromise) {
      return state.initPromise;
    }

    state.initPromise = (async () => {
      if (isLocalPreview()) {
        setStatus("プレビュー表示中のため、LINEログインと結果保存はスキップしています。", "info");
        return state;
      }

      if (!window.liff) {
        setStatus("LINE SDK を読み込めませんでした。", "error");
        return state;
      }

      if (!isLiffConfigured()) {
        setStatus("LINEログインは未設定です。`quiz-auth-config.js` に LIFF ID を設定してください。", "warning");
        return state;
      }

      try {
        await window.liff.init({
          liffId: config.liffId,
          withLoginOnExternalBrowser: true,
        });
        if (restoreLiffStateIfNeeded()) {
          return state;
        }
        if (!window.liff.isLoggedIn()) {
          setStatus("LINEログインへ移動します...", "info");
          window.liff.login({ redirectUri: window.location.href });
          return state;
        }

        state.profile = await window.liff.getProfile();
        state.ready = true;
        setStatus(
          `<strong>${state.profile.displayName}さん、ようこそ</strong><br>このアカウントで結果を保存します。`,
          "success"
        );
      } catch (error) {
        console.error(error);
        setStatus(`LINEログインの初期化に失敗しました: ${error.message}`, "error");
      }
      return state;
    })();

    return state.initPromise;
  }

  function buildAnswerPayload(quizData, userAnswers) {
    return quizData.map((question, index) => {
      const selectedIndex = userAnswers[index];
      return {
        question_no: index + 1,
        question: question.question,
        selected_index: Number.isInteger(selectedIndex) ? selectedIndex : null,
        selected_text: Number.isInteger(selectedIndex) ? question.options[selectedIndex] || "" : "",
        correct_index: question.answer,
        correct_text: question.options[question.answer] || "",
        is_correct: selectedIndex === question.answer,
      };
    });
  }

  async function performQuizResultSubmission(result) {
    const quizNo = result.quizNo || getQuizNo();
    if (!quizNo) {
      setResult(
        "<p><strong>保存できませんでした</strong></p><p>クイズ番号を判定できませんでした。この画面を閉じず、担当教員へお知らせください。</p>",
        "error"
      );
      return { ok: false, retryable: false };
    }

    await initLiff();
    if (!state.ready) {
      if (isLocalPreview()) {
        setResult("<p><strong>プレビュー中です</strong></p><p>この結果は保存されません。</p>", "info");
      }
      if (!isLiffConfigured()) {
        setResult(
          "<p><strong>保存できませんでした</strong></p><p>LINEログインが設定されていません。</p>",
          "warning"
        );
      }
      return { ok: false, retryable: false };
    }

    const accessToken = window.liff.getAccessToken();
    if (!accessToken) {
      setResult(
        "<p><strong>保存できませんでした</strong></p><p>LINEログイン情報を取得できませんでした。この画面を閉じず、通信状態を確認してください。</p>",
        "error"
      );
      return { ok: false, retryable: true };
    }

    const apiBaseUrl = getApiBaseUrl();
    if (!apiBaseUrl) {
      setResult(
        "<p><strong>保存できませんでした</strong></p><p>結果の保存先が設定されていません。この画面を閉じず、担当教員へお知らせください。</p>",
        "error"
      );
      return { ok: false, retryable: false };
    }

    const theme =
      (window.quizTheme && window.quizTheme.get && window.quizTheme.get()) ||
      document.documentElement.getAttribute("data-quiz-theme") ||
      "standard";
    const fontScale =
      (window.quizTheme && window.quizTheme.getScale && window.quizTheme.getScale()) ||
      document.documentElement.style.getPropertyValue("--q-font-scale").trim() ||
      "1";

    try {
      const response = await fetch(`${apiBaseUrl}/quiz_api/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          line_access_token: accessToken,
          quiz_set: getQuizSet(),
          quiz_no: quizNo,
          quiz_title: result.quizTitle || document.title,
          score: result.score,
          total_questions: result.totalQuestions,
          theme,
          font_scale: fontScale,
          answers: buildAnswerPayload(result.quizData, result.userAnswers),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          data.error ||
          (response.status === 404
            ? "学生情報が見つかりません。先にLINEで「出席」を送信して初回登録してください。"
            : "結果の保存に失敗しました。");
        setResult(
          `<p><strong>保存できませんでした</strong></p><p>${message}</p><p>今回の結果はまだ記録されていません。</p>`,
          response.status === 404 ? "warning" : "error"
        );
        return { ok: false, error: message, retryable: response.status !== 404 };
      }

      const progressLines = [
        `<p>${data.quiz_label}: 今回 ${data.score} / ${data.total_questions} 問 (${data.percentage}%)</p>`,
        `<p>これまで ${data.attempt_count} 回挑戦 / 最高 ${data.best_score} / ${data.best_total_questions} 問 (${data.best_percentage}%)</p>`,
      ];
      if (typeof data.percentage_delta === "number") {
        progressLines.push(`<p>前回比 ${formatDelta(data.percentage_delta)}%</p>`);
      }
      if (data.best_updated) {
        progressLines.push("<p>自己ベスト更新です。</p>");
      }
      if (data.first_pass_achieved) {
        progressLines.push(`<p>今回が初回合格です。合格基準は ${PASS_PERCENTAGE}% 以上です。</p>`);
      } else if (data.passed) {
        progressLines.push(`<p>${PASS_PERCENTAGE}% 以上で合格です。</p>`);
      } else if (data.overall_passed) {
        progressLines.push(`<p>今回の結果は未到達でしたが、これまでの合格記録は保持されています。</p>`);
      } else {
        progressLines.push(`<p>合格基準は ${PASS_PERCENTAGE}% 以上です。次の挑戦で更新を狙ってください。</p>`);
      }
      if (typeof data.total_attempts === "number") {
        progressLines.push(
          `<p>通算 ${data.total_attempts} 回挑戦 / クリア済み ${data.cleared_quizzes} / ${data.total_quizzes} 回 / 満点 ${data.perfect_clears} 回</p>`
        );
      }
      if (Array.isArray(data.cleared_quiz_labels)) {
        progressLines.push(`<p>クリア済み: ${formatClearedQuizLabels(data.cleared_quiz_labels)}</p>`);
      }
      if (data.motivation_title) {
        progressLines.push(`<p>${data.motivation_title}: ${data.motivation_message}</p>`);
      }

      const savedMessage = data.passed
        ? `<p><strong>保存完了：${data.name}さんの結果を記録しました。</strong></p>${progressLines.join("")}`
        : `<p><strong>保存完了：${data.name}さんの挑戦を記録しました。</strong></p>${progressLines.join("")}`;
      setResult(savedMessage, data.passed ? "success" : "warning");
      return { ok: true, data };
    } catch (error) {
      console.error(error);
      setResult(
        `<p><strong>保存できませんでした</strong></p><p>通信エラーが発生しました。この画面を閉じず、通信状態を確認して「結果の保存を再試行」を押してください。</p>`,
        "error"
      );
      return { ok: false, error: error.message, retryable: true };
    }
  }

  function submitQuizResult(result) {
    if (state.submission.activePromise) {
      return state.submission.activePromise;
    }

    state.submission.lastResult = result;
    setSubmissionPhase("saving");
    setResult(
      "<p><strong>結果を保存しています</strong></p><p>保存完了と表示されるまで、この画面を閉じたり移動したりしないでください。</p>",
      "info"
    );

    const activePromise = performQuizResultSubmission(result)
      .then((outcome) => {
        setSubmissionPhase(outcome.ok ? "saved" : "failed");
        if (!outcome.ok && outcome.retryable) {
          appendRetryButton();
        }
        return outcome;
      })
      .catch((error) => {
        console.error(error);
        setResult(
          "<p><strong>保存できませんでした</strong></p><p>予期しないエラーが発生しました。この画面を閉じず、「結果の保存を再試行」を押してください。</p>",
          "error"
        );
        setSubmissionPhase("failed");
        appendRetryButton();
        return { ok: false, error: error.message, retryable: true };
      })
      .finally(() => {
        state.submission.activePromise = null;
      });

    state.submission.activePromise = activePromise;
    return activePromise;
  }

  function resetResultMessage() {
    if (state.submission.phase === "saving") {
      return false;
    }
    state.submission.lastResult = null;
    setSubmissionPhase("idle");
    const element = document.getElementById("attendance-link");
    if (!element) {
      return true;
    }
    element.innerHTML = "";
    element.style.display = "none";
    return true;
  }

  window.quizIntegration = {
    fetchProgressSummary,
    getQuizNo,
    getQuizSet,
    initLiff,
    submitQuizResult,
    resetResultMessage,
  };

  document.addEventListener("DOMContentLoaded", () => {
    initLiff();
  });
  window.addEventListener("beforeunload", preventLeaveWhileSaving);
})();
