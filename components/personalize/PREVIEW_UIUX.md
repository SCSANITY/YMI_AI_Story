# Preview presentation

`PersonalizePage` keeps the existing job controller, signed-image decoding,
purchase configuration, consent, dedication and Voice writers. The presentation
is split into:

- `PreviewStepLayout`: CSS-responsive book/panel layout and the phone status/CTA slots.
- `PreviewBookShell` + `usePreviewBookNavigation`: one physical cover/spread model.
  A turn captures its absolute target and identity; reset/unmount cancels its
  completion. Resizing is immediate; user open/close uses 1.1 seconds and inner
  turns use 0.8 seconds. Reduced motion commits immediately.
- `PreviewWaitingPages` + `usePreviewWaitingState`: the existing 40-second estimate,
  three eight-second steps, 15-second interaction hold and hidden-tab pause.
  Demo assets come from `product/voice-demo-data`; there is no new audio service.
- `PreviewYourBookPanel` + `PreviewPurchaseActions`: controlled edition selection,
  fixed message row, reserved feedback and one shared acknowledgement authority
  for panel and phone Purchase. Purchase still needs the decoded cover and the
  existing durable purchase identity. Edition selection can precede that identity.
- `EditionDetailsDialog` / `PreviewMessageEditor`: body portals with scroll lock,
  focus return, keyboard containment and Escape. The gallery and prices use the
  same definitions and pricing model as Customize C; comparison is the last image.
- `PreviewPhotoVersions`: the server group's original plus three changes. The
  server remains the cap authority; refresh reads existing versions without a
  generation request. Owned thumbnail signing returns URLs and asset ids only.

Version selection first re-reads the target's signed result, then saves the
current edition/voice and effective message through their existing guarded
writers. Selection and its Creation/Job URL commit only after those saves succeed.
Before any save, an owned Creation GET reads `loadCreationPhotoLockState`;any
cart attachment or non-unpurchased state refuses the switch. An undecided source
message carries nothing and preserves the target text. Explicit skipped still carries empty.
These separate writers are not a cross-route transaction. A locked target is
reported while keeping the current selection. The same confirmed Voice asset is
reused; new Voice capture still uses the existing explicit-consent flow.

The image content component retains the cover crop, paired first-spread decode,
locked-page masking, anti-save behavior and signed-URL error recovery. Its old
controls are disabled only inside the new shell, which owns the visible controls.

## Local verification

Run `node tests/preview-uiux-local.mjs` from the repository. The printed loopback
URL renders the actual `PersonalizePage` and components with synthetic owned
responses and artwork. It reads no credentials, rejects external requests and
never reaches a provider. Output and evidence live in ignored `tmp/preview-uiux-local`.

Optional fixture query parameters:

- `state=waiting|queue|error|partial|unavailable` (default ready).
- `edition=voice`, `voice=1`, `name=Sonia`, `cap=1`, `locked=1`.
  `locked=1` models an unpaid in-cart original with the same edition/voice but a
  different message;switching to it must keep the current version and issue no POST.
- `fresh=1` without Creation/Job query ids starts the real Customize flow with
  synthetic prepared materials. Its mocked create request waits for **Release
  identity**, allowing selection before ids; this is not a real generation.

The fixture's **Ready** control delays its synthetic response by one second and
records pre/post slot geometry and CLS. The debug request trace makes GET-only
restoration and selected-identity purchase arguments inspectable. Test at
1440×1024, 393×852 and 852×393. Real device/catalog acceptance is separate from
this offline fixture.

Focused runtime tests cover actual navigation/queue callbacks, waiting timers,
cancelled completions, cap UI, owned photo signing, guarded carry-over and Catalog
price/currency updates. Existing backend retry/ownership tests remain unchanged
in their runtime assertions.
