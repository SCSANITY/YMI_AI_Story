param()

$ErrorActionPreference = "Stop"

$workerRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $workerRoot ".env"
$callbackUrl = "http://localhost:3000/api/internal/worker-callback"

if (!(Test-Path $envFile)) {
  Write-Error "Missing $envFile"
}

$content = Get-Content $envFile -Raw
$updated = $content -replace '(?m)^WORKER_CALLBACK_URL=.*$', ("WORKER_CALLBACK_URL={0}" -f $callbackUrl)

if ($updated -eq $content) {
  $updated = $content.TrimEnd() + ("`r`nWORKER_CALLBACK_URL={0}`r`n" -f $callbackUrl)
}

Set-Content -Path $envFile -Value $updated -Encoding UTF8
Write-Host "[worker-env] callback set to $callbackUrl"
