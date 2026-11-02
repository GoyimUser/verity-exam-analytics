# Verity project review — 2026-10-30

## Assessment

The application has a working persistent core and usable Quick/Advanced interfaces. It does **not yet meet the complete original specification**. The most urgent remaining work is restore safety, defensive API validation, complete localization, and reliable filtering/rendering state. Reports and several analytical modules are unfinished features rather than syntax failures.

The companion TODO is the detailed issue register: stable IDs, severity, evidence, implementation status, and completion checks. Checked items represent verified fixes or baseline behavior; partially implemented items remain unchecked.

## Scope and evidence

Reviewed every application source file, database schema and write paths, frontend rendering/event/chart code, dependency manifests, README and tests. Inspected real browser flows for Quick edit, history details, mode transition and subject filtering. Inspected screenshots of dark desktop English, mobile English and mobile Persian layouts. This is source review plus targeted runtime testing, not exhaustive certification of every combination.

- Python compilation and JavaScript syntax checks pass.
- Current suite: 16 tests passed, including six new meaningful regressions.
- Browser console for the sampled desktop flow: zero errors and warnings.
- Test output contains a Starlette TestClient/httpx deprecation warning; dependency compatibility needs follow-up.
- Latest backend changes were verified with the in-process API test client. The existing browser server predates those backend edits and needs restarting to use them.

## Correct behavior

The scoring denominator is the maximum for the entire examination. The supplied 15/3/4 example produces 8 raw points out of 60 and approximately 13.33%; negative percentages survive. Historical marking weights are stored per record. SQLite transactions, foreign keys, date/subject indexes and persistent preferences form a useful base. Both modes use the same examination records. Existing tests verify CRUD, deliberate duplicate creation, exports and settings persistence. The arithmetic mean and pooled percentage are calculated separately.

English/Persian direction switching, Persian digits and a local Vazirmatn asset work in inspected screens. Quick forms include total questions. The browser confirms functioning history details, Quick-to-Advanced history navigation and subject filtering. The existing local ECharts library renders.

## Defects fixed in this remediation batch

1. Partial PATCH now merges omitted data with the stored record. Metadata, timing and historical weights survive an edit with only a changed answer count.
2. Missing updates return 404 before creating metadata.
3. Counts no longer silently truncate fractional JSON values or accept booleans; the scorer rejects non-finite weights/results.
4. Durations reject NaN/infinity; invalid theme/scoring settings return validation responses.
5. Unassigned topics are reused; differently cased duplicate tags no longer crash their junction insert.
6. Invalid import envelope types receive explicit validation errors.
7. Negative-marking totals respect each exam's own penalty. Extreme negative percentages are included in histogram totals.
8. Repeated subject/date observations produce a mean heatmap cell rather than overlapping duplicate cells.
9. History binding order, Quick edit preview weights and Quick history navigation were corrected. The duplicate History add button was removed.
10. Added the missing multipart dependency and a development dependency file for HTTP tests.

Additional UI changes are implemented but retain open verification tasks: Jalali-month aggregation, chart legend spacing, mobile filter visibility, translated percentage-point units, keyboard row affordances and accessible close labels. Backup temporary-file handling is improved, with dedicated failure-path tests still pending.

## Remaining issues by category

**Data safety (P0).** Restore trusts only two table names, can accept an incomplete database, has no retained recovery backup and lacks user confirmation/concurrent-write coordination. Schema constraints and migration procedures need stronger integrity coverage.

**API and workflow correctness (P1).** Some malformed/nested/numerically extreme payloads remain insufficiently typed. Query ranges are not validated. Duplicate confirmation after a failed edit can create a new record. Imports force duplicate allowance and obscure row failures. New API records and frontend defaults are not resolved through one consistent server workflow.

**Statistics (P1/P2).** Weighted metrics need precise definitions under mixed scoring configurations. No attempts should mean unavailable accuracy rather than zero. Heatmap color bounds are fixed; one observation displays zero dispersion without sufficient adjacent qualification. Jalali monthly aggregation needs boundary tests and unrounded inputs. Requested weekly, topic/type, time-based trend, streak, comparison and simulation modules remain incomplete.

**Localization (P2).** Persian insights replace real metrics with generic prose. English validation messages and chart tooltips remain. Full calendar-picker behavior, supported-range tests, Persian decimal/group input handling and local-date defaults are missing. Numeric precision callers disagree with the formatting helper's signature. Font weights and bundled licenses need work.

**Product and reporting (P2).** Start/end-time editing, subject/topic management, CSV import, Excel export, generated analytical PDF, filtered exports, selected-record comparison and configurable unanswered weighting are incomplete. The current print button prints the report controls. Detail dialogs omit several stored fields.

**UX and accessibility (P3).** Desktop inspection found legend/date overlap and inconsistent navigation symbols. Mobile inspection found hidden filters, overly tall repeated KPI cards and untranslated “pp”. Remaining tasks cover full responsive/theme verification, focus-trapped dialogs, Escape/focus restoration, named icon controls, live notifications, chart alternatives and long Persian strings. Heatmap HTML tooltips need escaped subject text.

**Performance and maintainability (P3).** Full-history requests and per-record tag queries need optimization. Concurrent loads can race; search loses focus/value on rerender. Removed charts are not always disposed. Formula duplication exists in previews. Source is compressed into difficult-to-maintain lines. README overstates several capabilities; dependency reproducibility and licenses require attention.

## Data handling and next sequence

The temporary QA exam from the earlier browser session was identified and deleted. Five original exams remain. Regression tests use temporary databases. Only the temporary QA result was removed; it was disposable test data, not a personal examination.

Continue with DATA-03/DATA-04 restore validation and recoverability, then API-08/API-10 boundary and edit semantics, UI-05/UI-06 render state, and LOC-02 full localized evidence/errors. The TODO retains every known issue and marks follow-up checks separately from implementation.
