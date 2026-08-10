$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '../..')
if (-not (Test-Path .env)) { throw 'Missing .env. Run .\scripts\windows\setup.ps1 first.' }
npm run dev:api
