# OAuth Return UI Recovery

This document describes the client-side login-state recovery used by the
customer login modal and the Admin login page. It does not change
authentication, session, or role authority.

## Problem boundary

Starting Google OAuth locks the login controls while the browser leaves for
the provider. If the user cancels and returns through browser history, the
original document may be restored from the back/forward cache with its React
state intact. Without an explicit return handler, the interface can remain in
`Redirecting to Google...` even though no redirect is still in progress.

## Runtime contract

- Each login surface records OAuth in flight synchronously before calling
  Supabase Auth.
- `pagehide` or a transition to `hidden` records that the document actually
  left while OAuth was pending.
- A subsequent `pageshow`, `focus`, or transition back to `visible` releases
  only that OAuth UI lock and explains that social sign-in was not completed.
- A normal initial page show cannot trigger recovery, and a request that
  already failed cannot be revived by a later lifecycle event.
- Returned and thrown Supabase OAuth errors also release the lock.

Password login, Supabase session exchange, Admin role checks, and protected
layouts keep their existing authority. The recovery path creates no user,
session, login bypass, or authentication result.

## Verification

- `npm run auth:tests` exercises the lifecycle and source contracts.
- `npm run test:contracts` keeps the customer password-recovery and Admin
  authentication boundaries pinned.
- `npm run admin:contracts` covers the protected Admin login and layout.

