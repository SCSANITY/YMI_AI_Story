# Reader shared-shell local fixture

Development-only entry for WEB-UIUX-001/27. Not imported by an application route.
Run `node dev/reader-shell/serve.mjs` from the repository; open
http://127.0.0.1:43128/reader. The runner bundles `fixture.tsx` with the actual Reader, shared shell and native image leaves;
framework shims supply Link/Image/router and a synthetic signed-in GlobalContext.
It uses the existing global CSS + bundled CSS modules. Serve on loopback only.
The fixture refuses all non-Reader fetch calls. Its payment/release data and
signing tokens are synthetic, with existing public product art for the pages.
No production data, Supabase request, account, payment or Final release is used.

Serve `/storage/v1/object/sign/raw-private/reader-N.webp?token=T` with public art.
Delay token>1 cover responses to inspect decode-before-swap continuity. The
fixture controls expose load states, identity change and a focus event for URL
renewal; a real tab return also goes through the actual Reader listeners.

Capture 1440x1024, 393x852 and 852x393 closed/open/interior/last/closed-again,
plus preparing/loading/error/access states. Verify single controls, native
Final cover contain (no Preview crop/logo), no overflow, focus/keyboard and
vertical scroll, identity/bounds cancellation and bounded image requests.

For negative/loading states, open `?state=service` (or another listed state),
then press Start Reader state. This mounts only after navigation settles, so
the existing initial/silent load fencing is not confused with the chosen state.
