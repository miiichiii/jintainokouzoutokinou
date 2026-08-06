#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(scriptDir, "..", "index.html");
const source = fs.readFileSync(indexPath, "utf8");

const examScheduleMarkers = [
  'class="exam-schedule-notice"',
  "試験日程",
  "機能領域",
  "8月10日（月）1限、9:00～10:30",
  "構造領域",
  "8月10日（月）4限、14:50～16:20",
  'datetime="2026-08-10T09:00:00+09:00"',
  'datetime="2026-08-10T14:50:00+09:00"',
];
const missingExamScheduleMarkers = examScheduleMarkers.filter((marker) => !source.includes(marker));
if (missingExamScheduleMarkers.length) {
  throw new Error(`試験日程表示が不足しています: ${missingExamScheduleMarkers.join(", ")}`);
}
const examScheduleStart = source.indexOf('<section class="exam-schedule-notice"');
const confirmationNoticeStart = source.indexOf('<section class="confirmation-test-notice"');
if (examScheduleStart < 0 || confirmationNoticeStart < 0 || examScheduleStart > confirmationNoticeStart) {
  throw new Error("試験日程は確認テストのお知らせより上に表示してください");
}

const confirmationTestNotice =
  "先ほどの確認テストに関する連絡について、システム上の表示に一部不整合がある可能性が判明しました。クイズTOPで第1〜9回がすべて「クリア済み」と表示されている方は、対応不要です。未クリア表示の方についても現在記録を確認しています。皆さんに不利益が生じないよう対応しますので、現時点では再受験する必要はありません。";
if ((source.match(new RegExp(confirmationTestNotice, "g")) || []).length !== 1) {
  throw new Error("確認テストに関するお知らせが正しい文面で1件表示されていません");
}
const noticeStart = source.indexOf('<section class="confirmation-test-notice"');
const homeworkCardStart = source.indexOf('<section id="homework-status"');
if (noticeStart < 0 || noticeStart > homeworkCardStart) {
  throw new Error("確認テストに関するお知らせを宿題提出状況より前に表示してください");
}

const requiredMarkers = [
  "function getHomeworkUnavailablePresentation(status, data = {})",
  "if (status === 401)",
  "if (status === 404)",
  "if (status === 422)",
  "if (status === 503)",
  "8桁の学籍番号と学科の登録が必要です。",
  "宿題の提出記録",
  "提出を確認済み",
  "システムで確認できない回",
  '"全回確認済み"',
  "`システムで未確認 ${missingCount}回`",
  "Googleフォームと確認済みのメール提出を集計し",
  "メール提出は順次確認して反映するため、送信済みの場合は表示と行き違うことがあります。",
  "renderHomeworkUnavailable(getHomeworkUnavailablePresentation(unavailableStatus, data))",
];
const missingMarkers = requiredMarkers.filter((marker) => !source.includes(marker));
if (missingMarkers.length) {
  throw new Error(`宿題エラー表示の分岐が不足しています: ${missingMarkers.join(", ")}`);
}

const homeworkCardEnd = source.indexOf('</section>', homeworkCardStart);
if (homeworkCardStart < 0 || homeworkCardEnd < 0) {
  throw new Error("宿題提出状況カードを確認できません");
}
const homeworkCardSource = source.slice(homeworkCardStart, homeworkCardEnd);
const requiredDeadlineMarkers = [
  'class="homework-status-deadline"',
  'datetime="2026-08-15"',
  "8月15日まで",
];
const missingDeadlineMarkers = requiredDeadlineMarkers.filter(
  (marker) => !homeworkCardSource.includes(marker)
);
if (missingDeadlineMarkers.length) {
  throw new Error(`宿題の提出期限表示が不足しています: ${missingDeadlineMarkers.join(", ")}`);
}

const unsafeAbsoluteStatusMarkers = [
  '<span>提出済み</span>',
  '<span>未提出</span>',
  '"すべて提出済み"',
  "`未提出 ${missingCount}回`",
];
const presentUnsafeMarkers = unsafeAbsoluteStatusMarkers.filter((marker) => source.includes(marker));
if (presentUnsafeMarkers.length) {
  throw new Error(`フォーム以外の提出を断定する表示が残っています: ${presentUnsafeMarkers.join(", ")}`);
}

