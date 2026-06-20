# GLM Coding Plan 额度状态栏

在 Claude Code 底部状态栏实时显示 GLM Coding Plan 的额度使用情况。零依赖,单文件 Node 脚本。适用环境为MacOS

```
GLM-5.2 ▍ctx 42% ▍5h 28% ▍Wk 46% ▍MCP 1% · 今日 10.7M
```

## 显示内容

| 段 | 含义 | 数据来源 |
|---|---|---|
| **ctx** | 当前对话上下文窗口占用 % | Claude Code stdin(`context_window`)÷ 模型窗口 |
| **5h** | 5 小时滚动会话额度 % | `/api/monitor/usage/quota/limit` |
| **Wk** | 7 天周额度 % | 同上 |
| **MCP** | MCP/联网工具(search-prime·web-reader·zread)月额度 % | 同上 |
| **今日** | 当前模型当日(北京时间)token 消耗 | `/api/monitor/usage/model-usage` |

百分比配色:<60% 绿 · 60–80% 黄 · ≥80% 红。

## 安装

```bash
./install.sh            # 写入 ~/.claude/settings.json 的 statusLine
```

重启或新开一个 Claude Code 会话,底部即可看到。已存在 statusLine 时加 `--force` 覆盖(旧值备份到 `settings.json.glm-backup`)。

> 鉴权与地址自动取自环境:`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` 的 origin(如 `https://api.z.ai`)。

## 卸载

```bash
./install.sh uninstall   # 恢复备份,或移除 statusLine
```

## 预览样式

```bash
node preview.mjs        # 用真实额度数据渲染几种样式
```

## 配置

脚本读取 Claude Code 注入的环境变量,无需额外配置。可选项:

- **`NO_COLOR=1`** — 关闭 ANSI 配色,输出纯文本。
- **`GLM_STATUS_DEBUG=1`** — 把 Claude Code 实际传入的 stdin 落盘到 `~/.cache/glm-status/stdin-debug.json`(用于排查 ctx 不显示等问题)。

模型上下文窗口(token)默认表:

```
GLM-5.2 = 1,000,000   GLM-5.1 / GLM-5 / GLM-5-TURBO / GLM-4.7 = 200,000   GLM-4.5-AIR = 128,000
```

> GLM-5.1 / GLM-5 的窗口暂按 200K 兜底;如需修改,编辑 `glm-status.mjs` 顶部的 `WINDOW` 表。

## 缓存

额度与模型用量结果缓存到 `~/.cache/glm-status/`(额度 >30% 时 2 分钟、≤30% 时 30 秒;ctx 走 stdin 实时无网络)。接口失败时回退到上次缓存;全失败时该段显示 `--`,状态栏不会报错。

## 排错

- **整行不出现 / 报错**:确认 `node --version` ≥ 18;`echo $ANTHROPIC_AUTH_TOKEN` 有值。
- **ctx 段不显示**:Claude Code 未传 `context_window`,或当前模型不在窗口表。开 `GLM_STATUS_DEBUG=1` 后查看 `~/.cache/glm-status/stdin-debug.json` 确认字段。
- **显示 `auth missing`**:`ANTHROPIC_AUTH_TOKEN` 未注入(settings.json 的 `env` 里有即可)。
- **数据不更新**:删 `~/.cache/glm-status/*.json` 强制刷新。

## 文件

- `glm-status.mjs` — 主脚本(零依赖)
- `install.sh` — 安装/卸载
- `preview.mjs` — 样式预览
- `docs/superpowers/specs/` — 设计文档

参考实现:[deluo/glm-quota-line](https://github.com/deluo/glm-quota-line)。
