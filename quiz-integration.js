(function () {
  const config = Object.assign(
    {
      liffId: "",
      apiBaseUrl: "https://line-anatomy-bot.onrender.com",
    },
    window.QUIZ_RUNTIME_CONFIG || {}
  );

  const state = {
    initPromise: null,
    ready: false,
    profile: null,
  };

  function getQuizNo() {
    const match = window.location.pathname.match(/(\d+)(?:st|nd|rd|th)-test\.html$/i);
    return match ? Number(match[1]) : null;
  }

  function isLiffConfigured() {
    return Boolean(config.liffId && !/YOUR_|CHANGE_ME/i.test(config.liffId));
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
    decorateCard(element, tone);
    element.innerHTML = html;
  }

  async function initLiff() {
    if (state.initPromise) {
      return state.initPromise;
    }

    state.initPromise = (async () => {
      if (!window.liff) {
        setStatus("LINE SDK を読み込めませんでした。", "error");
        return state;
      }

      if (!isLiffConfigured()) {
        setStatus("LINEログインは未設定です。`quiz-auth-config.js` に LIFF ID を設定してください。", "warning");
        return state;
      }

      try {
        await window.liff.init({ liffId: config.liffId });
        if (!window.liff.isLoggedIn()) {
          setStatus("LINEログインへ移動します...", "info");
          window.liff.login({ redirectUri: window.location.href });
          return state;
        }

        state.profile = await window.liff.getProfile();
        state.ready = true;
        setStatus(
          `<strong>LINEログイン中</strong><br>${state.profile.displayName} さんとして結果を保存します。`,
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

  async function submitQuizResult(result) {
    const quizNo = result.quizNo || getQuizNo();
    if (!quizNo) {
      setResult("クイズ番号を判定できないため、結果を保存できませんでした。", "error");
      return { ok: false };
    }

    await initLiff();
    if (!state.ready) {
      if (!isLiffConfigured()) {
        setResult("LIFF ID が未設定のため、結果保存はまだ有効化されていません。", "warning");
      }
      return { ok: false };
    }

    const accessToken = window.liff.getAccessToken();
    if (!accessToken) {
      setResult("LINE アクセストークンを取得できませんでした。", "error");
      return { ok: false };
    }

    const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "");
    if (!apiBaseUrl) {
      setResult("API の接続先が設定されていません。", "error");
      return { ok: false };
    }

    setResult("結果を保存しています...", "info");

    try {
      const response = await fetch(`${apiBaseUrl}/quiz_api/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          line_access_token: accessToken,
          quiz_no: quizNo,
          quiz_title: result.quizTitle || document.title,
          score: result.score,
          total_questions: result.totalQuestions,
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
        setResult(message, response.status === 404 ? "warning" : "error");
        return { ok: false, error: message };
      }

      const savedMessage = data.passed
        ? `<p><strong>${data.name}さんの結果を保存しました。</strong></p><p>${data.quiz_label}: ${data.score} / ${data.total_questions} 問で満点です。</p>`
        : `<p><strong>${data.name}さんの結果を保存しました。</strong></p><p>${data.quiz_label}: ${data.score} / ${data.total_questions} 問 (${data.percentage}%)</p>`;
      setResult(savedMessage, "success");
      return { ok: true, data };
    } catch (error) {
      console.error(error);
      setResult(`通信エラーのため結果を保存できませんでした: ${error.message}`, "error");
      return { ok: false, error: error.message };
    }
  }

  function resetResultMessage() {
    const element = document.getElementById("attendance-link");
    if (!element) {
      return;
    }
    element.innerHTML = "";
    element.style.display = "none";
  }

  window.quizIntegration = {
    getQuizNo,
    initLiff,
    submitQuizResult,
    resetResultMessage,
  };

  document.addEventListener("DOMContentLoaded", () => {
    initLiff();
  });
})();
