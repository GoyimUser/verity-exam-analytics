# Verity — comprehensive project review

Review date: 2026-11-01; remediation verified 2026-11-02. 34 tracked findings: 34 resolved and verified, 0 open.

## Scope and evidence

Reviewed the backend, schema/write/restore paths, scoring/statistics, Weekly Study, all first-party frontend JavaScript/CSS, localization/calendar, dependency manifests, desktop launcher, packaging/CI, tests and delivery documentation. Vendored ECharts/fonts were checked for local loading and notices, not re-audited internally.

Historical baseline: **50 Python tests and 18 Node tests passed**, with a Starlette/httpx deprecation warning. Those suites did not prove complete UI behavior: Settings failed despite a caught exception and no page-error event. Current verification passes **67 Python tests and 25 Node tests** in a fresh pinned environment without that warning, plus 48 cross-browser configurations and 16 Settings regression configurations.

Evidence artifacts: `backend-before.json`, `desktop-before.json`, UI screenshots and regression scripts. Baseline probes used temporary databases/port 8002. Personal records and release state were not modified. Previous feature reports are historical evidence, not substitutes for current results.

## Correct and functioning parts

### Scoring

The 15/3/4 case gives 8/60 = 13.3333%; full-exam denominator, negative scores, strict counts, saved weights and shared preview/save scorer pass existing regressions.

### Persistence

SQLite transactions, foreign keys, CRUD, shared modes/preferences, partial PATCH preservation and duplicate opt-in pass tests. No personal database was used for review probes.

### Backup/recovery

Integrity/schema/FK/score checks, matching write-time domains, retained recovery copy, rollback, fresh revision tokens and temporary-file cleanup pass tests.

### Statistics

Exam/question/maximum-score weighting, undefined zero-attempt accuracy, sparse-dispersion limits, histogram underflow, repeated-date heatmaps, OLS/trends, simulations and period comparisons pass regressions. R07 separately covers identity collisions.

### Weekly Study

Saturday–Friday normalization, integer minutes, detail-over-aggregate totals, Video subcategories, zero/missing-week distinctions and historical category snapshots pass tests. R01 is a separate stale-version defect.

### Localization

English/Persian resources, RTL/LTR, local Vazirmatn/Manrope, Persian numeric parsing, Jalali picker boundaries and server/browser calendar equivalence have automated coverage; 20,924 calendar comparison dates agree.

### Reports

Study text/CSV/XLSX/PDF and dedicated examination PDF/XLSX/JSON/CSV work in both languages. PDF pages were rendered and inspected; versioned examination CSV round-trips historical scoring and metadata.

### UI foundation

Shared SVG navigation, responsive layouts, chart ARIA/data tables/decal patterns, native modal semantics, focus restoration and reduced-motion support are present. New findings qualify long-label and Settings behavior.

### Desktop boundary

DesktopSession token/cookie/Host/Origin checks and Windows profile locking pass their unit tests. Plain browser-server launch is a different path (R03).

### Syntax

Current baseline: Python compilation and node --check for all first-party static JavaScript pass. No syntax errors found. The Settings problem is runtime logic; the desktop traceback is response decoding/lifecycle logic.

## Categorized findings

Evidence below describes the reproduced pre-fix behavior; each fixed entry includes its current resolution and verification. The catalog tracks known findings, not a guarantee that no other defect exists.

### Data integrity

**R01 · P0 · FIXED — Study revisions can be reused after deletion**

Location: `app/study.py`. Save week revision 1; delete; recreate (revision 1); stale PUT revision 1 overwrites the new 20-minute report with 99 minutes.

Acceptance: Keep non-reusable revision tokens across delete/recreate; reject stale writes/deletes; retain backup compatibility.

Resolution and evidence: Persisted monotonic revision floor survives deletion; restore issues fresh tokens. Regression rejects stale PUT/DELETE after recreate and stale PUT after restore; 56 Python tests pass. Real browser conflict retains the draft and saved data.

**R06 · P1 · FIXED — Restore validation is weaker than normal writes**

Location: `app/storage.py; app/study.py`. Backup preference correct_weight='1e200' restores successfully, then new exam POST returns 422. Study backup validation also omits write-time name/description/order/detail limits.

Acceptance: Use equivalent preference and study-field validation before replacement; invalid backup leaves live data unchanged.

