# P1 validation and statistical correctness

Completed: 2026-10-31. Scope: the remaining items in the two requested P1 sections, preserving the existing database, scoring engine and application architecture.

## Completed checklist items

| Items | Result |
| --- | --- |
| API-08 | Defensive scalar/shape validation, safe integer IDs/counts, bounded weights/text/tags, structured 4xx failures, transactional settings/record updates, actual HTTP body-size enforcement. |
| API-11 | Read-only import preview, per-row outcomes, explicit duplicate policy, atomic imports, confirmation dialog. |
| STAT-04 | Exact Gregorian/Jalali monthly aggregation and localized month names; leap and New Year tests. |
| STAT-05 | Separate exam, question-count and maximum-score averages; separate mean and pooled completion. |
| STAT-06 | Undefined attempted accuracy returns null and displays unavailable rather than 0%. |
| STAT-07 | Full negative heatmap range, percentage color dimension, cell counts, localized histogram intervals. |
| STAT-08 | Weekly summaries, date-based slopes, streaks, volatility comparisons, topic/type breakdowns, simulations, period comparisons, inspectable insight evidence. |
| STAT-09 | Unavailable single-observation dispersion, sample counts, sparse-sample qualifications and observational ranking explanations. |

## Data protection and import contract

No schema migration is needed. Existing records and scoring snapshots are not rewritten. All tests and browser fixtures use temporary databases.

- `POST /api/import?preview=true`: multipart JSON upload, evaluated in a disposable copy of the database. Detects matches against existing records and earlier accepted rows in the file. Returns `created` (prospective accepted count), `skipped`, `errors`, `rows`, `preview`, `atomic`.
- Row status is `accepted`, `duplicate` or `invalid`; invalid/duplicate rows include their original validation message.
- Default duplicate policy: skip records matching title/date/subject/attempt. `allow_duplicate=true` deliberately inserts matching records; embedded file flags cannot bypass this policy.
- `POST /api/import`: revalidates against current data. If any row is invalid, nothing is committed, including newly introduced metadata. Accepted rows are committed together; skipped duplicates are disclosed. Explicit outer transaction prevents SQLite row savepoint releases from committing partial imports.
- Preferences from an exported file are not imported by this examination-import workflow. Full database restore remains a separate confirmed operation.
- Limits apply to the entire HTTP body, including multipart overhead: 1 MiB ordinary writes, 10 MiB import, 64 MiB restore. Oversized bodies return 413. Limits count received bytes, not a trusted Content-Length header.
- Import maximum: 10,000 rows. Counts and IDs cannot exceed `2^53−1`. Positive correct weights must be within `1e−100..1e100`; penalties within `0..1e100`. Counts must still meet the scoring invariants. Text metadata is limited to 500 characters, notes to 20,000, and tags to 100 labels of at most 100 characters. Historical data is not silently adjusted to these bounds.

## Statistical definitions

