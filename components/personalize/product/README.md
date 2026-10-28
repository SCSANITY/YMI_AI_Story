# Shared Customize product sections

Frozen source: `Template_folder/Design/WEB-UIUX-001/06/v1` (owner-approved).
These are shared sections for every story, mounted only on the INTRO step.
Pricing uses the current story's existing `BookPackagePricing` and display currency;
there is no separate price configuration or purchase path here.

- `ProductSections`: independent lower-page surface, near-viewport chunk mounting.
- `ProductSectionBoundary`: contains pending imports locally, both around the
  extension root and inside each reserved section slot. A late chunk must not
  replace the entire Customize page with its route-level loading fallback.
- `HowItWorks`: one five-step dataset; wide cycling pauses offscreen/hidden and
  under reduced motion; portrait activation follows the visible step.
- `SignatureVoiceDemo`: frozen WEB-UIUX-001/26/v1 static Cici open book with baked
  text; no read-along. Shared `components/book/book-material.ts` supplies Preview
  and B's complete page shadows/rim/head. CSS alone chooses the three B layouts.
  Mom/Dad/Kid use one preload-none audio element, initially without src. Playback
  starts in the click handler; rAF commits only changed seconds/bar counts.
  Volume opens a four-second explanatory tip. Offscreen/hidden/unmount stops.
  `voice-demo-data.ts` is static metadata, not a runtime fetch. The waiting-page
  silent demo has separate data, preserving its prior behavior. No microphone,
  generation or backend request is part of this module.
- `EditionCards`: independent gallery selection per edition, shared price authority.
  `edition-definitions.ts` is the shared gallery/copy/icon authority;
  `EditionPrice` preserves Catalog prices and the Admin display-percent override.
  Preview details may append `EDITION_COMPARISON_IMAGE`; C stays five frames.
  Visible galleries loop their five images every four seconds. Manual thumbnail
  selection holds that card for ten seconds, restarting on each selection. A
  single local timeout schedules both cards; no polling or backend request.
  Clicking the main image lazily mounts `EditionImageViewer`: both background
  galleries pause, the viewer shows only the clicked image with a close button
  (no navigation or counter), and closing retains it with a fresh ten-second hold.
  Viewer image resources load only
  for its current image; no preload of another full-size gallery. The portal
  reuses the existing close/Escape/focus/scroll restoration pattern, with safe
  margins and viewport-bounded image sizing. The square gallery image itself is
  the dialog box, capped at 880px, with no panel or header. Close overlays its
  corner with a 44px target; compact layouts preserve safe-area margins.
  No dependencies or gestures library.
  Offscreen cards,
  background tabs and reduced-motion preferences pause autoplay; desktop hover
  and keyboard focus pause that card.
- `ProductEnding`: cached Home `after_in_discount` banner and existing Footer.
- `EditionComparison`: static native feature table between C and ProductEnding,
  frozen `Template_folder/Design/WEB-UIUX-001/24/v1`. Its independent reserved
  near-viewport slot uses the existing boundary/mount mechanism. Compact CSS
  applies at <=767px; the later short-landscape override wins when both match.
  Two semantic row groups and hidden inclusion labels carry the content; the
  Voice pillar is decorative. No request, timer, animation or purchase control.
- All start buttons call the parent's existing INTRO-to-PHOTO handler.

Assets under `/customize-product/v1/` are public, versioned demo assets, served
with a one-year immutable cache header. Publish replacement bytes at a new URL
(for example `/customize-product/v2/`), never overwrite a cached v1 URL.
WEB-UIUX-001/17 uses v2 only for the replaced Voice image05 and the new
Preview-only comparison image. The other nine gallery images retain v1 URLs.
Images use responsive lazy loading; no video, customer media or additional
backend service is introduced. The banner promise reuses the existing cache and
does not delay the first screen. Actual conversion/checkout logic is unchanged.

Local fixture: `/personalize/design-preview` in development only; `?baseline=1`
omits the new sections for first-screen comparison. Production returns not-found.
The fixture uses synthetic prices and the same presentation components. It does
not verify live catalog values, authentication, payment or generation.

WEB-UIUX-001/26 publishes the four pre-sized baked-text pages, board texture and
three unchanged MP3s under `/customize-product/v3/`, also immutable for one year.
The existing `/customize-product/v1/b-play-button.png` is reused byte-for-byte;
there is no duplicate button under v3. CSS and data are B-scoped; dusk/dawn and
other sections retain their prior shared heading and transition styles.
