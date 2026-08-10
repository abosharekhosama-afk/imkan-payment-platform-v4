$ErrorActionPreference = 'Stop'
Write-Host "=== Payment Platform V3.2 - Windows setup (no Docker) ===" -ForegroundColor Cyan

function Require-Command($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name was not found. $hint"
  }
}

Require-Command node "Install Node.js 20+ and reopen PowerShell."
Require-Command npm "Install Node.js (npm is included) and reopen PowerShell."

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 20) { throw "Node.js 20+ is required. Current version: $(node -v)" }

$mysql = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysql) {
  $candidates = @(
    "$env:ProgramFiles\MySQL\MySQL Server 8.4\bin\mysql.exe",
    "$env:ProgramFiles\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "$env:ProgramFiles\MariaDB 11.0\bin\mysql.exe",
    "$env:ProgramFiles\MariaDB 11.4\bin\mysql.exe"
  ) | Where-Object { Test-Path $_ }
  if ($candidates.Count -gt 0) { $mysqlExe = $candidates[0] } else {
    throw "MySQL client was not found. Install MySQL Server 8.x and ensure mysql.exe is on PATH."
  }
} else { $mysqlExe = $mysql.Source }

Write-Host "Using MySQL client: $mysqlExe" -ForegroundColor Green

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  (Get-Content .env) -replace '^REDIS_URL=.*$', 'REDIS_URL=' | Set-Content .env
  Write-Host "Created .env with Redis disabled for local Windows mode." -ForegroundColor Green
}

Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Creating local database/user. Enter your MySQL root password when prompted." -ForegroundColor Yellow
& $mysqlExe -u root -p -e "CREATE DATABASE IF NOT EXISTS payment_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'payment'@'localhost' IDENTIFIED BY 'payment'; ALTER USER 'payment'@'localhost' IDENTIFIED BY 'payment'; GRANT ALL PRIVILEGES ON payment_platform.* TO 'payment'@'localhost'; CREATE USER IF NOT EXISTS 'payment'@'127.0.0.1' IDENTIFIED BY 'payment'; ALTER USER 'payment'@'127.0.0.1' IDENTIFIED BY 'payment'; GRANT ALL PRIVILEGES ON payment_platform.* TO 'payment'@'127.0.0.1'; FLUSH PRIVILEGES;"
if ($LASTEXITCODE -ne 0) { throw "Could not configure MySQL. Check the root password and that MySQL Server is running." }

Write-Host "Running database migrations..." -ForegroundColor Yellow
npm run db:migrate
Write-Host "Seeding demo data..." -ForegroundColor Yellow
npm run db:seed

Write-Host ""; Write-Host "Setup complete." -ForegroundColor Green
Write-Host "API: http://localhost:3000"
Write-Host "Web: http://localhost:5173"
Write-Host "Demo login: admin@example.test / ChangeMe!123"
Write-Host "Redis: disabled (not required for this local test mode)"
