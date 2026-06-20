#!/usr/bin/env bash
# 把 GLM 额度状态栏写入 Claude Code 的 settings.json(statusLine)。
# 用法:
#   ./install.sh              安装(已存在 statusLine 时报错)
#   ./install.sh --force      强制覆盖(旧值备份到 settings.json.glm-backup)
#   ./install.sh uninstall    卸载(恢复备份或移除 statusLine)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTINGS="${CLAUDE_SETTINGS:-$HOME/.claude/settings.json}"
BACKUP="${SETTINGS}.glm-backup"
CMD="node \"${SCRIPT_DIR}/glm-status.mjs\""

patch_settings() {
  # $1 = action  $2 = force flag(install 时)
  node -e '
    const fs = require("fs");
    const osPath = require("path");
    const file = process.argv[1];
    const action = process.argv[2];
    const cmd = process.argv[3];
    const backup = process.argv[4];
    const force = process.argv[5] === "1";

    const read = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
    const write = (cfg) => fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");

    if (action === "install") {
      const cfg = read();
      if (cfg.statusLine && !force) {
        console.error("✗ 已存在 statusLine,加 --force 覆盖(旧值会备份)");
        process.exit(1);
      }
      if (cfg.statusLine) fs.writeFileSync(backup, JSON.stringify(cfg.statusLine, null, 2));
      cfg.statusLine = { type: "command", command: cmd, padding: 0 };
      fs.mkdirSync(osPath.dirname(file), { recursive: true });
      write(cfg);
      console.log("✓ 已写入 statusLine → " + file);
      console.log("  command: " + cmd);
      console.log("  (重启或新开 Claude Code 会话即可在底部看到)");
    } else if (action === "uninstall") {
      const cfg = read();
      if (fs.existsSync(backup)) {
        cfg.statusLine = JSON.parse(fs.readFileSync(backup, "utf8"));
        fs.unlinkSync(backup);
        write(cfg);
        console.log("✓ 已从备份恢复 statusLine → " + file);
      } else if (cfg.statusLine) {
        delete cfg.statusLine;
        write(cfg);
        console.log("✓ 已移除 statusLine → " + file);
      } else {
        console.log("• 无 statusLine,无需操作");
      }
    }
  ' "$SETTINGS" "$1" "$CMD" "$BACKUP" "$2"
}

case "${1:-install}" in
  install)        patch_settings "install" "${2:-}" ;;
  --force|force)  patch_settings "install" "1" ;;
  uninstall)      patch_settings "uninstall" "" ;;
  *) echo "用法: $0 [install [--force] | uninstall]"; exit 1 ;;
esac
