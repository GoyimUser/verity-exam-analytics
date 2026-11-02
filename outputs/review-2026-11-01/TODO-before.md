# Verity — Review and remediation checklist

Reviewed: 2026-10-30. Scope: all application source, schema, dependency files, existing tests, and selected running browser flows.
This is a living engineering checklist, not a certification that every possible defect has been found.

## How to use this file

- [x] means implemented and supported by the evidence stated.
- [ ] means open, partially implemented, or awaiting the stated verification.
- P0: data loss/recovery. P1: incorrect results, failed workflows, unsafe input. P2: missing requirements/localization. P3: polish, accessibility, maintainability.
- Work in priority order. Add a regression for data integrity or mathematical fixes; inspect UI fixes in the browser.
- Tests must use a temporary database. Never put demonstration or QA records in personal analytics.
- Completed batches are recorded below; unchecked items remain required work.

## P0 — Data integrity and recovery

- [x] DATA-01: Preserve omitted fields on PATCH in the storage layer.
  Evidence: API regression updates only correct answers and verifies subject, topic, tags, notes, start/end times, duration and scoring weights survive. This also protects Quick edits independently of frontend field selection.
- [x] DATA-02: Preserve original marking weights in Quick edit and preview.
  Evidence: browser edited a rich record from 44% to 49% under +5/-2 weights; saved metadata survived and preview showed 49/100 after correction.
- [x] DATA-03: Validate a restore completely before replacing the live database.
  Evidence: storage.restore checks only two table names. A database missing preferences/tags/columns can replace a working database.
  Done when: read-only integrity_check, foreign_key_check, supported schema/version/column validation and score invariants pass; malformed/incomplete backups leave live data unchanged in tests.
- [x] DATA-04: Make restore recoverable and coordinated with concurrent writes.
  Evidence: no retained pre-restore backup, explicit UI confirmation, or application-wide restore/write coordination.
  Done when: preserve a timestamped recovery backup, explain replacement in both languages, and test restore with pending operations and rollback failures.
- [ ] DATA-05: Strengthen database constraints and migration execution.
  Evidence: counts have checks, but stored derived values, finite scoring weights and duration are not fully constrained; migration rows are inserted rather than running a versioned migration pipeline.
  Done when: forward migrations validate existing data without silent score changes; malformed facts cannot be inserted through supported write paths.

## P1 — Validation and API correctness

- [x] API-01: Missing PATCH returns 404 before metadata creation.
  Evidence: storage and HTTP regression tests; no orphan subject created.
- [x] API-02: Reject fractional and boolean question counts instead of int() truncation.
  Evidence: POST tests reject 1.5, true and null with 422; core scorer rejects booleans.
- [x] API-03: Reject non-finite score weights/results and durations.
  Evidence: NaN/infinity regressions; settings cannot store NaN weights.
- [x] API-04: Convert invalid settings into 422 and validate theme.
  Evidence: HTTP tests for invalid marking defaults and theme.
- [x] API-05: Validate text/tag payload shapes and strict canonical exam dates.
  Evidence: source guards prevent non-string metadata, non-array tags and non-padded date storage. Broader fuzz coverage belongs to TEST-02.
- [x] API-06: Reuse unassigned topics and case-insensitive tag links.
  Evidence: regression for null-subject topic reuse and Timed/timed labels; no unique-key crash.
- [x] API-07: Reject non-object import envelopes cleanly.
  Evidence: regression for array, null and string payloads.
- [x] API-08: Defensive validation and bounded HTTP bodies.
  Counts/IDs are limited to safe integers; nested values, booleans, malformed times/durations and nonfinite/oversized weights return structured 4xx responses. Text/tag lengths are bounded. Actual received bytes are limited before parsing, including chunked requests: 1 MiB ordinary writes, 10 MiB imports, 64 MiB restores. Regression tests verify no partial metadata or preference writes.

- [x] API-09: Validate date-range query syntax and reversed ranges.
  Evidence: record, analytics and comparison endpoints reject malformed or reversed ranges with 422; frontend range feedback is bilingual.
- [x] API-10: Correct duplicate handling during editing.
  Evidence: duplicate edit retries PATCH against the same record, handles retry failures and guards concurrent submissions. Node regressions verify all three behaviors.