Resolution and evidence: Restore now enforces the normal preference and study metadata domains. Corrupt weight, counter, category order, activity label, revision and control-character backups are rejected without changing live fixtures.

**R11 · P1 · FIXED — Exam edits have no stale-write protection**

Location: `app/storage.py; static/app.js`. Full edit form PATCH contains old fields; storage merges those over the latest record without checking updated_at/revision, so a second editor can overwrite newer metadata.

Acceptance: Add backwards-compatible revision/ETag workflow with stale-edit feedback and retained drafts; verify two-client edits.

Resolution and evidence: Version-4 UUID revision snapshots reject stale PATCH requests with 409; successful edits and restores issue new tokens. Application submits the revision; legacy API clients may omit it. Python two-client/restore regression and browser conflict test confirm saved data and the unsaved draft survive.

### Frontend

**R02 · P1 · FIXED — Settings initialization fails**

Location: `static/app.js`. wire() calls $('[data-mode]').forEach: querySelector returns an element. Real browser shows load-failed toast; mode and language buttons have null handlers.

Acceptance: Bind both mode buttons through querySelectorAll; test actual mode/language/settings interactions in both locales.

Resolution and evidence: Corrected querySelectorAll bindings; Settings/Reports no longer fetch unrelated examination analytics, and Quick rendering only runs on the Quick view. HTML is no-store with content-versioned assets. Settings regression passes 16 empty/populated × locale × theme × viewport configurations, three Quick/Advanced cycles each, real language switches and injected analytics failures; no workspace-load errors. Python verifies asset versions/cache policy.

**R08 · P1 · FIXED — Exam deletion failures are unhandled**

Location: `static/app.js`. The async detail-delete click handler has no catch or pending-state guard. A rejected DELETE escapes the UI error flow.

Acceptance: Guard repeated deletion, show localized failure, retain dialog and record on failure, and test offline/404 paths.

Resolution and evidence: Guarded async deletion disables repeat submission, catches failure, retains the dialog and restores the button. Node failure/concurrent-click regression passes.

**R09 · P1 · FIXED — Unsaved exam drafts are lost on navigation and display changes**

Location: `static/app.js`. Quick form values live only in DOM; load() replaces #app after theme/language/navigation. No capture or discard confirmation exists. Study navigation retains its draft, but reload/tab close does not.

Acceptance: Retain exam drafts across intentional UI refreshes or ask before discard; protect dirty page departure for both modules.

Resolution and evidence: Dirty exam forms ask before closing, navigation or display changes; cancelled confirmation retains input. beforeunload protects both exam and study drafts. Node confirmation tests and real browser edit/Quick theme/reload flows pass.

### Local security

**R03 · P1 · FIXED — Browser-server launch accepts foreign Host and Origin writes**

Location: `app/main.py; app/validation.py`. Disposable TestClient POST with unrelated Host/Origin returns 201. DesktopSession has protection, but plain uvicorn app does not.

Acceptance: Reject non-loopback hosts and cross-origin requests before processing bodies; preserve desktop and local CLI access.

Resolution and evidence: Trusted loopback Host middleware plus same-origin and cross-site-write rejection run before body processing. Tests cover rejected foreign/null origins and hosts, accepted same-origin writes and local IPv4/IPv6 reads; source desktop smoke passes.

### Reports

**R04 · P1 · FIXED — Exam exports ignore active filters**

Location: `app/main.py; app/storage.py; static/app.js`. /api/exams?from_date=2026-10-01 returns 1 fixture; /api/export/json with same query returns 2. UI links omit all filters while report copy claims shared scope.

Acceptance: Apply validated date/subject/search scope to JSON and CSV and include it in UI links; test matching counts and invalid ranges.

Resolution and evidence: JSON/CSV endpoints and UI links share validated date, subject and search scope. API regression verifies counts/content and invalid dates; actual filtered browser downloads match displayed exam records.

**R05 · P1 · FIXED — Exam CSV emits spreadsheet formulas**

Location: `app/storage.py`. A title '=1+1' exports as an executable formula cell. Study CSV already neutralizes formula-like text.

Acceptance: Use a shared spreadsheet-safe text helper; preserve numeric negative scores; test all text columns and both languages.

