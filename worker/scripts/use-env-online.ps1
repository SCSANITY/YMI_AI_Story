param()

$ErrorActionPreference = "Stop"

$workerRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $workerRoot ".env.online"
$target = Join-Path $workerRoot ".env"

if (!(Test-Path $source)) {
  Write-Error "Missing $source"
}

Copy-Item $source $target -Force
Write-Host "[worker-env] switched to online profile -> $target"