- [x] API-11: Preview imports, disclose row errors and require an explicit duplicate choice.
  Preview runs against a disposable database snapshot and identifies accepted, duplicate and invalid rows, including duplicates within the file. Duplicates are skipped by default. Any invalid row rejects the entire import in one transaction. The bilingual confirmation dialog disables saving invalid batches; saved records are revalidated.

- [x] API-12: Normalize new-exam defaults in one server workflow.
  Evidence: omitted values use persistent preferences, explicit weights override defaults and PATCH retains original snapshots. API regressions verify these rules.

## P1 — Statistics and meaningful charts

- [x] STAT-01: Sum negative marking using each examination's own penalty.
  Evidence: unequal counts/weights regression expects 15 penalty points.
- [x] STAT-02: Keep extreme negative scores in distribution totals.
  Evidence: histogram now has an underflow bin; regression includes -125% and 100%.
- [x] STAT-03: Aggregate repeated subject/date heatmap cells.
  Evidence: regression expects one mean cell (-12.5%) for two same-day subject results; index maps replace repeated list searches.
- [x] STAT-04: Exact localized monthly aggregation.
  Gregorian and Jalali month grouping uses unrounded timeline percentages with localized month names. Node regressions cover Nowruz, leap Esfand, Gregorian leap day, counts, exact averages and input round trips.

- [x] STAT-05: Distinguish exam, question and maximum-score weighting.
  API and metric definitions expose all three averages, plus pooled completion and mean exam completion. Unequal-size/unequal-weight regression verifies the denominators.

- [x] STAT-06: Undefined accuracy is unavailable.
  Zero attempted questions returns null and displays an em dash with an explanation in metric definitions. A nonempty set of all-wrong attempts still returns 0%.

- [x] STAT-07: Valid heatmap bounds and localized distribution labels.
  Heatmap scale includes the full observed range; colors explicitly encode percentage. Tooltips and accessible data show the cell mean and contributing count. Histogram labels, counts and interval explanation are localized; severe negatives remain included.

- [x] STAT-08: Requested descriptive analytical modules.
  Added Monday-based weekly summaries, best/worst observed weeks, calendar-day OLS slope, chronological improvement/decline runs, recent volatility comparisons, topic/type breakdowns, hypothetical unanswered-question scenarios, inclusive selected-period comparisons and inspectable insight records. UI explains formulas, scope, overlap, sample limits and hypothetical versus recorded values. All calculations use saved records and scoring weights.

- [x] STAT-09: Qualify observed dispersion and sparse rankings.
  Single-exam standard deviations are null, including rolling and subject metrics. Sample counts and fewer-than-five qualifications accompany summaries and comparisons. Rankings are explicitly observational, without ability, significance, prediction or causality claims.

## P1 — Core frontend workflows

- [x] UI-01: Render history before binding detail handlers.
  Evidence: browser click opens examination detail.
- [x] UI-02: Make Quick history route work.
  Evidence: browser control switches to Advanced History using shared records.
- [x] UI-03: Include editable total questions in every Quick entry form.
  Evidence: inline form and modal both show total; Quick edit displays original total.
- [x] UI-04: Populate subject filter from API and apply it.
  Evidence: desktop browser selected QA subject and dashboard narrowed to its 49% result.
- [x] UI-05: Filter/search/sort state persists visibly. Active scope/reset is shared across views, search focus/caret survives rerenders, filters stay open, and search predicates match analytics/scenarios/comparisons. Verified in both languages.

- [x] UI-06: Sequenced loads/details reject stale responses; typing invalidates in-flight search results immediately. Failed background refreshes retain the screen. Save guards and retained drafts verified through injected network failures.

- [x] UI-07: Charts are disposed before view replacement. Repeated browser navigation verifies old instances are disposed and retained charts remain bounded.

- [x] UI-08: Both forms use the shared debounced /api/score-preview endpoint and central Python scorer. Stale previews are ignored/aborted. Tests verify zero penalties, custom weights, preview/save equivalence and no writes.

- [x] UI-09: Browser checks pass for Quick duplicate cancel, accept and failed retry in both languages, with retained drafts and recovered submit buttons.

## P2 — Localization and calendar

- [x] LOC-01: Format percent sign for current language.
  Evidence: pct() uses English % and Persian ٪.
- [x] LOC-02: Central resources cover visible notifications, server error presentation, import row errors, missing labels, chart tooltips, evidence-bearing insights and export interfaces. CSV headings can be Persian; JSON and CSV data stay canonical by design. Unknown errors have a localized fallback.