Resolution and evidence: Exam and study exports reuse export_utils.safe_cell. Formula-like text is neutralized while numeric negative scores remain numeric; English/Persian CSV regression passes.

**R13 · P2 · FIXED — Dedicated examination PDF report is absent**

Location: `static/app.js`. Exam Print invokes window.print() on report-control cards; no prepared examination analytics report. Weekly Study PDFs are implemented and separate.

Acceptance: Generate localized scoped exam reports with metadata, summaries and charts; visually verify English and Persian PDFs.

Resolution and evidence: Prepared scoped English/Persian exam PDF includes summary, chronological chart, embedded local font and full metadata. Actual browser downloads and frozen export tests pass. Rendered three-page documents were visually checked; Persian chart dates and percent formatting corrected.

**R14 · P2 · FIXED — Examination Excel export is absent**

Location: `app/main.py; static/app.js`. Only exam JSON/CSV endpoints exist. Weekly Study Excel export is implemented.

Acceptance: Add scoped exam XLSX with numeric values, summaries, localized labels and formula-safe text.

Resolution and evidence: Scoped XLSX contains numeric scores, full metadata, localized sheets/headings, summary and chart; text cells are formula-safe. Python opens and asserts workbook values/scope; browser and frozen downloads pass.

### Statistics

**R07 · P1 · FIXED — Real subject names collide with missing-value placeholders**

Location: `app/analytics.py; app/statistics_extra.py; static/locale.js`. One unassigned exam and one explicitly named 'Unassigned' are merged into one subject with count 2. Topic groups also concatenate names using an ambiguous ' / ' separator.

Acceptance: Group by structured identities, represent missing labels separately, and test placeholder/delimiter collisions without mistranslating user labels.

Resolution and evidence: Missing subjects use null identity; topics use structured tuple keys. Four distinct placeholder/delimiter cases remain four groups in subject, topic and heatmap output. Presentation no longer translates real user labels named Unassigned.

**R33 · P1 · FIXED — Timeline tooltip fails when actual-result series is hidden**

Location: `static/app.js`. The formatter reads date/title from the first visible series datum. Moving-average data is numeric; hiding actual results produces undefined dates (or an empty tooltip for zero).

Acceptance: Use timeline identity by dataIndex and format each visible series; test moving-average-only and zero values.

Resolution and evidence: Tooltip resolves examination identity by timeline dataIndex and lists visible series values. Node regression covers moving-average-only legend state and zero values.

### Desktop

**R10 · P1 · FIXED — Desktop smoke test fails on valid 204; error logging then fails**

Location: `desktop.py`. Actual source desktop smoke exits 1: JSONDecodeError decoding empty DELETE response, then FileNotFoundError reopening a log inside the deleted temporary profile.

Acceptance: Handle empty/204 responses, detach closed logging handlers, and run source smoke successfully without logging errors.

Resolution and evidence: Empty response bodies bypass JSON decoding; the file logging handler is detached before closing. Actual source smoke returns ok:true for assets, scoring, CRUD and analytics (desktop-after.json). Frozen study/PDF verification remains R27.

### Study analytics

**R12 · P2 · FIXED — Duplicate category labels share an ECharts legend identity**

Location: `static/study.js`. Category names are editable and need not be unique; stacked series use name for ECharts legend selection, so identically named categories cannot be independently toggled.

Acceptance: Give duplicate display names distinct, understandable legend labels and test independent visibility in each locale.

Resolution and evidence: Duplicate chart labels include localized group and category identity. Node tests and actual ECharts legendUnSelect interactions in English/Persian confirm each duplicate category toggles independently.

### Interchange

**R15 · P2 · FIXED — CSV import and complete exam CSV round-trip are absent**

Location: `app/storage.py; app/main.py`. Import accepts JSON only; exam CSV omits weights, start/end times and timestamps.

Acceptance: Define a versioned CSV schema, validate preview/commit atomically, preserve historical scoring configuration.

Resolution and evidence: Version-1 CSV carries saved weights, tags, timing and timestamps, accepts English/Persian export headings and reversibly escapes formula-like text. Import uses existing atomic validation/preview pipeline. Round-trip, invalid-row rollback and snapshot preservation tests pass.

**R31 · P2 · FIXED — JSON import ignores declared schema version**

