# Final remediation verification — 2026-11-02

All 20 previously open catalog findings are resolved; the catalog now contains 34 resolved findings and no unchecked work items. The user's additional Settings loading report is covered by the expanded R02 regression. Findings describe the reproduced pre-fix state; each current resolution is recorded in [the canonical TODO](../../TODO.md) and [the evidence catalog](../review-2026-11-01/findings.json).

## Settings failure

The earlier single-element selector error is corrected. Settings and Reports now load independently of examination list/analytics requests, and the Quick renderer only runs on the Quick view. Load failures retain diagnostic context instead of being silently swallowed. HTML uses `Cache-Control: no-store` and first-party asset URLs include content hashes, preventing upgraded HTML/controllers from mixing with stale cached scripts.

`scripts/settings_check.cjs` passed 16 configurations: empty/populated history × English/Persian × light/dark × 390/1440 pixels. Each configuration performs three Quick → Settings → Advanced → Settings cycles and real language switches. An injected examination analytics failure does not affect Settings and causes no analytics request there. There are no workspace-loading errors or page errors. The script also verifies that History recovers from an invalid page offset with both populated and empty records.

## Executed checks

| Check | Result |
| --- | --- |
| Fresh Python 3.12 environment, exact requirements and constraints | Installed; `pip check` passes |
| `python -m unittest discover -s tests -v` | 67 tests pass, no former TestClient deprecation warning |
| `npm test` | 25 tests pass across all five suites |
| `npm run lint` | ESLint and Prettier pass |
| `npm run calendar` | Generated calendar matches checked-in data |
| Python compilation and all first-party JavaScript syntax | Pass |
| `node scripts/browser_check.cjs` | 48 configurations pass: Chromium/Edge, Firefox, WebKit × two languages × two themes × two modes × two widths |
| Automated WCAG A/AA checks | Zero axe violations across tested dashboard, Settings, Study and comparison-dialog states |
| `node scripts/settings_check.cjs` | All 16 configurations pass, including injected failure and repeated mode switching |
| `python -m tests.check_exam_pdf` | English/Persian exam PDFs (three pages each) and study PDFs (one page each) generated, rendered and inspected |
| `python scripts/benchmark.py` | 10,000 examinations and 1,000 study weeks; constant query counts verified |
| `python scripts/build_windows.py` | Fresh-environment frozen build and packaged HTTP smoke pass |
| Native WebView2 test and restart | English/Persian rendering, local font, study chart, PDF exports and persisted 210-minute record pass |

The browser workflows exercise draft-discard cancellation, a second client's conflicting exam edit, complete detail metadata, selected-exam comparison, subject rename, real PDF/Excel downloads, Quick draft navigation/reload protection, overnight timing, negative unanswered scoring and independent duplicate-category legend selection in both languages. Earlier review regressions remain in the Python/Node suites, including record preservation, restore rollback, malformed input and Saturday–Friday study periods.

## Per-item regression map