- [x] LOC-03: Added keyboard-accessible Jalali picker with month/year navigation, day selection, Escape and nested-dialog focus restoration. Intl-based conversion has explicit 1200–1600 input range; leap/Nowruz, all-year round trips and Persian browser filtering pass.

- [x] LOC-04: Persian/Arabic digits and Persian decimal/group separators normalize to numeric values. Malformed grouping/empty inputs are rejected. Precision arguments now format fractional raw/maximum scores correctly.

- [x] LOC-05: New dates use the local calendar day. Tests cover Tehran midnight, UTC and Los Angeles.

- [x] LOC-06: Local variable Vazirmatn and Manrope assets supply actual font weights, with OFL licenses and provenance. Removed Google Fonts import; browser checks confirm no external asset requests.

## P2 — Missing product requirements and data tools

- [ ] FEAT-01: Show/edit start/end times and derive duration safely; preserve manual duration.
- [ ] FEAT-02: Provide subject/topic inspect, rename and unused-value cleanup.
- [ ] FEAT-03: Add validated CSV import and round-trip scoring configuration.
  Evidence: only JSON import exists; CSV export omits scoring weights and timestamps.
- [ ] FEAT-04: Add filtered Excel export with summaries.
- [ ] FEAT-05: Generate an actual localized PDF performance report with charts.
  Evidence: current print action prints the reports-control page, not a prepared analytical report.
- [ ] FEAT-06: Scope exports/reports to selected exams/date/subject and show the scope.
  Evidence: endpoints export all history regardless of active filters; report copy implies otherwise.
- [ ] FEAT-07: Add selected-exam and selected-period comparisons.
- [ ] FEAT-08: Persist configurable unanswered weight with safe migration and per-record snapshots.
  Evidence: unanswered weight currently implicit zero; model/settings/scorer omit the requested field.
- [ ] FEAT-09: Expose all stored detail metadata.
  Evidence: detail dialog omits unanswered/total, tags, topic, attempt, duration, scoring configuration and timestamps.
- [ ] FEAT-10: Isolate optional sample data from the personal database.

## P3 — UX, accessibility and visual quality

Completed 2026-10-31. Evidence and rerun instructions: outputs/UX-REMEDIATION.md.

- [x] UX-01: Remove duplicate History “Add examination” actions.
  History retains the shared top-bar action.
- [x] UX-02: Keyboard history and modal interaction.
  Real buttons open history details. Native showModal dialogs have accessible titles, explicit Tab/Shift+Tab wrapping, Escape handling, inert background, opener focus restoration, scrollable forms and sticky actions. Tested detail → edit → Escape as well as new-record forms in both modes.
- [x] UX-03: Consistent icons and accessible navigation controls.
  Local SVG icon set replaces mixed navigation/action symbols. Menu, close, filter and sort controls have localized names; decorative SVGs are hidden from assistive technology. Current navigation and mode/language selections expose state. Mobile navigation traps focus, closes on Escape/backdrop, and excludes the hidden drawer from tab order.
- [x] UX-04: Separate chart legends, axes and controls.
  Timeline legend has dedicated top space, date axes and zoom control have separate lower space. Heatmap date labels no longer overlap its color scale on mobile. Screenshots checked in English/Persian, dark/light, desktop/tablet/mobile.
- [x] UX-05: Mobile filters and header.
  Filters remain available at 390px; the header wraps, controls have usable targets, expanded state is exposed and the filter fields remain visible.
- [x] UX-06: Reduce repetitive mobile KPI content.
  Removed repeated card footers, used a compact two-column mobile layout and a full-width completion row, and reduced hero spacing. Quick Mode retains its focused summary.
- [x] UX-07: Verify the responsive UI matrix.
  24 overview/Quick combinations: two modes × two languages × two themes × widths 1440/900/390. Another 12 advanced combinations cover History, detail/edit, Analytics, Subjects, Reports and Settings. No page overflow in checked dashboard/settings layouts; Persian font loads. Screenshots visually inspected for representative combinations and final RTL fixes.
- [x] UX-08: Accessible chart descriptions and text data.
  ECharts ARIA descriptions and decal patterns are enabled. Every populated chart has a localized factual summary and an expandable keyboard-readable data table. Composition legend uses translated answer labels. Reduced-motion preference disables chart animation.
