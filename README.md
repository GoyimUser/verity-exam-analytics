# Verity — Personal Exam Intelligence

A local-first examination analytics application. It stores records in SQLite, calculates scores with configurable marking weights, and turns historical attempts into trend, subject, completion, and consistency insight.

## Windows and Android applications

Download the Android APK, Windows installer or portable version from [GitHub Releases](https://github.com/GoyimUser/verity-exam-analytics/releases). The installer uses a per-user installation, creates a Start menu shortcut and supports uninstall without deleting your records. The executable is unsigned. See [Windows packaging and data storage notes](WINDOWS.md). User data is stored separately under `%LOCALAPPDATA%\Verity`. Build automation is in `.github/workflows/windows-release.yml`.

See [Android installation, data transfer and build instructions](ANDROID.md). The stable release is **1.0.0**; the earlier beta remains available as historical evidence.

## Operating modes and languages

**Quick Mode** is a focused five-field registration screen: name, date, total questions, correct, and incorrect. Total questions is prefilled from Settings for speed and can be changed for an individual quick entry. Marking defaults also come from Settings; Quick Mode gives immediate score feedback and shows a compact trend and history. **Advanced Mode** is the full original workspace—metadata, attempts, charts, subject analysis, insights, reports, import/export, and backups. Both modes write to the same `exams` table and call the same server-side scoring engine.

English is LTR with Gregorian dates. Persian (`فارسی`) applies a complete RTL layout, locally served Vazirmatn typeface, localized numerals, and Jalali input/display. Dates remain Gregorian `YYYY-MM-DD` in SQLite; the client converts only at entry/presentation boundaries, so filtering, ordering, exports, and analytics remain stable across language changes. Jalali input supports years 1200–1600 and uses Intl consistently for conversion and display. The keyboard-accessible picker also works inside exam dialogs. Local variable Vazirmatn and Manrope fonts include OFL licenses and provenance in `static/fonts/`.

Settings persist `application_mode`, `language`, `persian_digits`, default total questions, and future-record marking weights (including unanswered points). Historical examinations retain their saved weights and calculated scores. Settings loads independently of examination analytics; asset URLs are content-versioned to prevent stale frontend files after upgrades. Unsaved exam drafts require confirmation before navigation or display changes discard them.

## Weekly Study Analytics

**Weekly Study / مطالعه هفتگی** is an independent module available in Quick and Advanced modes. Enter weekly hours and minutes by theoretical/practical category; every week runs Saturday–Friday. Video is a subcategory of each subject. Advanced Mode adds optional activity breakdowns, category management, monthly summaries, comparisons and additional charts. Both modes share saved reports, with integer-minute totals and historical category snapshots.

Interactive stacked weekly columns, Persian/Gregorian dates, text/PDF/CSV/Excel reports and full-database backup integration are included. Install the updated dependencies below. PDF export uses installed Microsoft Edge on Windows, or install Chromium with `python -m playwright install chromium`. See [the study module guide, architecture and verified tests](outputs/WEEKLY-STUDY.md).

## Quick start

Use Python 3.12. The manifests and `constraints-windows-py312.txt` pin the verified dependency set.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`. The database is created at `data/verity.db`; it is deliberately excluded from version control. Use **Reports & data → Backup database** before upgrades or experiments.

Run this personal application on loopback with **one server worker**. Only `localhost`, `127.0.0.1` and `[::1]` hosts are accepted; supplied browser origins must match the local server. This boundary does not authenticate other software on your computer. Database access and restoration are coordinated within that process; do not run concurrent app instances against the same database or edit it externally during restoration. Public hosting requires additional authentication and deployment hardening.

Restoration asks for confirmation in the selected language, validates the supported schema, relationships, preferences and stored score calculations, and retains the previous database in `data/recovery/before-restore-*.db`. If installation fails after replacement, the application attempts to recover the original database automatically. Keep recovery files until you have verified the restored data. A recovery file can be selected using the same Restore backup control. Unknown schema versions are rejected rather than guessed.

## Architecture

`app/main.py` exposes validated REST endpoints and static assets. `app/storage.py` owns SQLite schema migrations, transactions, uniqueness checks, preferences, and import/export. `app/analytics.py` derives reproducible statistics directly from examination records; no summaries are treated as source data. `app/scoring.py` is the isolated scoring and validation domain layer. `static/` is a dependency-light responsive UI with a locally served ECharts bundle, a local `jalali.js` boundary converter, and a local Vazirmatn font asset.

SQLite is the default for one local user: it is durable, portable as one backup file, and avoids operating a database service. The normalized `subjects`, `topics`, `tags`, and junction tables preserve extensibility. Version 4 adds transactional preflight-checked migrations, database domain guards and exam revisions without recalculating historical scores. Version 5 upgrades early v4 guards and recognizes their exact backup schema without changing examination facts. PostgreSQL would require a storage adapter, SQL/schema migration and concurrency testing, rather than a connection URL change. Batched reads and 50-row history pagination were measured against 10,000 exams and 1,000 study weeks; analytics still uses the complete filtered history.

## API

- `GET/POST /api/exams`, `GET/PATCH/DELETE /api/exams/{id}`
- `GET /api/analytics?from_date=&to_date=&subject=`
- `GET /api/subjects`, `GET /api/export/{json|csv|xlsx|pdf}`, `POST /api/import`
- `GET /api/metadata`, `PATCH/DELETE /api/metadata/{subjects|topics}/{id}`
- `GET /api/backup`, `POST /api/restore`, `GET/PATCH /api/settings`

All score fields are re-derived server-side. Duplicate detection uses title/date/subject/attempt; the client must opt in with `allow_duplicate` to create a deliberately separate attempt. Exam lists accept `limit` (1–200) and `offset`; omitted pagination retains the legacy API behavior. Submit the returned `revision` with edits for stale-write protection (409 on conflict); the application always does this, while legacy clients may omit it. Restores issue fresh revisions. Optional start/end times derive duration when no explicit duration is supplied; an end before the start means the next day, and equal times mean zero minutes.

Reports apply the active date, subject and search filters. PDF includes summary, chronological chart and complete examination details (maximum 500 records per PDF). Excel retains numeric cells with localized headings. JSON and version-1 CSV support validated, atomic preview/import; CSV exported in either language can be imported with its original weights, timestamps, tags and timing. Canonical dates remain Gregorian and formula-like spreadsheet text is escaped. Subject/topic management in Settings permits safe renaming and removal of unused entries. History supports comparisons of 2–6 selected attempts using their saved scoring configurations.

## Tests

```powershell
python -m unittest discover -s tests -v
npm ci
npm test
npm run lint
npm run calendar
npx playwright install firefox webkit
npm run test:browser
node scripts/settings_check.cjs
python -m tests.check_exam_pdf
```

Install `requirements-dev.txt` for API/PDF tests and use Node.js 22 for frontend tooling. The browser scripts start disposable fixture servers themselves; installed Edge is the Chromium fallback on Windows. On other systems, also run `npx playwright install chromium` and `python -m playwright install chromium`. Tests use temporary databases; frontend logic tests run with Node's built-in test runner. Restart the server after backend code changes unless running with `--reload`.

For isolated browser UX checks, run `python -m tests.serve_ux`, open `http://127.0.0.1:8002/` with Playwright CLI, then run the saved scripts `tests/ux-browser.cjs`, `tests/ux-pages.cjs`, and `tests/ux-final.cjs` using `playwright-cli run-code --filename`. These checks cover modes, locales, themes, responsive widths, keyboard dialogs, chart data tables and load retry. See `outputs/UX-REMEDIATION.md` for commands and results.

## Technical choices researched

### Validation and statistical remediation (2026-10-31)

Reports → Import JSON/CSV previews each row before confirmation. Matching records are skipped by default; deliberately importing them requires the duplicate checkbox. Any invalid row prevents the entire import, and preview never changes personal data. HTTP bodies are limited to 1 MiB for ordinary writes, 10 MiB for imports and 64 MiB for restoration.

Advanced Analytics now includes weekly summaries, calendar-time trends, streaks, topic/type breakdowns, period comparisons and hypothetical unanswered-question scenarios. Metric definitions distinguish exam means, question weighting and maximum-score weighting. Accuracy without attempts and dispersion for one observation display as unavailable. Monthly grouping uses exact percentages and the selected Gregorian/Jalali calendar.

See [P1 remediation](outputs/P1-REMEDIATION.md) for formulas, API contracts, limits and verification. Run `tests/p1-browser.cjs` against the isolated fixture server to check the new bilingual workflows.

FastAPI supports SQL database integrations and its own documentation notes SQLite's single-file suitability for a simple deployable application, with server databases such as PostgreSQL as the later-scale option. Apache ECharts was chosen over Plotly for this implementation because it brings line/bar/heatmap, dataZoom, visualMap, responsive Canvas/SVG rendering, and rich interactive components in one client library. Plotly is a strong alternative for scientific figure workflows; ECharts has the more cohesive dashboard interaction set here.

## Data model

`exams` contains editable examination facts and creation/modification timestamps. `subjects` and `topics` are normalized lookup tables. `tags` uses `exam_tags`; scoring configuration is stored per exam so history remains reproducible after default weights change. `preferences` holds UI and default marking choices. Date/subject composite indexes support the main filter paths.

## Frontend workflow and localization update

See [workflow and localization evidence](outputs/FRONTEND-LOCALIZATION.md) for persistent filters/search, shared scoring previews, duplicate retry verification, localized inputs/errors, calendar bounds and offline font tests. Live previews now require the local backend, just like saving. Run `tests/workflows-browser.cjs` with Playwright CLI against the isolated fixture server to repeat these checks.

## Current review and verification

See the [canonical checklist](TODO.md), [categorized review](outputs/REVIEW-REPORT.md), [review verification](outputs/remediation-2026-11-02/validation.md) and [Windows release verification](outputs/release-2026-11-02.md). All 34 catalogued findings have resolutions and recorded evidence. Current checks include 70 Python tests, 25 Node tests, 48 cross-browser configurations and 16 additional Settings regressions. Automated accessibility/contrast and accessibility-tree checks are targeted coverage, not a claim of formal screen-reader certification. Browser review scripts must run against disposable fixture databases, never personal records.