Location: `app/storage.py`. import_json validates exams shape but never payload.version; unsupported future versions are accepted and unknown fields ignored.

Acceptance: Accept documented legacy/current formats; reject unsupported declared versions before preview or writes.

Resolution and evidence: Declared JSON schema versions must be integer 1; unsupported versions fail before preview or mutation. Versionless legacy payload remains supported. Regression passes.

### Exam metadata

**R16 · P2 · FIXED — Start/end times cannot be entered or derived in UI**

Location: `static/app.js; app/storage.py`. Storage validates HH:MM but forms omit start/end controls; automatic duration and overnight policy are not implemented.

Acceptance: Expose timing controls, define overnight behavior, retain explicit duration, and test consistent edits.

Resolution and evidence: Advanced entry exposes start/end times; explicit duration takes precedence, otherwise duration derives with an earlier end treated as next day and equal times as zero. Python tests and browser 23:45–00:30 save assert 45 minutes.

**R17 · P2 · FIXED — Subject/topic management is missing**

Location: `app/main.py; static/app.js`. Lookup creation and subject listing exist, but no inspect/rename/unused-cleanup UI or API.

Acceptance: Implement referenced-safe management; preserve exam associations and prevent accidental cascades.

Resolution and evidence: Settings manages subjects/topics through referenced-safe APIs. Renames preserve identity and invalidate affected exam revisions; only unused records can be removed, with no cascades. Python relation/deletion tests and real browser rename workflow pass.

### Scoring

**R18 · P2 · FIXED — Configurable unanswered weight is missing**

Location: `app/scoring.py; app/storage.py; static/app.js`. Unanswered questions always contribute zero; no per-exam unanswered-weight snapshot or setting exists.

Acceptance: Add validated migration and central scorer support; keep historical zero-weight results unchanged.

Resolution and evidence: Version-4 migration adds zero-default saved unanswered weight without changing old results. Settings/new records and central preview/save/simulation calculations use the snapshot. Python verifies bounds, saved scores, changed defaults and hypothetical gains; browser saves negative unanswered points correctly.

### Comparisons

**R19 · P2 · FIXED — Selected-exam comparison is missing**

Location: `static/intelligence.js`. Selected-period comparison exists, but there is no selection of individual exams/attempts for side-by-side comparison.

Acceptance: Add selectable records/attempt comparison using saved scoring configurations.

Resolution and evidence: History selects 2–6 attempts for side-by-side comparison of saved results, question counts and all marking weights. Selection persists across pages. Browser verifies two selected records and complete dialog columns; accessibility audit passes.

### Exam details

**R20 · P2 · FIXED — Detail dialog omits stored metadata**

Location: `static/app.js`. Current dialog shows date, subject, result, raw/max, correct/incorrect and notes; total/unanswered, topic, tags, attempt, timing, weights and timestamps are absent.

Acceptance: Show all stored fields accessibly with localized labels, optional-field empty states and mobile layout.

Resolution and evidence: Detail dialog includes total/unanswered, topic/type, tags, attempt, timing, all weights and timestamps with localized labels and bidirectional isolation. Browser asserts all 14 supplemental metadata fields, responsive dialog behavior and safe edit navigation.

### Visual quality

**R21 · P3 · FIXED — Long study category names break page width**

Location: `static/study.css`. Valid 100-character name produced document width 1461 at viewport 929; mobile also overflows.

Acceptance: Constrain grid children and wrap user labels in entry, category manager, report and statistics; test 390/768/1440 in both languages.

Resolution and evidence: Constrained grid children and enabled wrapping for user category labels. Fresh browser matrix checks 100-character English/Persian names in entries, management, statistics and saved report dialogs at 390/768/1440 pixels in both themes; representative screenshots visually inspected.

**R22 · P3 · FIXED — Exam detail close icon differs from the icon system**

Location: `static/app.js`. showDetails renders a literal multiplication sign while other dialogs use the shared SVG close icon.

Acceptance: Use the same SVG and localized accessible name; verify focus and hit target.

Resolution and evidence: Detail close uses the shared SVG icon with existing localized accessible name. Browser confirms SVG presence; keyboard regression verifies Escape and focus restoration in 12 configurations.

### Performance

**R23 · P3 · FIXED — All-history reads and per-record queries remain unbounded**

