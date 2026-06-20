// GLM 额度状态栏 —— 样式预览(实时拉取真实数据 + ANSI 配色)
const TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
const BASE = new URL(process.env.ANTHROPIC_BASE_URL || "https://api.z.ai").origin;

// 颜色
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", gray: "\x1b[90m",
};
const sev = (p) => (p >= 80 ? "red" : p >= 60 ? "yellow" : "green");
const pct = (p, w = 4) => { const c = C[sev(p)]; return `${c}${String(p).padStart(w)}%${C.reset}`; };

const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n));

// 北京时间"当日"
const bj = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// 重置时刻 → 北京时间 HH:MM(跨天前缀"次日")。nextResetTime 为毫秒时间戳;非法/缺失 → null
const fmtReset = (ts) => {
  if (ts == null || ts === "") return null;
  const d = new Date(typeof ts === "string" ? ts.replace(" ", "T") : ts);
  if (isNaN(d.getTime())) return null;
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d) === bj;
  return "↻ " + (sameDay ? hhmm : "次日" + hhmm);
};

async function fetchJSON(path) {
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" } });
  return r.json();
}

// --- 多种样式渲染器 (ctx, s5h, wk, mcpPct, mcpUsed, mcpLimit, model, todayTok) ---
const styles = {
  "样式A · 分段块(推荐)": (d) => {
    const r = fmtReset(d.s5hReset);
    return `${C.cyan}${C.bold}${d.model}${C.reset} ${C.gray}▍${C.reset}ctx ${pct(d.ctx)} ${C.gray}▍${C.reset}5h ${pct(d.s5h)}${r ? ` ${C.gray}${r}${C.reset}` : ""} ${C.gray}▍${C.reset}Wk ${pct(d.wk)} ${C.gray}▍${C.reset}MCP ${pct(d.mcpPct)} ${C.gray}·${C.reset} ${C.blue}今日 ${fmtTok(d.todayTok)}${C.reset}`;
  },

  "样式B · 竖线分隔": (d) =>
    `${C.cyan}${d.model}${C.reset} ${C.gray}│${C.reset} ctx ${pct(d.ctx, 3)} ${C.gray}│${C.reset} 5h ${pct(d.s5h, 3)} ${C.gray}│${C.reset} 周 ${pct(d.wk, 3)} ${C.gray}│${C.reset} MCP ${pct(d.mcpPct, 3)} ${C.gray}│${C.reset} ${C.blue}今日 ${fmtTok(d.todayTok)}${C.reset}`,

  "样式C · 进度条": (d) => {
    const bar = (p) => { const f = Math.round(p / 10); return `${C[sev(p)]}${"█".repeat(f)}${C.gray}${"░".repeat(10 - f)}${C.reset} ${C[sev(p)]}${p}%${C.reset}`; };
    return `${C.cyan}${d.model}${C.reset} ${C.gray}ctx${C.reset} ${bar(d.ctx)}  ${C.gray}5h${C.reset} ${bar(d.s5h)}  ${C.gray}wk${C.reset} ${bar(d.wk)} ${C.blue}·今日 ${fmtTok(d.todayTok)}${C.reset}`;
  },

  "样式D · 极简": (d) =>
    `${C.cyan}${d.model}${C.reset} ${pct(d.ctx, 3)}${C.gray}·${C.reset}${pct(d.s5h, 3)}${C.gray}·${C.reset}${pct(d.wk, 3)}${C.gray}·${C.reset}${pct(d.mcpPct, 3)} ${C.blue}${fmtTok(d.todayTok)}${C.reset}${C.gray}/今日${C.reset}`,

  "样式E · 详细(含调用数/套餐)": (d) =>
    `${C.magenta}GLM ${d.level.toUpperCase()}${C.reset} ${C.gray}│${C.reset} ctx ${pct(d.ctx, 3)} ${C.gray}│${C.reset} 5h ${pct(d.s5h, 3)} ${C.gray}│${C.reset} 周 ${pct(d.wk, 3)} ${C.gray}│${C.reset} MCP ${C.yellow}${d.mcpUsed}/${d.mcpLimit}${C.reset} ${C.gray}│${C.reset} ${C.cyan}${d.model}${C.reset} ${C.blue}今日 ${fmtTok(d.todayTok)}${C.reset}`,
};

(async () => {
  const q = (await fetchJSON("/api/monitor/usage/quota/limit")).data;
  const limits = q.limits;
  const lim5h = limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit === 3);
  const s5h = lim5h?.percentage ?? 0;
  const s5hReset = lim5h?.nextResetTime ?? null;
  const wk = limits.find((l) => l.type === "TOKENS_LIMIT" && l.unit === 6)?.percentage ?? 0;
  const mcp = limits.find((l) => l.type === "TIME_LIMIT");
  const mcpPct = mcp?.percentage ?? 0, mcpUsed = mcp?.currentValue ?? 0, mcpLimit = mcp?.usage ?? 0;
  const level = q.level ?? "?";

  const mu = (await fetchJSON(`/api/monitor/usage/model-usage?startTime=${bj}+00:00:00&endTime=${bj}+23:59:59`)).data;
  const todayTok = mu.totalUsage?.totalTokensUsage ?? 0;

  const data = { model: "GLM-5.2", level, ctx: 42, s5h, s5hReset, wk, mcpPct, mcpUsed, mcpLimit, todayTok };

  console.log(`\n${C.bold}=== GLM 额度状态栏 · 实时样式预览 ===${C.reset}`);
  console.log(`${C.gray}(真实数据: 5h/Wk/MCP/今日 token 来自接口; ctx=42% 为示例,实际取当前对话上下文)${C.reset}\n`);
  for (const [name, fn] of Object.entries(styles)) {
    console.log(`${C.gray}▶ ${name}${C.reset}`);
    console.log(`  ${fn(data)}\n`);
  }

  // 配色状态演示:把数值调高看警告/危险色
  console.log(`${C.bold}=== 配色提醒阈值 (≥60%黄 / ≥80%红) ===${C.reset}`);
  const stress = { ...data, ctx: 87, s5h: 72, wk: 91, mcpPct: 64 };
  console.log(`${C.gray}▶ 样式A · 高占用状态:${C.reset}`);
  console.log(`  ${styles["样式A · 分段块(推荐)"](stress)}\n`);
})();
