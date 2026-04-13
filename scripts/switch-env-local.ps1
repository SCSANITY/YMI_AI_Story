param()

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot ".env.localhost"
$target = Join-Path $projectRoot ".env.local"

if (!(Test-Path $source)) {
  Write-Error "Missing $source. Create it first by copying a known-good localhost env."
}

Copy-Item $source $target -Force
Write-Host "[env] switched to localhost profile -> $target"
