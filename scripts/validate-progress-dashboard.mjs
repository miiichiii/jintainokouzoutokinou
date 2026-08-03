#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(scriptDir, "..", "index.html"), "utf8");

const requiredMarkers = [
  'id="welcome-cleared-stat"',
  'aria-controls="welcome-quiz-progress"',
  'id="welcome-quiz-progress"',
  "確認テスト別の統計",
  "第1〜9回について、LINEに保存されている最高点・挑戦回数・直近結果を表示します。",
  "function buildConfirmationTestProgressRows(data)",
  "function renderConfirmationTestProgress(data)",
  "function installQuizProgressToggle()",
  'id="welcome-chart-select"',
  'aria-label="正答率の推移を表示する確認テスト"',
];
const missingMarkers = requiredMarkers.filter((marker) => !source.includes(marker));
assert.deepEqual(missingMarkers, [], `進捗ダッシュボードの要素が不足しています: ${missingMarkers.join(", ")}`);

assert.equal(
  (source.match(/\/quiz_api\/progress/g) || []).length,
  1,
  "確認テスト別統計のために進捗APIの呼び出しを増やさないでください"
);

const helperStart = source.indexOf("function getConfirmationTestLessons");
const helperEnd = source.indexOf("function renderConfirmationTestProgress", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "確認テスト別統計の集計関数を抽出できません");
const helperSource = source.slice(helperStart, helperEnd);
const lessons = Array.from({ length: 11 }, (_, index) => ({
  no: index + 1,
  title: `テスト${index + 1}`,
  href: `${index + 1}.html`,
}));
const { buildConfirmationTestProgressRows } = new Function(
  "lessons",
  `${helperSource}; return { buildConfirmationTestProgressRows };`
)(lessons);

const rows = buildConfirmationTestProgressRows({
  cleared_quiz_numbers: [1],
  perfect_quiz_numbers: [1],
  quiz_progress: [
    {
      quiz_no: 1,
      attempt_count: 2,
      best_score: 10,
      best_total_questions: 10,
      best_percentage: 100,
      latest_score: 9,
      latest_total_questions: 10,
      latest_percentage: 90,
      latest_submitted_at: "2026-08-02T03:00:00+00:00",
      passed: true,
    },
    {
      quiz_no: 2,
      attempt_count: 1,
      best_score: 9,
      best_total_questions: 10,
      best_percentage: 90,
      latest_score: 9,
      latest_total_questions: 10,
      latest_percentage: 90,
      latest_submitted_at: "2026-08-02T03:00:00+00:00",
      passed: false,
    },
    {
      quiz_no: 10,
      attempt_count: 1,
      best_percentage: 100,
      passed: true,
    },
  ],
});

assert.equal(rows.length, 9, "総合練習・弱点練習を確認テスト別統計に含めないでください");
assert.equal(rows[0].status.label, "満点クリア");
assert.equal(rows[0].attemptCount, 2);
assert.equal(rows[1].status.label, "未クリア", "得点率だけでクリア判定しないでください");
assert.equal(rows[2].status.label, "未挑戦");

const toggleStart = source.indexOf("function setQuizProgressOpen");
const toggleEnd = source.indexOf("function renderLessonCards", toggleStart);
assert.ok(toggleStart >= 0 && toggleEnd > toggleStart, "統計パネルの開閉処理を抽出できません");
const toggleSource = source.slice(toggleStart, toggleEnd);
assert.equal(toggleSource.includes("fetch("), false, "統計パネルのクリック時に通信しないでください");

const toggleHarness = new Function(
  `
    let quizProgressOpen = false;
    let clickHandler = null;
    const welcomeQuizProgress = { style: { display: "none" } };
    const welcomeClearedHint = { textContent: "確認テスト別の統計を表示" };
    const welcomeClearedStat = {
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, handler) { if (name === "click") clickHandler = handler; }
    };
    ${toggleSource}
    installQuizProgressToggle();
    return {
      click() { clickHandler(); },
      snapshot() {
        return {
          display: welcomeQuizProgress.style.display,
          expanded: welcomeClearedStat.attributes["aria-expanded"],
          hint: welcomeClearedHint.textContent
        };
      }
    };
  `
)();

toggleHarness.click();
assert.deepEqual(toggleHarness.snapshot(), {
  display: "block",
  expanded: "true",
  hint: "確認テスト別の統計を隠す",
});
toggleHarness.click();
assert.deepEqual(toggleHarness.snapshot(), {
  display: "none",
  expanded: "false",
  hint: "確認テスト別の統計を表示",
});

process.stdout.write("progress dashboard validation passed\n");
