$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '../..')
if (-not (Test-Path .env)) { throw 'Missing .env. Run .\scripts\windows\setup.ps1 first.' }
Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File',"$PWD\scripts\windows\start-api.ps1"
Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File',"$PWD\scripts\windows\start-web.ps1"
Write-Host 'API and Web development servers started in separate PowerShell windows.' -ForegroundColor Green
