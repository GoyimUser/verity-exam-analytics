# Verity 1.0.0 — Windows and Android

Stable release of personal examination and weekly study analytics, with local SQLite persistence, Quick/Advanced modes, English/Persian interfaces and Jalali calendars.

## Downloads

- **Verity-1.0.0-android.apk** — signed Android APK, Android 8+, ARM64/x86-64.
- **Verity-1.0.0-windows-x64-setup.exe** — Windows installer.
- **Verity-1.0.0-windows-x64.zip** — portable Windows package and notices.
- **Verity-1.0.0-windows-x64.exe** — portable Windows executable.
- **SHA256SUMS.txt** — checksums for the downloads.

The Windows build requires WebView2 and remains unsigned. Android uses the installed System WebView, runs its own local backend and needs no desktop/server connection. Android PDF reports use the system Save as PDF print flow; other imports and exports use the document picker.

## Included

Accurate configurable exam scoring, historical comparisons, trends, subject/topic analytics, Saturday–Friday study reports, category breakdowns, charts, bilingual PDF/Excel reports, CSV/JSON interchange and database backup/restore. Existing beta records migrate without recalculating historical scores. A one-result PDF timeline now displays its data point.

## Data and validation

No personal reports or database are included. Transfer records between devices using Backup/Restore; there is no automatic cloud synchronization. Back up before uninstalling Android, which removes its private app data. Windows uninstall retains the separate profile.

Backend and frontend regressions, Windows packaging checks and connected Android QA-device workflows were exercised. Android signing keys are kept outside the public repository. Version 1.0.0 supersedes the earlier 1.0.0-beta.1 release, which remains available separately.