- [x] UX-09: Notifications and initial loading/error/retry.
  Persistent status live region, dialog-local status messages, aria-busy state, initial loading content, localized error screen and retry button. Request-failure injection verifies recovery. Locale direction applies before downstream requests, including failure screens.
- [x] UX-10: Escape subject text in heatmap tooltips.
  Tooltip subject interpolation uses esc(); accessible chart tables also escape labels.

Verification scope: Chromium browser interaction and DOM accessibility semantics, plus visual review. This is not a claim of a formal WCAG certification or a complete assistive-technology/cross-browser audit. Other P1/P2 items (including complete insight/error localization) remain tracked separately.

## P3 — Reliability, performance and delivery

- [x] OPS-01: Declare multipart upload dependency.
  Evidence: requirements.txt previously omitted python-multipart even though File/UploadFile routes require it.
- [x] OPS-02: Verify temporary-file cleanup on all backup/restore paths.
  Implemented: close mkstemp descriptors, background cleanup after download, finally cleanup after restore, cleanup if backup construction fails.
  Done when: response/error-path tests confirm no leftover temporary files.
- [ ] OPS-03: Harden local HTTP access assumptions and document deployment boundary.
  Evidence: unauthenticated write/restore endpoints; no explicit host/origin restrictions. Intended use is loopback, not public hosting.
- [ ] OPS-04: Optimize all-history reads and tag loading.
  Evidence: list_exams issues one tag query per exam and frontend fetches all records; history needs pagination for large histories.
- [ ] OPS-05: Split minified single-line app.js/CSS into maintainable modules and remove stale translations.
- [ ] OPS-06: Initialize repository/version discipline and changelog after excluding user data/artifacts.
- [ ] OPS-07: Correct README overclaims and setup paths.
  Evidence: backup is under Reports, not Settings; full RTL/localization and PostgreSQL URL-only migration claims exceed current implementation; exam records are editable, not immutable.
- [ ] OPS-08: Pin/test a coherent dependency set and resolve test-client deprecation.
  Evidence: current test run warns that Starlette's httpx TestClient integration is deprecated in the installed environment; no syntax error resulted. Clean-environment install is still required.
- [ ] OPS-09: Include third-party asset licenses and attribution for bundled ECharts/font/calendar implementation.

## Test coverage and verification record

- [x] TEST-01: Six new regression tests cover API input rejection, partial PATCH preservation, nonfinite data, metadata reuse, import envelope and histogram/heatmap integrity.
- [ ] TEST-02: Expand API coverage for every CRUD status, preferences transaction rollback, query validation, imports, backups and restoration failures.
- [ ] TEST-03: Add repeatable browser regression flows for both modes, locales, themes and screen sizes using an isolated database.
- [ ] TEST-04: Add calendar boundary and localization-key tests.
- [ ] TEST-05: Add visual baselines for chart legends, modal focus, sidebar, mobile filters and long Persian labels.

Latest automated result (2026-10-31): **35 Python tests and 12 Node frontend logic tests passed** using python -m unittest discover -s tests -v. Python compileall and Node syntax check passed. One test-client deprecation warning remains.
Browser console in the inspected desktop flow: zero errors/warnings. This does not establish that all routes are error-free.
Browser artifacts are under output/playwright/. Some browser observations used the server started before the newest backend edits; the backend changes were tested in-process against the current source.
The earlier temporary QA examination was removed. Five pre-existing personal examinations remain; no original examination was edited/deleted in this review.

## Verified behavior to preserve

- [x] The 15-question, 3-correct, 4-incorrect case gives 8/60 = 13.3333%.
- [x] Negative percentages are preserved; answered questions are not used as denominator.
- [x] SQLite records and preferences persist across fresh connections.
- [x] Core create/edit/delete, explicit duplicate opt-in and JSON/CSV export execute in isolated tests.
- [x] Both modes share the same storage and saved-result scoring engine.
- [x] Mean and pooled weighted percentage are distinct calculations.
- [x] Default changes do not silently change existing scoring snapshots.
- [x] English and Persian layout direction, localized digits and local Persian font are present.
- [x] Timeline, composition, distribution, subject, monthly and heatmap code paths exist; statistical completeness and localization still have open tasks above.
## Remediation batch 2 — 2026-10-30

The historical evidence above describes the original defects. Current resolutions:

