# Verity for Windows

Download from [GitHub Releases](https://github.com/GoyimUser/verity-exam-analytics/releases). Frozen HTTP checks and native WebView2 tests cover Weekly Study persistence across restart, English/Persian rendering and examination/study PDF and Excel downloads.

1. Download `Verity-1.0.0-windows-x64-setup.exe` for the installer, or the executable/ZIP without `-setup` for portable use.
2. Run the executable. No Python, Node.js, database server or administrator installation is required.
3. Use Settings to choose Quick/Advanced Mode, English/Persian, theme and scoring defaults.

Requires Windows 10/11 x64, .NET Framework 4.6.2 or newer, and Microsoft Edge WebView2 Runtime. WebView2 is commonly installed already; if needed, obtain the Evergreen Runtime from https://developer.microsoft.com/microsoft-edge/webview2/ . The app explicitly uses the modern WebView2 renderer.

The installer checks for WebView2 before installation. It installs under `%LOCALAPPDATA%\Programs\Verity` without requiring administrator access. An optional desktop shortcut and a Start menu entry are available. Uninstall from Windows Settings; your `%LOCALAPPDATA%\Verity` database, recovery backups and logs are retained. The installer contains no personal or demonstration database.

This executable is **unsigned**. Windows may show an unknown-publisher/SmartScreen prompt. Compare the download with the release SHA256SUMS file; no code-signing identity is bundled.

## Your data

Records and settings persist at `%LOCALAPPDATA%\Verity\verity.db`, independently of the executable. Recovery backups are under `%LOCALAPPDATA%\Verity\recovery`; diagnostic logs are under `%LOCALAPPDATA%\Verity\logs`.

Updating/replacing the executable does not delete your records. Back up through **Reports & data → Backup database** before upgrading. Restore an existing local/web-version backup using **Restore backup** to transfer your records. No personal database or sample history ships in the download, and no existing development database is imported automatically.

One app instance can use a given data folder. Closing the native window shuts down its local server. The app binds only to an ephemeral loopback port and requires a per-launch session cookie. All essential fonts and charts are local. No external AI service is needed.

Advanced users can use `Verity.exe --data-dir "D:\My Verity Profile"` for a separate profile. Keep that folder across upgrades; do not place it in an ephemeral extraction directory.

## Known scope

Examination reports support prepared PDF, Excel, JSON and CSV, with JSON/CSV import. Weekly Study supports PDF/Excel/CSV/text reports. PDF rendering uses installed Microsoft Edge when Playwright Chromium is absent; the Playwright driver ships in the executable. Jalali date input supports 1200–1600. JSON interchange retains canonical field names and Gregorian dates. The Windows executable is unsigned.

## Build from source

On Windows with x64 Python 3.12 and Node.js 22:

```powershell
python -m venv .venv-release
.\.venv-release\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt -r requirements-windows.txt
python -m unittest discover -s tests -v
npm ci
npm test
npm run lint
npm run calendar
python scripts/build_windows.py
python scripts/build_installer.py
python scripts/test_installer.py
```

Install Inno Setup 6/7 before building the installer, or point `INNO_SETUP_COMPILER` to `ISCC.exe`. The build creates an installer, standalone executable, portable ZIP with notices, and SHA-256 checksums under `release/`. Smoke tests use disposable databases and check assets, CRUD, scoring, analytics, study persistence and bilingual PDF/Excel exports. The installer test installs, reinstalls and uninstalls in an isolated folder while checking profile preservation; it refuses to run if Verity is already installed. GitHub Actions also runs cross-browser, calendar and reporting checks. Version tags create preview releases when no release already exists.

For native validation use an isolated profile: `Verity.exe --data-dir "C:\Temp\Verity-QA" --ui-smoke-test "C:\Temp\verity-ui.json"`. This test modifies its supplied test profile; never point it at personal records. A second run verifies persistence using the previous duration in the result JSON.
