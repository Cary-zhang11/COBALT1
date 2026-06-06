#!/bin/bash
# 用法: bash scripts/setup-db.sh "你的postgres密码"
set -e

if [ -z "$1" ]; then
  echo "错误: 请提供 PostgreSQL 密码"
  echo "用法: bash scripts/setup-db.sh \"你的postgres密码\""
  exit 1
fi

PASSWORD="$1"
export PGPASSWORD="$PASSWORD"

echo "创建数据库 skillflow..."
if psql -U postgres -h localhost -c "CREATE DATABASE skillflow;" 2>/dev/null; then
  echo "数据库创建成功"
else
  echo "数据库可能已存在，继续..."
fi

# 更新 .env 中的 DATABASE_URL
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|DATABASE_URL=\"[^\"]*\"|DATABASE_URL=\"postgresql://postgres:${PASSWORD}@localhost:5432/skillflow\"|g" "$ENV_FILE"
  else
    sed -i "s|DATABASE_URL=\"[^\"]*\"|DATABASE_URL=\"postgresql://postgres:${PASSWORD}@localhost:5432/skillflow\"|g" "$ENV_FILE"
  fi
  echo "已更新 .env 中的 DATABASE_URL"
else
  echo "DATABASE_URL=\"postgresql://postgres:${PASSWORD}@localhost:5432/skillflow\"" > "$ENV_FILE"
  echo "已创建 .env 文件"
fi

# 切换到项目根目录
cd "$(dirname "$0")/.."

echo "运行 prisma migrate..."
npx prisma migrate dev --name init

echo "同步内置技能..."
npm run seed

echo "完成！可执行 npm run dev 启动项目。"
