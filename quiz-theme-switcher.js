/* quiz-theme-switcher.js
 * 学生がテーマ（配色）と文字サイズを選べる切替UI。
 * 選択内容は localStorage に保存し、確認テストで共通適用する。
 * 適用中のテーマは <html data-quiz-theme="..."> に反映され、
 * quiz-integration.js が結果送信時に theme として収集する（統計用）。
 */
(function () {
  "use strict";

  var THEME_KEY = "jintainokouzoutokinou.quizTheme";
  var SCALE_KEY = "jintainokouzoutokinou.quizFontScale";
  var DEFAULT_THEME = "standard";
  var DEFAULT_SCALE = "1";
  var recordTimer = null;

  var THEMES = [
    { id: "standard", label: "標準", swatch: "linear-gradient(135deg,#a8edea,#fed6e3)" },
    { id: "liquid", label: "リキッドガラス", swatch: "linear-gradient(rgba(255,255,255,.34),rgba(255,255,255,.08)),url('pressed-flower-bg.jpg')" },
    { id: "blue", label: "やわらかブルー", swatch: "linear-gradient(160deg,#eef3f8,#dbe7f1)" },
    { id: "dark", label: "ダーク", swatch: "linear-gradient(160deg,#0f1720,#1b2533)" },
    { id: "sepia", label: "セピア", swatch: "#f3e9d6" }
  ];

  var SCALES = [
    { id: "1", label: "A", title: "標準サイズ" },
    { id: "1.15", label: "A+", title: "大きめ" },
    { id: "1.3", label: "A++", title: "さらに大きく" }
  ];

  function safeGet(key, fallback) {
    try {
      return window.localStorage.getItem(key) || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* localStorage 不可（プライベートモード等）でも動作は継続 */
    }
  }

  function isValidTheme(id) {
    return THEMES.some(function (t) { return t.id === id; });
  }

  function getTheme() {
    var t = safeGet(THEME_KEY, DEFAULT_THEME);
    return isValidTheme(t) ? t : DEFAULT_THEME;
  }

  function getScale() {
    var s = safeGet(SCALE_KEY, DEFAULT_SCALE);
    return SCALES.some(function (x) { return x.id === s; }) ? s : DEFAULT_SCALE;
  }

  function applyTheme(id) {
    document.documentElement.setAttribute("data-quiz-theme", id);
    // リキッドガラスはレンズ用SVGフィルタが必要。切替時にも注入する。
    if (id === "liquid" && typeof window.quizGlassInject === "function") {
      window.quizGlassInject();
    }
  }

  function applyScale(scale) {
    document.documentElement.style.setProperty("--q-font-scale", scale);
  }

  function isLocalPreview() {
    var host = window.location.hostname;
    return (
      window.location.protocol === "file:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      host.endsWith(".ts.net")
    );
  }

  function getQuizNo() {
    if (window.quizIntegration && typeof window.quizIntegration.getQuizNo === "function") {
      return window.quizIntegration.getQuizNo();
    }
    var match = window.location.pathname.match(/(\d+)(?:st|nd|rd|th)-test\.html$/i);
    return match ? Number(match[1]) : null;
  }

  function recordUiSettings(changedField) {
    if (recordTimer) {
      window.clearTimeout(recordTimer);
    }
    recordTimer = window.setTimeout(function () {
      var runtimeConfig = window.QUIZ_RUNTIME_CONFIG || {};
      var apiBaseUrl = String(runtimeConfig.apiBaseUrl || "").replace(/\/$/, "");

      if (!apiBaseUrl || isLocalPreview() || !window.liff) {
        return;
      }

      try {
        if (!window.liff.isLoggedIn || !window.liff.isLoggedIn()) {
          return;
        }
      } catch (e) {
        return;
      }

      var accessToken = "";
      try {
        accessToken = window.liff.getAccessToken && window.liff.getAccessToken();
      } catch (e) {
        accessToken = "";
      }
      if (!accessToken) {
        return;
      }

      var quizNo = getQuizNo();
      var payload = {
        line_access_token: accessToken,
        quiz_set: String(runtimeConfig.quizSet || "jintainokouzoutokinou"),
        quiz_no: quizNo,
        theme: getTheme(),
        font_scale: getScale(),
        changed_field: changedField,
        page_title: document.title,
        page_path: window.location.pathname
      };

      if (quizNo === null) {
        delete payload.quiz_no;
      }

      fetch(apiBaseUrl + "/quiz_api/ui_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(function (error) {
        console.warn("UI setting record failed:", error);
      });
    }, 250);
  }

  // FOUC 回避のため、UI 構築前に保存値を即適用する
  applyTheme(getTheme());
  applyScale(getScale());

  function buildUI() {
    if (document.querySelector(".quiz-theme-switcher")) {
      return;
    }

    var activeTheme = getTheme();
    var activeScale = getScale();

    var wrap = document.createElement("div");
    wrap.className = "quiz-theme-switcher";
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "表示テーマと文字サイズの設定");

    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "qts-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "表示設定を開く");
    toggle.innerHTML = '<span aria-hidden="true">🎨</span><span class="qts-toggle-text">表示</span>';

    var panel = document.createElement("div");
    panel.className = "qts-panel";
    panel.hidden = true;

    var themeTitle = document.createElement("div");
    themeTitle.className = "qts-title";
    themeTitle.textContent = "テーマ";
    panel.appendChild(themeTitle);

    var themeRow = document.createElement("div");
    themeRow.className = "qts-row qts-theme-row";

    THEMES.forEach(function (theme) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qts-theme" + (theme.id === activeTheme ? " is-active" : "");
      btn.dataset.theme = theme.id;
      btn.setAttribute("aria-pressed", theme.id === activeTheme ? "true" : "false");
      btn.title = theme.label;
      btn.innerHTML =
        '<span class="qts-swatch" style="background:' + theme.swatch + '"></span>' +
        '<span class="qts-theme-label">' + theme.label + "</span>";
      btn.addEventListener("click", function () {
        applyTheme(theme.id);
        safeSet(THEME_KEY, theme.id);
        updateActive(themeRow, "theme", theme.id);
        recordUiSettings("theme");
      });
      themeRow.appendChild(btn);
    });
    panel.appendChild(themeRow);

    var scaleTitle = document.createElement("div");
    scaleTitle.className = "qts-title";
    scaleTitle.textContent = "文字サイズ";
    panel.appendChild(scaleTitle);

    var scaleRow = document.createElement("div");
    scaleRow.className = "qts-row qts-scale-row";

    SCALES.forEach(function (scale) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qts-scale" + (scale.id === activeScale ? " is-active" : "");
      btn.dataset.scale = scale.id;
      btn.setAttribute("aria-pressed", scale.id === activeScale ? "true" : "false");
      btn.title = scale.title;
      btn.textContent = scale.label;
      btn.addEventListener("click", function () {
        applyScale(scale.id);
        safeSet(SCALE_KEY, scale.id);
        updateActive(scaleRow, "scale", scale.id);
        recordUiSettings("font_scale");
      });
      scaleRow.appendChild(btn);
    });
    panel.appendChild(scaleRow);

    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      wrap.classList.toggle("is-open", open);
    }

    toggle.addEventListener("click", function () {
      setOpen(panel.hidden);
    });

    document.addEventListener("click", function (event) {
      if (!wrap.contains(event.target)) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    });

    wrap.appendChild(toggle);
    wrap.appendChild(panel);
    document.body.appendChild(wrap);
  }

  function updateActive(row, type, id) {
    var attr = type === "theme" ? "theme" : "scale";
    var cls = type === "theme" ? "qts-theme" : "qts-scale";
    row.querySelectorAll("." + cls).forEach(function (el) {
      var on = el.dataset[attr] === id;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  // 結果送信側などから現在のテーマを参照できるよう公開
  window.quizTheme = {
    get: getTheme,
    getScale: getScale,
    apply: applyTheme
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildUI);
  } else {
    buildUI();
  }
})();