const presentationStart = source.indexOf("function getHomeworkUnavailablePresentation");
const presentationEnd = source.indexOf("function renderHomeworkUnavailable", presentationStart);
const presentationSource = source.slice(presentationStart, presentationEnd);
const getPresentation = new Function(
  `${presentationSource}; return getHomeworkUnavailablePresentation;`
)();
const expectedBadges = new Map([
  [401, "LINEログインを確認"],
  [404, "学生情報未登録"],
  [422, "登録情報を確認"],
  [500, "一時的なエラー"],
  [503, "一時的に確認できません"],
  [0, "通信エラー"],
]);
for (const [status, expectedBadge] of expectedBadges) {
  const actualBadge = getPresentation(status).badge;
  if (actualBadge !== expectedBadge) {
    throw new Error(`HTTP ${status}: badge=${actualBadge} expected=${expectedBadge}`);
  }
}
if (getPresentation(503, { stale: true }).badge !== "最新情報を確認できません") {
  throw new Error("stale時は最新情報を確認できないことを明示してください");
}
if (!getPresentation(422).summary.includes("8桁の学籍番号と学科")) {
  throw new Error("422時に登録不足の理由が表示されません");
}

const loaderReferenceCount = (source.match(/\bloadHomeworkProgress\s*\(/g) || []).length;
if (loaderReferenceCount !== 2) {
  throw new Error(`宿題取得は関数定義とLIFF起動時の1回だけにしてください: ${loaderReferenceCount}`);
}
if (/(?:setInterval|setTimeout)\s*\(\s*loadHomeworkProgress\b/.test(source)) {
  throw new Error("宿題取得をタイマーから呼び出さないでください");
}

const renderStart = presentationEnd;
const renderEnd = source.indexOf("function renderHomeworkProgress", renderStart);
const renderSource = source.slice(renderStart, renderEnd);
const loaderStart = source.indexOf("async function loadHomeworkProgress");
const loaderEnd = [
  source.indexOf("function restoreLiffStateIfNeeded", loaderStart),
  source.indexOf("async function initIndexLiff", loaderStart),
].filter((index) => index > loaderStart).sort((a, b) => a - b)[0];
if (renderEnd < 0 || loaderStart < 0 || loaderEnd < 0) {
  throw new Error("宿題表示関数を抽出できません");
}
const loaderSource = source.slice(loaderStart, loaderEnd);
const makeHarness = new Function(
  "apiBaseUrl",
  "fetchImpl",
  "nodes",
  "renderProgressSpy",
  `
    const fetch = fetchImpl;
    const console = { error: () => {} };
    const homeworkStatus = nodes.homeworkStatus;
    const homeworkStatusTitle = nodes.homeworkStatusTitle;
    const homeworkStatusBadge = nodes.homeworkStatusBadge;
    const homeworkStatusSummary = nodes.homeworkStatusSummary;
    const homeworkStatusBreakdown = nodes.homeworkStatusBreakdown;
    const renderHomeworkProgress = renderProgressSpy;
    ${presentationSource}
    ${renderSource}
    ${loaderSource}
    return { loadHomeworkProgress };
  `
);

function createNodes() {
  const classes = new Set(["is-loading", "is-complete", "is-missing"]);
  return {
    classes,
    homeworkStatus: {
      classList: {
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        add: (...names) => names.forEach((name) => classes.add(name)),
      },
    },
    homeworkStatusTitle: { textContent: "" },
    homeworkStatusBadge: { textContent: "" },
    homeworkStatusSummary: { textContent: "" },
    homeworkStatusBreakdown: { style: { display: "grid" } },
  };
}

async function verifyUnavailableCase({ status = 0, data = {}, fetchError = false, expectedBadge, summaryPart }) {
  const nodes = createNodes();
  let fetchCalls = 0;
  let progressCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    if (fetchError) throw new TypeError("network unavailable");
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
    };
  };
  const harness = makeHarness(
    "https://line-anatomy-bot.onrender.com",
    fetchImpl,
    nodes,
    () => { progressCalls += 1; }
  );
  await harness.loadHomeworkProgress("valid-token");
  if (fetchCalls !== 1 || progressCalls !== 0) {
    throw new Error(`HTTP ${status}: fetch=${fetchCalls} progress=${progressCalls}`);
  }
  if (nodes.homeworkStatusBadge.textContent !== expectedBadge) {
    throw new Error(`HTTP ${status}: badge=${nodes.homeworkStatusBadge.textContent} expected=${expectedBadge}`);
  }
  if (!nodes.homeworkStatusSummary.textContent.includes(summaryPart)) {
    throw new Error(`HTTP ${status}: summary=${nodes.homeworkStatusSummary.textContent}`);
  }
  if (nodes.homeworkStatusBreakdown.style.display !== "none" || !nodes.classes.has("is-unavailable")) {
    throw new Error(`HTTP ${status}: unavailable表示で内訳が隠れていません`);
  }
}