- **Exam mean:** arithmetic mean of each exam percentage, giving every exam equal weight.
- **Maximum-score weighted:** `100 × sum(raw_score) / sum(maximum_score)`.
- **Question weighted:** `sum(percentage × total_questions) / sum(total_questions)`. This differs from maximum-score weighting when correct-answer weights differ.
- **Pooled completion:** total attempted questions divided by total questions. **Mean completion:** mean of individual exam completion percentages.
- **Attempted accuracy:** total correct divided by total attempted; unavailable if no attempts exist. This differs from an observed 0% accuracy.
- **Dispersion:** population standard deviation of recorded percentages, measured in percentage points. One observation is reported unavailable. Five observations is a descriptive caution threshold, not a significance or confidence threshold.
- **Months:** grouped using canonical Gregorian dates and the selected display calendar, using unrounded source percentages. Rounding is presentation only for these monthly means.
- **Weeks:** Monday-start Gregorian week boundaries, displayed in the selected calendar. Empty weeks are omitted. Partial weeks and sparse groups remain visible with sample counts; best/worst weeks describe observed means.
- **Calendar trend:** ordinary least squares of percentage on elapsed calendar days, with equal weight per exam, requiring three distinct dates. It is descriptive and does not adjust for exam difficulty or predict future results. Method follows [NIST's least-squares description](https://www.itl.nist.gov/div898/handbook/pmd/section1/pmd141.htm).
- **Streaks:** consecutive increasing/decreasing transitions ordered by date then ID; ties reset runs. Same-day ID order does not establish actual examination times.
- **Recent comparison:** last five versus preceding five exams, requiring ten observations. Both means, population dispersions, their differences, dates, counts and contributing records are available.
- **Period comparison:** inclusive ISO date ranges; supplied ranges replace dashboard date bounds and retain the subject filter. Empty means are unavailable; overlapping IDs are disclosed. `GET /api/comparison?first_from=YYYY-MM-DD&first_to=YYYY-MM-DD&second_from=YYYY-MM-DD&second_to=YYYY-MM-DD&subject=`.
- **Hypothetical scenario:** attempt every currently unanswered question at assumed correctness probability `p`, preserving saved marking weights. Gain per exam is `unanswered × [p × correct_weight − (1−p) × penalty]`. Fractional expected outcomes are expectations, not predictions or new records. `GET /api/simulation?probability=0.5&from_date=&to_date=&subject=`.
- **Negative marking:** average percentage-point loss from recorded penalties. Leaving those wrong answers unanswered would recover that loss mathematically; this is a counterfactual, not an exam strategy recommendation.
- **Heatmap:** mean per subject/date, with contributing count. Visual mapping explicitly uses percentage (dimension 2), not the count dimension. Extreme negative means are included in the scale.
- **Histogram:** lower-inclusive, upper-exclusive intervals, an underflow bin below −50%, and an exact 100% bin. Counts conserve all observations.

## Verification

- 32 Python tests pass, including malformed-value boundaries, transaction rollback, request limits, duplicate preview/save policy, weighted denominators, sparse data, evidence, chronology, scenarios and period endpoints.
- 8 Node tests pass, including Gregorian leap day, Nowruz, leap Esfand, exact monthly averages, Jalali input round trips, heatmap bounds, translation-key parity and existing form regressions.
- Python compilation and JavaScript syntax checks pass.
- New browser workflow: 12 combinations (English/Persian × light/dark × 1440/900/390px), with four charts, extreme-negative scaling, mean/count dimensions, accessible data tables, scenario submission, period comparison, evidence dialogs and overflow checks. Import preview, invalid-row blocking, duplicate opt-in and actual saving checked in both languages. No page errors in that run.
- Representative English/Persian desktop/mobile screenshots were visually inspected. Charts remain readable and negative scores remain represented. Screenshots and browser logs are under `output/playwright/p1-*`.
- Existing dashboard regression also passed 24 combinations (Quick/Advanced × English/Persian × dark/light × three widths), including keyboard dialogs, navigation and accessible chart tables. Log: `output/playwright/p1-ux-regression.log`.
- The pre-existing Starlette/httpx TestClient deprecation warning remains; dependency modernization is tracked separately. Legacy server validation messages shown in import row details remain English; comprehensive error translation belongs to LOC-02. The new controls, statuses and analytical explanations are bilingual.

## Rerun

```powershell
python -m unittest discover -s tests -v
node --test tests/frontend.test.cjs tests/statistics.test.cjs
python -m compileall -q app
node --check static/app.js
node --check static/intelligence.js
node --check static/statistics.js
python -m tests.serve_ux
```

In another terminal:

```powershell
npx --yes --package @playwright/cli playwright-cli open http://127.0.0.1:8002/ --headed
npx --yes --package @playwright/cli playwright-cli run-code --filename tests/p1-browser.cjs
npx --yes --package @playwright/cli playwright-cli run-code --filename tests/ux-browser.cjs
```

Stop the fixture server after review. The browser scripts refuse to target a port other than the isolated fixture port. Other open TODO sections are not declared complete by this batch.
