#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(scriptDir, "..", "index.html");
const source = fs.readFileSync(indexPath, "utf8");

const requiredMarkers = [
  "function getHomeworkUnavailablePresentation(status, data = {})",
  "if (status === 401)",
  "if (status === 404)",
  "if (status === 422)",
  "if (status === 503)",
  "8桁の学籍番号と学科の登録が必要です。",
  "renderHomeworkUnavailable(getHomeworkUnavailablePresentation(unavailableStatus, data))",
];
const missingMarkers = requiredMarkers.filter((marker) => !source.includes(marker));
if (missingMarkers.length) {
  throw new Error(`宿題エラー表示の分岐が不足しています: ${missingMarkers.join(", ")}`);
}

const homeworkCardStart = source.indexOf('<section id="homework-status"');
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
  summaryPart: "提出済み・未提出は表示していません",
});
await verifyUnavailableCase({ fetchError: true, expectedBadge: "通信エラー", summaryPart: "通信環境" });

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
