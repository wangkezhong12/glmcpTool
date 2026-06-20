#!/usr/bin/env node
// GLM Coding Plan 额度状态栏 —— 样式 A
// 零依赖 Node ESM。Claude Code statusLine 通过 stdin 传入 JSON,本脚本输出一行。
//
// 段: ctx(上下文占比) · 5h(5小时额度 + 重置时刻) · Wk(周额度) · MCP(月额度) · 今日(当前模型当日 token)

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

const NO_COLOR = !!process.env.NO_COLOR;
const TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || "";
const ORIGIN = (() => {
  try { return new URL(process.env.ANTHROPIC_BASE_URL || "https://api.z.ai").origin; }
  catch { return "https://api.z.ai"; }
})();

// ---- ANSI ----
const R = "\x1b[0m";
const paint = (code, t) => (NO_COLOR ? String(t) : `${code}${t}${R}`);
const CYAN = "\x1b[36m", BOLD = "\x1b[1m", GRAY = "\x1b[90m", BLUE = "\x1b[34m";
const GREEN = "\x1b[32m", YELLOW = "\x1b[33m", RED = "\x1b[31m";
const sevCode = (p) => (p >= 80 ? RED : p >= 60 ? YELLOW : GREEN);
const pct = (p) => paint(sevCode(p), `${String(p ?? 0).padStart(3)}%`);
const seg = () => paint(GRAY, "▍");

const fmtTok = (n) =>
  n == null ? "--" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);

// 重置时刻 → 北京时间 HH:MM(跨天则前缀 "次日")。nextResetTime 为毫秒时间戳;非法/缺失 → null(该段隐藏)
const fmtReset = (ts) => {
  if (ts == null || ts === "") return null;
  const d = new Date(typeof ts === "string" ? ts.replace(" ", "T") : ts);
  if (isNaN(d.getTime())) return null;
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d) === todayBJ();
  return "↻ " + (sameDay ? hhmm : "次日" + hhmm);
};

// ---- 模型窗口表(token) ----
const norm = (s) => (s || "").toUpperCase().replace(/\[[^\]]*\]$/, "").trim();
const WINDOW = {
  "GLM-5.2": 1_000_000, "GLM-5.1": 200_000, "GLM-5": 200_000,
  "GLM-5-TURBO": 200_000, "GLM-4.7": 200_000, "GLM-4.5-AIR": 128_000,
};
const winFor = (id) => WINDOW[norm(id)] ?? null;

// ---- stdin ----
function readStdin() {
  return new Promise((resolve) => {
    let d = "";
    if (process.stdin.isTTY) return resolve(null);
    process.stdin.setEncoding("utf8");
    const done = () => resolve(d || null);
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", done);
    setTimeout(done, 800); // 兜底,防止无输入时挂起
  });
}

// ---- 北京时间当日 YYYY-MM-DD ----
const todayBJ = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// ---- 网络 + 缓存 ----
const CACHE_DIR = path.join(os.homedir(), ".cache", "glm-status");
const FETCH_TIMEOUT_MS = 5000;

async function fetchJSON(p) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(ORIGIN + p, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// producer 返回 { data, ttl }。缓存命中且未过 TTL 时直接用缓存。
async function cached(file, producer) {
  const f = path.join(CACHE_DIR, file);
  try {
    const j = JSON.parse(await fs.readFile(f, "utf8"));
    if (j && typeof j === "object" && Date.now() - j.ts < (j.ttl ?? 120000)) return j.data;
  } catch {}
  try {
    const { data, ttl = 120000 } = await producer();
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(f, JSON.stringify({ ts: Date.now(), ttl, data }));
    return data;
  } catch (e) {
    // 网络失败:回退到过期缓存(若有)
    try { return (JSON.parse(await fs.readFile(f, "utf8"))).data; } catch { throw e; }
  }
}

async function getQuota() {
  return cached("quota.json", async () => {
    const body = await fetchJSON("/api/monitor/usage/quota/limit");
    const limits = body?.data?.limits || [];
    const tok = (unit) => limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit === unit);
    const lim5h = tok(3), limWk = tok(6);
    const mcp = limits.find((l) => l.type === "TIME_LIMIT");
    const s5h = lim5h?.percentage ?? null, wk = limWk?.percentage ?? null;
    const low = [s5h, wk].some((p) => p != null && p <= 30); // 额度低时缩短刷新间隔
    return {
      data: { s5h, s5hReset: lim5h?.nextResetTime ?? null, wk, mcpPct: mcp?.percentage ?? null, level: body?.data?.level ?? null },
      ttl: low ? 30000 : 120000,
    };
  });
}

