#!/usr/bin/env bash
# Linkbase PostgreSQL 初始化（幂等；需要 postgres 超级用户 = sudo）
#   bash scripts/setup-db.sh
# 可用环境变量覆盖：DB_NAME DB_USER DB_PASSWORD DB_HOST DB_PORT
#
# 做三件事：1) 建/改角色并设密码；2) 建库并授权；3) 建 pg_trgm 扩展（迁移 0000 依赖）。
# 完成后打印可直接写入 .env 的 DATABASE_URL。
set -euo pipefail

DB_NAME="${DB_NAME:-linkbase}"
DB_USER="${DB_USER:-linkbase}"
DB_PASSWORD="${DB_PASSWORD:-linkbase}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"

if ! command -v sudo >/dev/null 2>&1; then
  echo "[db] 缺少 sudo；请手动以 postgres 超级用户执行下方 SQL" >&2
  exit 1
fi

echo "[db] 1/3 角色 ${DB_USER}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

echo "[db] 2/3 数据库 ${DB_NAME}"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
else
  sudo -u postgres psql -q -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};"
fi

echo "[db] 3/3 扩展与授权"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "${DB_NAME}" <<SQL
CREATE EXTENSION IF NOT EXISTS pg_trgm;
GRANT ALL ON SCHEMA public TO ${DB_USER};
SQL

echo
echo "[db] 完成。请把下面一行写入仓库根 .env："
echo "DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