- DATA-03: Upload is staged in memory and validated before replacement: integrity and foreign-key checks, supported table definitions/version, rejection of extra views/triggers, preference validation and recalculation comparison for stored scores. Invalid-schema/relationship/score/version/preferences tests leave live records unchanged.
- DATA-04: Retained recovery snapshot under data/recovery, bilingual confirmation, in-process database lock, and automatic recovery on installation failure. Tests verify original recovery content, injected failure after replacement, and waiting for active database access. Coordination is explicitly limited to a single application worker; external processes are not coordinated.
- API-09: Both records and analytics endpoints reject malformed and reversed date ranges with 422. The client catches reversed ranges using localized feedback.
- API-10: A confirmed duplicate edit retries PATCH to the same ID. Retry failures are caught; both entry forms guard concurrent submission and restore button state afterward. Node tests verify edit method/ID and failure cleanup.
- API-12: New records resolve omitted marking weights/total from persistent preferences; explicit values override defaults, while PATCH retains existing snapshots. API regression confirms changes to defaults do not reweight existing records.
- OPS-02: Upload/download temporary files are removed after successful responses, invalid restores, and backup-generation failures. HTTP tests check all four paths.
- UX-10: Heatmap tooltip subjects now use HTML escaping.
- API-08 remains open: this batch additionally rejects zero attempts, unsafe-size integers, malformed times/durations, nested settings and non-boolean duplicate flags. Request size limits and exhaustive typed validation remain to do.
- UI-06 remains open: concurrent form submission is guarded, but async load/render races are still outstanding.
- TEST-02/03 remain open: added six backend tests and three frontend logic tests; these are not substitutes for the full browser matrix.

Validation: 22 backend tests pass; 3 Node logic tests pass; Node syntax and Python compilation pass. Existing TestClient dependency deprecation warning remains. No personal exam data was changed during this batch.

## P1 validation and statistics remediation — 2026-10-31

All remaining API-08/API-11 and STAT-04 through STAT-09 items in the two requested sections are now complete. See outputs/P1-REMEDIATION.md for methodology, limits, API contracts and verification. Earlier batch notes above describe their historical state, not their current completion status. Other checklist sections remain independently tracked.

## Frontend and localization remediation — 2026-10-31

UI-05 through UI-09 and LOC-02 through LOC-06 are complete. Current evidence and limitations: outputs/FRONTEND-LOCALIZATION.md. Earlier defect descriptions and batch notes are historical; unchecked items in other sections remain open.





## Weekly Study Analytics — completed 2026-11-01

- [x] STUDY-01: Independent navigation and workflows in Quick and Advanced modes, sharing the existing database.
- [x] STUDY-02: Transactional migration 3, one report per Saturday–Friday week, revision conflicts and safe deletion.
- [x] STUDY-03: Configurable bilingual categories, color/order/description/disable, with historical name/classification snapshots.
- [x] STUDY-04: Integer-minute aggregates, optional activity breakdowns, Video under each parent and no double-counting.
- [x] STUDY-05: Dynamic reports, exact group totals, meaningful missing-week handling and recorded-week statistics.
- [x] STUDY-06: Interactive category stacks, category/date filters, group balance, trends, allocation, monthly summaries and comparison.
- [x] STUDY-07: Full Persian/English text, RTL/LTR, local fonts, localized input and consistent Jalali/Gregorian conversion.
- [x] STUDY-08: Downloadable Persian/English PDF, CSV, Excel with charts, and copyable formatted text.
- [x] STUDY-09: Full database backup/restore includes study; legacy migration and invalid-backup rejection tested.
- [x] STUDY-10: 50 Python and 18 Node tests pass; 24 study browser combinations and 12 existing UI regression configurations pass.
- [x] STUDY-11: Real English/Persian PDF exports rendered and visually inspected; normal example fits one A4 page.
- [x] STUDY-12: Documentation, reproducible calendar data generation and isolated study/PDF test fixtures delivered.

Evidence, API contracts, methodology, limits and setup: [Weekly Study implementation report](outputs/WEEKLY-STUDY.md).
Windows/GitHub release work remains paused at the user's request; this completion does not mark that release as published.


- [x] STUDY-13: Empty/zero-week and disabled-category browser regressions pass; draft navigation preserves edits and late report requests cannot open stale dialogs (2026-11-01).