await verifyUnavailableCase({ status: 401, expectedBadge: "LINEログインを確認", summaryPart: "LINEから" });
await verifyUnavailableCase({ status: 404, expectedBadge: "学生情報未登録", summaryPart: "学生情報" });
await verifyUnavailableCase({ status: 422, expectedBadge: "登録情報を確認", summaryPart: "8桁の学籍番号と学科" });
await verifyUnavailableCase({ status: 500, expectedBadge: "一時的なエラー", summaryPart: "一時的なエラー" });
await verifyUnavailableCase({ status: 503, expectedBadge: "一時的に確認できません", summaryPart: "現在取得できません" });
await verifyUnavailableCase({
  status: 503,
  data: { stale: true },
  expectedBadge: "最新情報を確認できません",
  summaryPart: "確認済み・未確認の回は表示していません",
});
await verifyUnavailableCase({ fetchError: true, expectedBadge: "通信エラー", summaryPart: "通信環境" });

const progressRenderStart = source.indexOf("function renderHomeworkProgress");
const progressRenderEnd = source.indexOf("async function loadHomeworkProgress", progressRenderStart);
if (progressRenderStart < 0 || progressRenderEnd < 0) {
  throw new Error("宿題の提出記録表示関数を抽出できません");
}
const progressRenderSource = source.slice(progressRenderStart, progressRenderEnd);
const makeProgressHarness = new Function(
  "nodes",
  `
    const homeworkStatus = nodes.homeworkStatus;
    const homeworkStatusTitle = nodes.homeworkStatusTitle;
    const homeworkStatusBadge = nodes.homeworkStatusBadge;
    const homeworkStatusSummary = nodes.homeworkStatusSummary;
    const homeworkStatusBreakdown = nodes.homeworkStatusBreakdown;
    const homeworkSubmittedLabels = nodes.homeworkSubmittedLabels;
    const homeworkMissingLabels = nodes.homeworkMissingLabels;
    const formatHomeworkLabels = (labels, count) => {
      const normalized = Array.isArray(labels)
        ? labels.map((label) => String(label || "").trim()).filter(Boolean)
        : [];
      return normalized.length > 0 ? normalized.join("・") : (count === 0 ? "なし" : String(count) + "回");
    };
    ${progressRenderSource}
    return { renderHomeworkProgress };
  `
);

function verifyProgressCase({ data, expectedBadge, expectedClass }) {
  const nodes = createNodes();
  nodes.homeworkSubmittedLabels = { textContent: "" };
  nodes.homeworkMissingLabels = { textContent: "" };
  const { renderHomeworkProgress } = makeProgressHarness(nodes);
  renderHomeworkProgress(data);
  const expectedTitle = `${data.subject_label}（提出記録）`;
  if (nodes.homeworkStatusTitle.textContent !== expectedTitle) {
    throw new Error(`回答記録のタイトルが不正です: ${nodes.homeworkStatusTitle.textContent}`);
  }
  if (nodes.homeworkStatusBadge.textContent !== expectedBadge) {
    throw new Error(`回答記録のbadgeが不正です: ${nodes.homeworkStatusBadge.textContent}`);
  }
  const summary = nodes.homeworkStatusSummary.textContent;
  if (
    !summary.includes(`全${data.total_count}回のうち${data.submitted_count}回を確認`) ||
    !summary.includes("Googleフォームと確認済みのメール提出を集計し") ||
    !summary.includes("メール提出は順次確認して反映するため、送信済みの場合は表示と行き違うことがあります。")
  ) {
    throw new Error(`回答記録の注意書きが不正です: ${summary}`);
  }
  if (!nodes.classes.has(expectedClass) || nodes.homeworkStatusBreakdown.style.display !== "grid") {
    throw new Error(`回答記録の表示状態が不正です: ${Array.from(nodes.classes).join(",")}`);
  }
}

verifyProgressCase({
  data: {
    total_count: 5,
    submitted_count: 4,
    missing_count: 1,
    is_complete: false,
    subject_label: "人体の構造と機能",
    submitted_labels: ["第1回", "第2回", "第3回", "第4回"],
    missing_labels: ["第5回"],
  },
  expectedBadge: "システムで未確認 1回",
  expectedClass: "is-missing",
});
verifyProgressCase({
  data: {
    total_count: 5,
    submitted_count: 5,
    missing_count: 0,
    is_complete: true,
    subject_label: "人体の構造と機能",
    submitted_labels: ["第1回", "第2回", "第3回", "第4回", "第5回"],
    missing_labels: [],
  },
  expectedBadge: "全回確認済み",
  expectedClass: "is-complete",
});

const inlineScripts = Array.from(
  source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi),
  (match) => match[1]
).filter((code) => code.trim());
inlineScripts.forEach((code, index) => {
  try {
    new Function(code);
  } catch (error) {
    throw new Error(`inline script ${index + 1}: ${error.message}`);
  }
});

process.stdout.write(`OK: ${inlineScripts.length}個のinline scriptと宿題エラー表示を確認しました。\n`);
