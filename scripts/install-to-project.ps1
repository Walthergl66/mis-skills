$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
npm run install:project -- @args