Location: `app/storage.py; app/study.py; static/app.js`. Exam list loads tags once per exam; study list issues multiple queries per week; frontend fetches all exams plus analytics for most views.

Acceptance: Measure realistic large fixtures, batch related reads, paginate history and keep summary calculations independent of page size.

Resolution and evidence: Exam tags are batched (two SELECTs per page); study entries/details are batched (three SELECTs for all weeks). History uses 50-row pages while metrics use all filtered records; invalid page offsets reset after filtering/deletion. Benchmark: 10,000 exams/1,000 weeks, page ~0.009s, study reads ~0.009s, full analytics ~0.383s on this host. Query-count regression and populated/empty browser pagination checks pass.

### Dependencies

**R24 · P3 · FIXED — No coherent clean-environment lock; TestClient deprecation remains**

Location: `requirements.txt; requirements-dev.txt; requirements-windows.txt`. 50 tests pass with Starlette/httpx deprecation. Runtime ranges and Windows pins differ; clean install not verified this review.

Acceptance: Test a fresh environment, choose compatible test client dependencies and record/pin the verified set.

Resolution and evidence: Fresh Python 3.12 environment installed exact manifests plus transitive Windows constraints; compatible httpx2 removes the old TestClient warning. pip check and all 67 Python tests pass. npm lock pins browser/lint tooling. Installation mirror workaround and platform scope are recorded in current validation.

### Maintainability

**R25 · P3 · FIXED — Dense source and duplicated translation assignments obscure defects**

Location: `static/app.js; static/study.js; static/styles.css`. Large functions are single lines; translation keys are overwritten later; the Settings selector error passed syntax/unit checks.

Acceptance: Format and modularize incrementally, centralize resources, add linting and behavior-level regressions.

Resolution and evidence: Formatted all first-party JavaScript/CSS, consolidated translations into one resource, extracted workflow helpers and added ESLint/Prettier checks. Both locales have matching nonempty keys. All 25 Node tests, lint and real Settings/control regressions pass.

### Test coverage

**R26 · P3 · FIXED — CI omits study Node tests, calendar drift and browser workflows**

Location: `.github/workflows/windows-release.yml`. Workflow invokes only three old Node suites; no browser or study-PDF verification step. Existing unit suite did not exercise Settings binding.

Acceptance: Run all Node suites, calendar checks and isolated browser workflows; assert control behavior, not just absence of console errors.

Resolution and evidence: Windows workflow now includes all five Node suites, lint, calendar drift, isolated three-browser/Settings workflows and rendered exam/study PDF checks before frozen build. These commands pass locally; no remote CI dispatch or publication is claimed.

### Verification gap

**R27 · P2 · FIXED — Packaged Weekly Study/PDF behavior is unverified**

Location: `packaging/verity.spec; scripts/build_windows.py`. Build smoke checks exam paths only; no current frozen binary with study exports and Playwright driver was tested. This is an unverified boundary, not a proven packaging failure.

Acceptance: When release work resumes, build in clean Windows environment and verify native UI, study persistence, downloads and PDF browser discovery.

Resolution and evidence: Built frozen Windows executable from the fresh pinned environment with bundled Playwright driver. HTTP smoke passes study persistence plus English/Persian exam/study PDF/XLSX downloads using installed Edge. Native WebView2 tests pass RTL/font/chart/report behavior; a second run sees the saved 210-minute record. Local verification only; GitHub publication remains paused.

**R32 · P3 · FIXED — Formal accessibility and cross-browser coverage remains incomplete**

Location: `tests/; static/`. Existing checks cover Chromium DOM/keyboard semantics and screenshots; no screen-reader audit, Firefox/WebKit run or automated contrast baseline.

Acceptance: Add targeted assistive-technology/cross-browser/contrast coverage and record concrete failures separately from untested areas.

Resolution and evidence: Targeted accessibility/contrast and accessibility-tree coverage added across 48 Edge/Chromium, Firefox and WebKit configurations. Dashboard, Settings, Study and comparison dialog have zero axe WCAG A/AA violations in that matrix. Fixed muted/negative light-theme contrast; checked keyboard dialogs and named controls. Human NVDA/JAWS certification is outside these automated checks and is not claimed.

### Documentation

**R28 · P3 · FIXED — TODO and delivery docs contain stale/conflicting claims**

