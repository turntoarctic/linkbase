#!/usr/bin/env bash
# Linkbase 单机栈控制（用户态 nginx，无需 sudo）
#   bash scripts/stack.sh start|stop|reload|restart|test|status|logs
#
# 只管理 nginx（:30177）；Bun/Hono 后端（:3001）用 `bun --cwd apps/server run start` 单独起。
# 设计：nginx 直接托管前端静态产物并反代 /api、/ws，故后端未启动时前端仍可访问。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$ROOT/deploy/nginx/nginx.conf"
RUN_DIR="$ROOT/.run/nginx"
PID_FILE="$RUN_DIR/nginx.pid"
PORT="${PORT:-30177}"

ensure_dirs() {
  mkdir -p "$RUN_DIR" \
    "$RUN_DIR/client_body" "$RUN_DIR/proxy" \
    "$RUN_DIR/fastcgi" "$RUN_DIR/uwsgi" "$RUN_DIR/scgi"
}

nginx_bin() {
  if command -v nginx >/dev/null 2>&1; then command -v nginx; return; fi
  local p
  for p in /usr/sbin/nginx /usr/local/sbin/nginx /sbin/nginx; do
    [[ -x "$p" ]] && { echo "$p"; return; }
  done
  echo "[stack] nginx 未安装" >&2
  exit 1
}

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

case "${1:-}" in
  start)
    ensure_dirs
    if is_running; then
      echo "[stack] nginx 已在运行 (pid $(cat "$PID_FILE"))"; exit 0
    fi
    "$(nginx_bin)" -c "$CONF" -p "$ROOT/deploy/nginx"
    echo "[stack] nginx 已启动 → http://0.0.0.0:${PORT}（PID $(cat "$PID_FILE")）"
    ;;
  stop)
    if is_running; then
      "$(nginx_bin)" -c "$CONF" -p "$ROOT/deploy/nginx" -s stop
      echo "[stack] nginx 已停止"
    else
      echo "[stack] nginx 未在运行"
    fi
    ;;
  reload)
    is_running || { echo "[stack] nginx 未运行，请先 start" >&2; exit 1; }
    "$(nginx_bin)" -c "$CONF" -p "$ROOT/deploy/nginx" -s reload
    echo "[stack] nginx 已重载"
    ;;
  restart)
    "$0" stop; "$0" start
    ;;
  test)
    ensure_dirs
    "$(nginx_bin)" -t -c "$CONF" -p "$ROOT/deploy/nginx"
    ;;
  status)
    if is_running; then
      echo "[stack] nginx running (pid $(cat "$PID_FILE")) on :${PORT}"
    else
      echo "[stack] nginx stopped"
    fi
    echo "[stack] 后端 :3001 探活："
    curl -s --max-time 3 "http://127.0.0.1:3001/api/health" || echo "  (后端未启动)"
    ;;
  logs)
    tail -n "${2:-100}" -f "$RUN_DIR/access.log" "$RUN_DIR/error.log"
    ;;
  *)
    echo "用法: bash scripts/stack.sh {start|stop|reload|restart|test|status|logs}" >&2
    exit 1
    ;;
esac
