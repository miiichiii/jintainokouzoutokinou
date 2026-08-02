#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const integrationPath = path.join(rootDir, "quiz-integration.js");
const integrationSource = fs.readFileSync(integrationPath, "utf8");
const quizPages = [
  "1st-test.html",
  "2nd-test.html",
  "3rd-test.html",
  "4th-test.html",
  "5th-test.html",
  "6th-test.html",
  "7th-test.html",
  "8th-test.html",
  "9th-test.html",
];

for (const filename of quizPages) {
  const source = fs.readFileSync(path.join(rootDir, filename), "utf8");
  assert.equal(
    (source.match(/async function showResult\s*\(/g) || []).length,
    1,
    `${filename}: 結果表示をasyncで待機してください`
  );
  assert.equal(
    (source.match(/await window\.quizIntegration\.submitQuizResult\s*\(/g) || []).length,
    1,
    `${filename}: サーバー保存の完了をawaitしてください`
  );
  assert.equal(
    (source.match(/quiz-integration\.js\?v=20260802-save-guard/g) || []).length,
    1,
    `${filename}: 保存ガード版JSを確実に読み込んでください`
  );
}

class FakeElement {
  constructor(tagName, id, document) {
    this.tagName = tagName.toUpperCase();
    this.id = id || "";
    this.ownerDocument = document;
    this.parentNode = null;
    this.children = [];
    this.style = {
      getPropertyValue() {
        return "";
      },
    };
    this.attributes = {};
    this.disabled = false;
    this.textContent = "";
    this._innerHTML = "";
    this.listeners = new Map();
    this.resultButtons = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    for (const child of this.children) {
      if (child.id) this.ownerDocument.elements.delete(child.id);
      child.parentNode = null;
    }
    this.children = [];
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return index >= 0 ? this.parentNode.children[index + 1] || null : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  appendChild(child) {
    if (child.parentNode) {
      const oldIndex = child.parentNode.children.indexOf(child);
      if (oldIndex >= 0) child.parentNode.children.splice(oldIndex, 1);
    }
    child.parentNode = this;
    this.children.push(child);
    if (child.id) this.ownerDocument.elements.set(child.id, child);
    return child;
  }

  insertBefore(child, reference) {
    if (child.parentNode) {
      const oldIndex = child.parentNode.children.indexOf(child);
      if (oldIndex >= 0) child.parentNode.children.splice(oldIndex, 1);
    }
    const index = this.children.indexOf(reference);
    child.parentNode = this;
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    return child;
  }

  querySelectorAll(selector) {
    return selector === "button.nav-button" ? this.resultButtons : [];
  }

  click() {
    for (const listener of this.listeners.get("click") || []) listener({ target: this });
  }
}

function makeSuccessData() {
  return {
    quiz_label: "第1回",
    score: 8,
    total_questions: 10,
    percentage: 80,
    attempt_count: 1,
    best_score: 8,
    best_total_questions: 10,
    best_percentage: 80,
    percentage_delta: null,
    best_updated: true,
    first_pass_achieved: true,
    passed: true,
    overall_passed: true,
    total_attempts: 1,
    cleared_quizzes: 1,
    total_quizzes: 9,
    perfect_clears: 0,
    cleared_quiz_labels: ["第1回"],
    name: "テスト学生",
  };
}

function createHarness(fetchImpl) {
  const elements = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const document = {
    elements,
    documentElement: null,
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      return new FakeElement(tagName, "", document);
    },
    addEventListener(name, listener) {
      const listeners = documentListeners.get(name) || [];
      listeners.push(listener);
      documentListeners.set(name, listeners);
    },
  };
  document.documentElement = new FakeElement("html", "", document);

  const parent = new FakeElement("main", "main", document);
  const resultContainer = new FakeElement("div", "result-container", document);
  const attendanceLink = new FakeElement("div", "attendance-link", document);
  const authStatus = new FakeElement("div", "line-auth-status", document);
  const retryButton = new FakeElement("button", "retry", document);
  const topButton = new FakeElement("button", "top", document);
  resultContainer.resultButtons = [retryButton, topButton];
  elements.set(resultContainer.id, resultContainer);
  elements.set(attendanceLink.id, attendanceLink);
  elements.set(authStatus.id, authStatus);
  parent.appendChild(resultContainer);
  parent.appendChild(attendanceLink);
  parent.appendChild(authStatus);

  const window = {
    QUIZ_RUNTIME_CONFIG: {
      liffId: "test-liff-id",
      apiBaseUrl: "https://example.test",
      quizSet: "jintainokouzoutokinou",
    },
    location: {
      search: "",
      href: "https://quiz.example.test/1st-test.html",
      pathname: "/1st-test.html",
      hostname: "quiz.example.test",
      protocol: "https:",
      replace() {},
    },
    liff: {
      async init() {},
      isLoggedIn: () => true,
      async getProfile() {
        return { displayName: "テスト学生" };
      },
      getAccessToken: () => "test-access-token",
    },
    addEventListener(name, listener) {
      const listeners = windowListeners.get(name) || [];
      listeners.push(listener);
      windowListeners.set(name, listeners);
    },
  };

  vm.runInNewContext(integrationSource, {
    window,
    document,
    fetch: fetchImpl,
    URL,
    URLSearchParams,
    console: { error() {} },
  });

  return {
    window,
    document,
    parent,
    resultContainer,
    attendanceLink,
    resultButtons: [retryButton, topButton],
    beforeUnload: windowListeners.get("beforeunload")[0],
  };
}

function makeResult() {
  return {
    quizNo: 1,
    quizTitle: "第1回",
    score: 8,
    totalQuestions: 10,
    userAnswers: [0],
    quizData: [
      {
        question: "question",
        options: ["correct", "incorrect"],
        answer: 0,
      },
    ],
  };
}

let resolveFetch;
let successFetchCalls = 0;
const pendingFetch = new Promise((resolve) => {
  resolveFetch = resolve;
});
const successHarness = createHarness(async () => {
  successFetchCalls += 1;
  return pendingFetch;
});
const firstSubmission = successHarness.window.quizIntegration.submitQuizResult(makeResult());
const duplicateSubmission = successHarness.window.quizIntegration.submitQuizResult(makeResult());
assert.equal(firstSubmission, duplicateSubmission, "保存中の二重送信は同じ処理を待つ必要があります");
assert.equal(successHarness.document.documentElement.getAttribute("data-quiz-save-state"), "saving");
assert.ok(successHarness.resultButtons.every((button) => button.disabled), "保存中は結果画面の移動ボタンを無効化してください");
assert.match(successHarness.attendanceLink.innerHTML, /結果を保存しています/);
assert.equal(successHarness.parent.children[0], successHarness.attendanceLink, "保存状態は結果一覧より上に表示してください");
const blockedLeave = {
  prevented: false,
  returnValue: undefined,
  preventDefault() {
    this.prevented = true;
  },
};
successHarness.beforeUnload(blockedLeave);
assert.equal(blockedLeave.prevented, true, "保存中の再読み込み・離脱を警告してください");

resolveFetch({
  ok: true,
  status: 200,
  async json() {
    return makeSuccessData();
  },
});
const savedOutcome = await firstSubmission;
assert.equal(savedOutcome.ok, true);
assert.equal(successFetchCalls, 1, "二重送信でAPIを複数回呼ばないでください");
assert.equal(successHarness.document.documentElement.getAttribute("data-quiz-save-state"), "saved");
assert.ok(successHarness.resultButtons.every((button) => !button.disabled), "保存完了後は移動ボタンを戻してください");
assert.match(successHarness.attendanceLink.innerHTML, /保存完了/);
const allowedLeave = {
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
};
successHarness.beforeUnload(allowedLeave);
assert.equal(allowedLeave.prevented, false, "保存完了後の離脱を妨げないでください");

let failureFetchCalls = 0;
const failureHarness = createHarness(async () => {
  failureFetchCalls += 1;
  if (failureFetchCalls === 1) {
    return {
      ok: false,
      status: 503,
      async json() {
        return { error: "一時的に利用できません" };
      },
    };
  }
  return {
    ok: true,
    status: 200,
    async json() {
      return makeSuccessData();
    },
  };
});
const failedOutcome = await failureHarness.window.quizIntegration.submitQuizResult(makeResult());
assert.equal(failedOutcome.ok, false);
assert.equal(failureHarness.document.documentElement.getAttribute("data-quiz-save-state"), "failed");
assert.ok(failureHarness.resultButtons.every((button) => !button.disabled), "保存失敗後は再操作できる必要があります");
assert.match(failureHarness.attendanceLink.innerHTML, /保存できませんでした/);
const retrySaveButton = failureHarness.document.getElementById("quiz-save-retry");
assert.ok(retrySaveButton, "再試行可能な失敗には保存再試行ボタンを表示してください");
retrySaveButton.click();
for (let index = 0; index < 4; index += 1) {
  await new Promise((resolve) => setImmediate(resolve));
}
assert.equal(failureFetchCalls, 2, "保存再試行でAPIをもう一度呼んでください");
assert.equal(failureHarness.document.documentElement.getAttribute("data-quiz-save-state"), "saved");
assert.match(failureHarness.attendanceLink.innerHTML, /保存完了/);

process.stdout.write("quiz save guard validation passed\n");