Location: `TODO.md; outputs/TODO.md; README.md; WINDOWS.md; RELEASE_NOTES.md`. Checked items retain defect text; latest counts say 35 while baseline is 50; Windows docs imply a published download; README calls editable facts immutable and suggests SQLite-to-PostgreSQL is a URL change.

Acceptance: Publish one canonical current checklist, archive old reports, distinguish exam/study reports and pending Windows release, remove architecture overclaims.

Resolution and evidence: Archived prior checklists/review; root TODO.md is canonical and outputs/TODO.md points to it. Current report distinguishes fixes, missing features and verification gaps. README/Windows/release notes now identify unpublished release state, editable exam facts, actual PostgreSQL migration effort and exam-versus-study reporting scope.

### Database architecture

**R29 · P2 · FIXED — Legacy exam constraints/migration pipeline need strengthening**

Location: `app/storage.py`. Exam schema does not enforce integer SQLite storage types, weight/duration domains or derived-score invariants directly; initialize inserts v1/v2 markers and executes CREATE statements. Supported writes are validated.

Acceptance: Introduce forward migrations with preflight validation and rollback tests; do not silently rewrite saved scores. Direct SQL is outside normal supported writes.

Resolution and evidence: Transactional version-4 migration preflights historical domains, adds scoring snapshot/revision fields and installs SQLite insert/update guards without recalculating saved scores. Regression injects a DDL failure and confirms rollback of columns/version marker; direct inconsistent scores/counts/durations are rejected. Legacy backup/migration tests pass.

### Diagnostics

**R30 · P2 · FIXED — Study PDF masks every failure as a missing browser**

Location: `app/study_api.py`. Any exception, including font/rendering/data errors, becomes studyPdfUnavailable with an install-browser instruction.

Acceptance: Distinguish browser installation errors from unexpected generation failures; log diagnostics and show appropriate bilingual feedback.

Resolution and evidence: Shared PDF renderer classifies absent-browser launch separately (503/setup message). Unexpected rendering failures return localized reportFailed (500) and log diagnostics. Injected missing-browser/render-fault tests pass for both study and exam exports; real PDFs generate in source and frozen builds.

### Localization

**R34 · P2 · FIXED — Mixed-direction chart-data labels reorder date components**

Location: `static/ux.js:chartDescription`. Current English heatmap data-table screenshot shows a Persian subject adjacent to the Gregorian day reordered (4 before the subject, followed by Sept 2026). The label concatenates subject, date and sample count into one unisolated text run.

Acceptance: Isolate subject/date/count components in accessible chart rows and tooltips; verify mixed Persian/Latin labels in LTR and RTL without reversing date tokens.

Resolution and evidence: Accessible chart rows isolate subject/date/count with FSI/PDI and tooltips use bdi; saved labels remain unchanged. Node tests assert individual isolation, bilingual browser rendering passes, and mixed-script screenshots/PDFs were inspected.

## Repair order and verification

All catalogued work is resolved. The final batch adds draft and stale-edit protection, complete reports/interchange, metadata management, historical scoring snapshots, comparisons, transactional database guards, bounded history views, diagnostics and repeatable quality tooling. The reported Settings loading failure has dedicated empty/populated history and mode/language-switch regression coverage.

After each fix, add a regression that fails on the observed defect. Run the appropriate existing suites and actual browser workflows; verify actual handlers, saved records and downloads rather than treating an empty console as success.

Current results and per-item test evidence are in [validation.md](remediation-2026-11-02/validation.md). Chromium/Edge, Firefox and WebKit were exercised; fresh Windows dependency installation and frozen/native builds passed. Accessibility coverage includes keyboard flows, automated contrast/rules and accessibility-tree inspection, not an end-to-end human NVDA/JAWS certification. GitHub CI/publication was not dispatched; the workflow commands were verified locally.

## References

Local-host protection follows the purpose described by [Starlette middleware documentation](https://starlette.dev/middleware/). Spreadsheet text handling addresses [OWASP CSV injection](https://github.com/OWASP/www-project-web-security-testing-guide/blob/master/latest/4-Web_Application_Security_Testing/07-Injection/21-CSV_Injection.md). These references guide the fixes; concrete findings above come from this project’s source and reproductions.