| Findings | Implementation and verification |
| --- | --- |
| R09 | Dirty-form confirmation and both-module departure protection; Node confirmation tests and actual edit/Quick browser flows retain cancelled drafts. |
| R11 | Revision-checked edits return 409; two-client edits and restore invalidate old tokens; browser retains the conflicting draft. |
| R12 | Duplicate labels have distinct legend identities; independent selection verified in actual ECharts, English and Persian. |
| R13, R14 | Dedicated scoped examination PDF/Excel, summary, chart and full metadata; workbook numeric/formula-safe assertions, actual browser and frozen downloads, rendered PDF inspection. |
| R15 | Versioned bilingual CSV round-trip, including saved weights, times, timestamps, tags and escaped formula text; atomic invalid import regression. |
| R16 | Start/end controls, overnight calculation and explicit-duration precedence; Python boundary cases and actual 23:45–00:30 browser save. |
| R17 | Safe metadata management; referenced delete rejection, identity preservation and browser rename. |
| R18 | Per-exam unanswered-weight snapshot and default preference; shared preview/save/simulation calculations and historical preservation tests. |
| R19, R20 | Selected-attempt comparison and complete localized detail metadata; real controls, dialog columns, keyboard close and accessibility audit. |
| R23 | Batched relationship reads, 50-row history pages, complete-history summaries, invalid-page recovery; 150-row pagination regression and 10,000-row benchmark. |
| R24 | Clean pinned Python environment, transitive constraints, npm lockfile and compatible test-client dependency; install and complete suites pass. |
| R25 | Formatted first-party JS/CSS, centralized translations and extracted workflow helpers; lint, translation parity and behavior-level tests pass. |
| R26 | CI definition includes all Node suites, calendar drift, browser/Settings/PDF and frozen checks; the commands run locally. Remote GitHub CI was not dispatched. |
| R27 | Packaged Playwright driver, frozen bilingual exam/study exports, native WebView2 and persistent study record after restart. |
| R29 | Transactional v4 migration with preflight and database guards; injected DDL rollback, invalid direct SQL and legacy backup tests. |
| R30 | Missing browser (503) distinguished from unexpected rendering failure (500 plus logged diagnostics); both PDF modules tested with injected errors and successful real rendering. |
| R32 | Three-browser coverage, accessibility-tree snapshots, keyboard/dialog checks and automated contrast rules. Light-theme muted/negative text contrast corrected. |
| R34 | Individually isolated mixed-direction components in accessible chart rows and tooltips; Node assertions plus English/Persian visual checks. |

## Performance measurements

On this Windows host, 10,000 examinations and 1,000 saved study weeks produced:

- 50-row examination page: two SELECTs, approximately 0.009 seconds.
- Batched study-history read: three SELECTs, approximately 0.009 seconds.
- Full 10,000-examination analytics: approximately 0.383 seconds.

These are local measurements, not deployment guarantees. Study charts still need complete weekly records; only history presentation is paginated. Summary calculations remain independent of the displayed page.

## Visual and accessibility review

Rendered English/Persian examination and study PDFs were inspected for shaping, local font embedding, mixed-script text, negative scores, metadata, page bounds and chart chronology. Persian exam chart end labels were corrected to follow the plot's chronological direction. Representative mobile Persian/light and desktop English/dark study screenshots show contained inputs, readable labels and consistent layout.

Automated accessibility-tree checks verify exposed headings, buttons and input roles; keyboard tests cover modal focus, Escape and retained drafts. This is targeted assistive-technology-facing coverage, not a human NVDA/JAWS audit or formal WCAG certification. No unperformed screen-reader session is represented as passed.

## Environment and release boundaries

The fresh `.venv-review` uses Python 3.12.10 and the checked-in Windows constraints. The default Python package host had a DNS failure, so installation used the HTTPS Tsinghua PyPI mirror. `pip check` and the final tests passed against the resulting exact dependency set. Playwright is pinned to 1.64.1 in Python and Node. Installed Microsoft Edge supplied Chromium rendering on Windows; Firefox and WebKit also ran successfully. Firefox's Windows private-assembly launch failed from its AppData cache on this host; copying the unmodified browser directory into the ignored workspace test cache resolved it without changing system/security settings. The browser script records that fallback. PyInstaller emits an optional Android-backend collection warning on Windows; the tested WebView2 backend and exports pass.

All fixture writes used disposable databases or the explicitly isolated native test profile. Personal records were not used or modified. Version-4 migration preserves historical scoring results, and restores retain their recovery-copy behavior. Local builds, screenshots and test profiles are ignored by Git. GitHub publication remains paused; no push, tag or release was created. The executable remains unsigned.

## Evidence and repeatability

Machine-readable results are copied beside this document: `browser-results.json`, `settings-results.json`, `pdf-results.json`, `benchmark.json`, `frozen-smoke.json` and native test results. Full local screenshots, accessibility snapshots, PDFs and fixture server logs remain under `output/playwright/`, `output/pdf/completion/` and `output/native-*.json`. Source tests and CI commands are checked in; generated fixture databases and browser caches are not.

Run the commands above from the repository root with the development requirements and `npm ci`. The browser scripts launch their own isolated servers (ports 8013 and 8014). Native smoke requires `--data-dir` pointing to a test-only directory. See [README](../../README.md) and [Windows build instructions](../../WINDOWS.md).
