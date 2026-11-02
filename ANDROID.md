# Verity for Android — 1.0.0

Download `Verity-1.0.0-android.apk` from the [stable release](https://github.com/GoyimUser/verity-exam-analytics/releases/tag/v1.0.0). Android 8 or newer and a current Android System WebView are required. The APK includes ARM64 and x86-64 libraries. This is a signed direct-download APK; it is not a Google Play listing.

## Data and features

The Python scoring, analytics, migrations and SQLite database are the same source modules used on Windows. A private loopback server runs inside the app process; it does not require a computer, hosted server, account or internet connection for normal use. Fonts and charts are bundled. Quick/Advanced modes and English/Persian layouts use the shared frontend.

Records persist in the app's private storage. Use Reports → Backup database to transfer Windows/web records, then Restore backup on Android. Transfers are manual; devices do not automatically synchronize. **Uninstalling the Android app deletes its private data**, so export a backup first. Updating an APK signed with the same release key preserves records. Personal data is not bundled in the download.

CSV, JSON, Excel and database downloads use Android's document picker. Imports use the system file picker. PDF reports open Android's print preview; choose **Save as PDF** and a destination. The print service uses the device language for its own controls; report content follows the application's language.

## Build and signing

Use JDK 17 or newer, Python 3.12, Android SDK platform 36 and the checked-in Gradle 8.14.3 wrapper. Set `JAVA_HOME` and `ANDROID_HOME`, or create ignored `android/local.properties` with `sdk.dir=...`.

```powershell
python scripts/build_android.py
```

The script builds a pure-Python Pydantic wheel, stages only app/static sources, builds and signs the release APK, and copies it into `release/`. Android uses a separately pinned FastAPI/Pydantic combination compatible with embedded Python; both dependency sets run the backend regression suite. `VERITY_PIP_INDEX_URL` optionally selects a package mirror. A Google Maven mirror is configured for environments where the primary endpoint is unavailable.

On Windows, release signing credentials are created under `%LOCALAPPDATA%\VerityBuild\android-signing`, outside the repository, with restricted permissions. **Keep a secure private backup of this directory**: future APK updates require the same key. Never upload its contents to GitHub. On other hosts the directory is under the user home folder. Signing credentials are not passed as literal command-line passwords.

Debug builds use the separate `io.github.goyimuser.verity.qa` package and enable WebView debugging. Release builds use `io.github.goyimuser.verity`, disable debugging and never share QA data. Device testing must use a dedicated test profile/package.

With the QA app open on an authorized connected device, run `node scripts/android_check.cjs`. This creates only clearly named QA fixtures and checks scoring, weekly totals, actual settings buttons, both languages/modes, charts and report HTML. Run it again after force-stopping/reopening QA to check persistence. Native document-picker and print-preview acceptance also requires a device check; CI builds the QA APK and runs Android lint plus backend tests without release signing credentials.

Research: [Chaquopy Android integration](https://chaquo.com/chaquopy/doc/current/android.html), [Android app signing](https://developer.android.com/studio/publish/app-signing), and [Android HTML printing](https://developer.android.com/training/printing/html-docs).
