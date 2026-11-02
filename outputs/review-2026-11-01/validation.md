# Review and repair verification — 2026-11-01

This review used disposable SQLite databases and the isolated fixture server on `127.0.0.1:8002`. Personal records were not used or modified. GitHub publication and Windows release remain paused.

## Results

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Python regression suite | **56 passed** | `python-tests.log`; `python -m unittest discover -s tests -v` |
| JavaScript regression suite | **21 passed** | `node --test tests/frontend.test.cjs tests/statistics.test.cjs tests/locale.test.cjs tests/study.test.cjs` |
| Python syntax | Passed | `python -m compileall -q app desktop.py` |
| First-party JavaScript syntax | Passed | `node --check` on every `static/*.js` |
| Patch whitespace | Passed | `git diff --check`; only Git LF/CRLF conversion notices |
| Desktop source smoke | Passed | `desktop-after.json`: assets, scoring, CRUD, analytics; `frozen:false` |
| Current browser review | **12 Advanced + 12 Quick Study configurations passed** | `tests/review-browser.cjs`, English/Persian × light/dark × 390/768/1440 pixels |
| Additional page/keyboard regression | **12 configurations passed** | `tests/ux-pages.cjs`, English/Persian × light/dark × 390/900/1440 pixels; dialog focus, Escape, chart tables, Persian font, uploads, Settings and recovery after failed loading |
| Study chart/export/edit flow | Passed | `tests/study-exports-browser.cjs`: real segment click, CSV/XLSX/PDF download, copy feedback, stale-save rejection retaining draft, confirmed reload and deletion |

The browser review checks real Settings button handlers and mode/language changes, filtered exam JSON downloads, chart rendering, the shared detail-close icon, long category labels and saved report dialogs. It verifies no horizontal overflow for valid 100-character category names. The first attempt reused an old browser session still executing pre-fix JavaScript; a fresh browser session passed. These final results are from the fresh session.

## Reproductions and fixed regressions

`backend-before.json` records the original foreign-origin write, unfiltered export, CSV formula and invalid restored-weight reproductions. `desktop-before.json` records the failed source smoke. `tests/test_review.py` contains six regression cases covering:

- Non-reusable study revision tokens across delete/recreate and backup restoration.
- Loopback Host and same-origin request boundaries, including IPv6 local reads.
- Export filters and formula-safe text while preserving numeric negative scores.
- Restore rejection of invalid settings and study metadata without replacing valid data.
- Distinct identities for missing/real `Unassigned` subjects and delimiter-containing topic names.
- Unsupported JSON import schema versions rejected before writing.

Three added frontend regressions cover Settings bindings, guarded deletion failures and timeline tooltips when only the moving-average series is visible, including zero values.

## Visual inspection

Reviewed current mobile Persian/dark Settings, desktop English/light analytics and long-category layouts in both directions. Representative artifacts:

- [Persian mobile long labels](study-long-after-fa-dark-390.png)
- [English desktop long labels](study-long-after-en-light-1440.png)
- [Persian mobile Settings](../../output/playwright/ux-settings-fa-dark-390.png)
- [English desktop analytics](../../output/playwright/ux-analytics-en-light-1440.png)

Long names now wrap without widening the page. Mode selection and form hierarchy remain readable in RTL. The mixed-direction heatmap data-table date issue found during inspection remains **R34**; it is not marked fixed. The close icon now matches the shared SVG system. General navigation icons are consistent; no additional specific icon defect was reproduced.

## Logs and limitations

- No current Python or first-party JavaScript syntax errors were found.
- The Python suite still reports the existing Starlette/httpx TestClient deprecation (**R24**).
- Browser failure-path checks intentionally generate one aborted exam-list request and one HTTP 409 study conflict. These are expected test events; no unexpected JavaScript page errors occurred.
- Actual English study PDF downloading passed this batch. Earlier English/Persian PDF rendering evidence is retained in `outputs/WEEKLY-STUDY.md`; a new full bilingual PDF visual audit was not repeated because PDF layout code did not change.
- A source desktop smoke test is not certification of a new frozen executable. Frozen study/PDF packaging, a pristine dependency installation, Firefox/WebKit, formal screen-reader testing and an automated contrast audit remain explicitly unverified.
- Passing checks establish the behaviors exercised, not the absence of every possible defect. Required but absent features and remaining correctness issues are listed in the canonical TODO.

## Checklist status

**34 findings: 14 fixed and verified; 20 open**, including missing capabilities and verification gaps. See [the categorized report](../REVIEW-REPORT.md), [canonical TODO](../../TODO.md) and [structured evidence catalog](findings.json).

Next priority: R09 draft preservation and R11 examination stale-edit protection, followed by the open P2 study, reporting, localization and metadata requirements. Do not treat missing examination PDF/Excel features as missing Weekly Study exports; these are separate modules.
