# Frontend workflows and localization remediation

Completed 2026-10-31. Personal examination data was not used or modified by tests.

## Workflow fixes

- Search, date and subject scope are visible across views with a reset action. The filter panel stays open. Search preserves focus/caret through rendering; sort selection remains selected.
- History, analytics, simulations and period comparisons now use the same search predicate. Period comparison intentionally replaces only the date range.
- Load sequencing rejects stale results. Typing immediately invalidates an older request, before the debounce starts the next load. Failed background refreshes preserve the existing screen. Initial failures still offer Retry.
- Detail requests are sequenced and invalidated on navigation/closure. Form submissions retain the existing double-submit guard and keep entered values after failed saves.
- Removed charts are disposed before rendering a new view. Browser navigation checks verify all old instances are disposed and retained charts stay bounded.
- Both entry forms use debounced `POST /api/score-preview`, which calls the same Python scoring engine as saving. New input aborts/invalidate older previews. Custom historical weights and zero penalties are respected; preview does not write records.
- Quick duplicate cancellation, confirmation and failed retry were exercised in English and Persian. Cancellation/failure preserve the draft, retries deliberately create a separate attempt, and failed submissions re-enable controls.

## Localization and calendar

- Central locale resources translate validation notifications, request failures, import row errors, missing-subject labels, chart tooltips and common exam types. Unknown server errors receive a localized fallback rather than raw objects. User-authored titles, subjects, notes and tags remain user content.
- Existing insights retain actual numerical evidence in both languages. CSV optionally uses Persian column headings, while values and Gregorian dates stay canonical. JSON is deliberately a stable machine-readable interchange format; its interface explains that distinction.
- The Jalali picker supports month navigation, year entry, day selection, keyboard operation, Escape and focus restoration, including inside another modal. Gregorian input uses the browser date control.
- Supported Jalali input years: **1200–1600**. Out-of-range/invalid dates are rejected. Intl's Persian calendar is the common authority for both input conversion and display; binary search finds the corresponding Gregorian date without a second calendar algorithm. Dates remain ISO Gregorian in SQLite.
- Numeric inputs accept Persian/Arabic digits, Persian decimal and grouping separators, and correctly grouped Latin values. Empty or malformed grouping is rejected. Precision arguments now work consistently, including fractional raw/maximum scores.
- New-record dates use the browser's local calendar day, avoiding UTC-midnight shifts. Tests cover Tehran, Los Angeles and UTC.
- Local Vazirmatn and Manrope variable fonts supply actual weights. OFL notices and provenance are included in `static/fonts/`; CSS no longer imports Google Fonts. RTL headings, tables and labels use Persian typography.

## Evidence and rerun

- **35 Python tests**: preview/save equivalence, validation, zero-penalty defaults, non-writing previews, consistent search scope and localized CSV, plus existing persistence/statistics/restore regressions.
- **12 Node tests**: localized numeric parsing, dates across every supported year, leap/Nowruz cases, local-midnight boundaries, resource parity and existing form regressions.
- `tests/workflows-browser.cjs`: both locales, six duplicate paths, delayed requests, caret/sort/filter state, chart disposal, nested calendar, responsive calendar and font loading with external requests blocked. Result: no page errors or external requests. Expected 422 responses and an intentionally aborted retry are test injections, not unexpected failures.
- Existing 24-combination Quick/Advanced dashboard matrix rerun after the changes. Representative Persian mobile calendar and desktop dialog screenshots were inspected under `output/playwright/`.
- The additional 12-combination advanced-page suite also passes: History/detail/edit, Analytics, Subjects, Reports, Settings and initial-load Retry across locales, themes and sizes. Its expected aborted request tests recovery; no unexpected page errors were reported.

```powershell
python -m unittest discover -s tests -v
node --test tests/frontend.test.cjs tests/statistics.test.cjs tests/locale.test.cjs
python -m tests.serve_ux
# In another terminal:
npx --yes --package @playwright/cli playwright-cli open http://127.0.0.1:8002/ --headed
npx --yes --package @playwright/cli playwright-cli run-code --filename tests/workflows-browser.cjs
```

The CLI may yield when a native confirmation opens while the saved script continues. After completion, `playwright-cli eval 'window.workflowResult'` returns the final workflow result. Saved evidence: `output/playwright/workflows-summary.log` and localization regression logs.

Research: [Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat), [Vazirmatn source and licensing](https://github.com/rastikerdar/vazirmatn), and [jalaali-js calendar comparison](https://github.com/jalaali/jalaali-js). The implementation uses the browser's Intl calendar consistently rather than mixing algorithms with different ranges.

Other TODO sections remain independently tracked: this batch does not implement the separate PDF-report requirement, CSV import, or deployment hardening. The existing Starlette/httpx TestClient deprecation warning remains.
