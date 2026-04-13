param()

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot ".env.vercel.development"
$target = Join-Path $projectRoot ".env.local"

if (!(Test-Path $source)) {
  Write-Host "[env] missing local Vercel snapshot, pulling from Vercel..."
  Push-Location $projectRoot
  try {
    npx vercel env pull .env.vercel.development --environment=development --yes | Out-Null
  } finally {
    Pop-Location
  }
}

if (!(Test-Path $source)) {
  Write-Error "Failed to generate $source from Vercel."
}

Copy-Item $source $target -Force
Write-Host "[env] switched to vercel-development profile -> $target"
