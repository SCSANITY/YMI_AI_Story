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
- `SignatureVoiceDemo`: approved static template with simulated word timings.
  The three `audioSrc: null` entries intentionally have no audio request. Replace
  audio and word timings together when approved recordings arrive; no generation
  or microphone access is part of this module.
- `EditionCards`: independent gallery selection per edition, shared price authority.
  `edition-definitions.ts` is the shared gallery/copy/icon authority;
  `EditionPrice` preserves Catalog prices and the Admin display-percent override.
  Preview details may append `EDITION_COMPARISON_IMAGE`; C stays five frames.
  Visible galleries loop their five images every four seconds. Offscreen cards,
  background tabs and reduced-motion preferences pause autoplay; desktop hover
  and keyboard focus pause that card. Manual selection restarts the interval.
- `ProductEnding`: cached Home `after_in_discount` banner and existing Footer.
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
