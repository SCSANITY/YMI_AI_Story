# Environment Switch Quick Guide

## Web (`ymi-books-web-1.0`)

- Switch to localhost profile:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\switch-env-local.ps1
```

- Switch to Vercel development profile:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\switch-env-vercel-dev.ps1
```

## Worker (`worker`)

- Force callback URL to localhost:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\set-callback-local.ps1
```

- Force callback URL to online domain:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\set-callback-online.ps1
```

- Use full localhost env profile (`.env.localhost` -> `.env`):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\use-env-localhost.ps1
```

- Use full online env profile (`.env.online` -> `.env`):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\use-env-online.ps1
```
