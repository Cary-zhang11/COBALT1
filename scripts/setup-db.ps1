# 用法: .\scripts\setup-db.ps1 -Password "你的postgres密码"
param(
  [Parameter(Mandatory = $true)]
  [string]$Password
)

$ErrorActionPreference = "Stop"
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
$env:PGPASSWORD = $Password

Write-Host "创建数据库 skillflow..."
& $psql -U postgres -h localhost -c "CREATE DATABASE skillflow;" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "数据库可能已存在，继续..."
}

$env:DATABASE_URL = "postgresql://postgres:${Password}@localhost:5432/skillflow"

# 写回 .env 中的 DATABASE_URL
$envFile = Join-Path $PSScriptRoot "..\.env"
$content = Get-Content $envFile -Raw
$content = $content -replace 'DATABASE_URL="[^"]*"', "DATABASE_URL=`"postgresql://postgres:${Password}@localhost:5432/skillflow`""
Set-Content $envFile $content -NoNewline
Write-Host "已更新 .env 中的 DATABASE_URL"

Push-Location (Join-Path $PSScriptRoot "..")
Write-Host "运行 prisma migrate..."
npx prisma migrate dev --name init
Write-Host "同步内置技能..."
npm run seed
Pop-Location

Write-Host "完成！可执行 npm run dev 启动项目。"