async function getModelToday(currentModel) {
  const d = todayBJ();
  return cached(`model-usage-${d}.json`, async () => ({
    data: await fetchJSON(`/api/monitor/usage/model-usage?startTime=${d}+00:00:00&endTime=${d}+23:59:59`),
    ttl: 120000,
  })).then((body) => {
    const sum = body?.data?.modelSummaryList || [];
    const total = body?.data?.totalUsage?.totalTokensUsage ?? null;
    if (!currentModel) return total;
    const nm = norm(currentModel);
    const hit = sum.find((m) => norm(m.modelName) === nm) ||
                sum.find((m) => norm(m.modelName).includes(nm) || nm.includes(norm(m.modelName)));
    return hit ? hit.totalTokens : (sum.length === 1 ? sum[0].totalTokens : total);
  });
}

// ---- ctx ----
function calcCtx(input, modelId) {
  const cu = input?.context_window?.current_usage;
  if (!cu || !modelId) return null;
  const used = (cu.input_tokens || 0) + (cu.cache_read_input_tokens || 0) + (cu.cache_creation_input_tokens || 0);
  const win = winFor(modelId);
  if (!used || !win) return null;
  return Math.min(100, Math.max(0, Math.round((used / win) * 100)));
}

// ---- 渲染(样式 A) ----
function render({ model, ctx, s5h, s5hReset, wk, mcpPct, todayTok }) {
  const parts = [];
  if (model) parts.push(paint(CYAN + BOLD, model));
  const s = seg();
  const push = (label, val) => { if (val == null) return; parts.push(`${s}${label} ${pct(val)}`); };
  push("ctx", ctx);
  if (s5h != null) { // 5h 段:占比 + 重置时刻(重置时刻属于本窗口,内联展示而非独立分段)
    const r = fmtReset(s5hReset);
    parts.push(r ? `${s}5h ${pct(s5h)} ${paint(GRAY, r)}` : `${s}5h ${pct(s5h)}`);
  }
  push("Wk", wk);
  push("MCP", mcpPct);
  parts.push(`${paint(GRAY, "·")} ${paint(BLUE, `今日 ${fmtTok(todayTok)}`)}`);
  return parts.join(" ");
}

(async () => {
  if (!TOKEN) { process.stdout.write("GLM | auth missing"); return; }

  const raw = await readStdin();
  if (process.env.GLM_STATUS_DEBUG === "1" && raw) {
    try { await fs.mkdir(CACHE_DIR, { recursive: true }); await fs.writeFile(path.join(CACHE_DIR, "stdin-debug.json"), raw); } catch {}
  }
  let input = null;
  try { input = raw ? JSON.parse(raw) : null; } catch {}

  const modelId = input?.model?.id || input?.model?.display_name || null;
  const ctx = calcCtx(input, modelId);

  let q = { s5h: null, s5hReset: null, wk: null, mcpPct: null };
  let todayTok = null;
  const [qr, tr] = await Promise.allSettled([getQuota(), getModelToday(modelId)]); // 并行,最坏 ~5s
  if (qr.status === "fulfilled") q = qr.value;
  if (tr.status === "fulfilled") todayTok = tr.value;

  process.stdout.write(render({ model: modelId, ctx, s5h: q.s5h, s5hReset: q.s5hReset, wk: q.wk, mcpPct: q.mcpPct, todayTok }));
})();
