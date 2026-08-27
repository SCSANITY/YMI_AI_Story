# V2 Story Authoring Workflow

This workflow prepares reviewable V2 story packages for T3-022 and the later
T3-023 controlled rollout. It is a local authoring tool, not a runtime parser.

## Boundary

- Authoring may parse the approved `_L/_R/_A/_B` file convention to produce
  explicit `presentation` metadata and `enable_face_swap` values.
- Worker, Preview, Admin, PDF, and Reader continue to use only the explicit
  metadata written into `config.json`.
- The tool never writes into a source story folder and never uploads to Storage.
- The default command is dry-run only. A review directory requires both
  `--write` and an explicit `--out` outside the source story directory.
- JSON Creator's export contract is unchanged. Every configured image, including
  no-subtitle pages, must have one entry with an explicit `texts` array.

## Staging Layout

Use a dedicated staging directory containing only the V2 page assets:

```text
staging/
  preview0_A.webp
  preview1_L_A.webp
  preview1_R_B.webp
  final/
    page0_L_B.png
    page0_R_A.png
    page01_L_A.png
    page01_R_B.png
    ...
```

Preview assets must be WebP. Final assets must be PNG. Images must be at least
512 px per edge and square within the same 2% tolerance used by the customer PDF
composer. Preview and Final spread numbers must each be contiguous and every
spread must contain exactly one left and one right page.

The `_A/_B` marker is converted to `enable_face_swap: true/false` only here.
Cover rules are fixed: `preview0_A.webp`, `final/page0_L_B.png`, and
`final/page0_R_A.png`.

## Commands

Validate local staged bytes, including real image format, dimensions, size, and
SHA-256:

```powershell
npm run v2:author -- --story-dir ..\Template_folder\Adventure_story --assets-dir D:\staging\Adventure_story
```

An exported inventory can be used when the bytes are not on this machine. It
must be an array, or an object with an `assets` array. Each entry requires
`path`, `format`, `width`, and `height`; `size` and `sha256` are retained when
provided:

```powershell
npm run v2:author -- --story-dir ..\Template_folder\Adventure_story --inventory D:\inventory\Adventure_story.json
```

After the dry run passes, create an isolated review package:

```powershell
npm run v2:author -- --story-dir ..\Template_folder\Adventure_story --assets-dir D:\staging\Adventure_story --write --out D:\review\Adventure_story-v2
```

The output contains `config.json`, every configured subtitle-template variant at
its existing relative path, and `authoring-report.json`. Existing output
directories are never replaced; choose a new review path instead.

## Validation

The tool checks:

- strict filename convention, format, dimensions, unique paths, contiguous
  spreads, complete pairs, cover identities, and dynamic page totals;
- exact subtitle coverage for the fallback template and every configured age
  variant, including dimensions, explicit empty `texts` arrays, and declared
  placeholders;
- a usable configured font directory;
- preservation of top-level provider/workflow/subtitle configuration and mapped
  Preview page prompt overrides from the source config;
- final acceptance by the active Worker's
  `validateSinglePageTemplateContract`, for every subtitle variant.

Passing this tool does not authorize upload or activation. T3-023 still requires
owner review, exact Storage upload, Worker drain/restart, public config hash
verification, Mock smoke, and a per-story rollback record.
