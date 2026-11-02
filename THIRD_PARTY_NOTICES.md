# Third-party components

Weekly Study exports additionally use openpyxl (MIT) and Playwright (Apache-2.0) with their dependencies. PDF export runs an installed browser; it does not redistribute Microsoft Edge. The generated Persian year-start data follows the application's existing Intl calendar. No additional Persian font or calendar-library license is introduced.

Verity uses FastAPI, Starlette, Pydantic, Uvicorn, python-multipart, pywebview, Python.NET and their dependencies. Windows builds use PyInstaller and the Python runtime. The portable ZIP includes available installed dependency license files and a dependency-version inventory under `third-party/`.

The bundled Apache ECharts 6.0.0 source is covered by Apache-2.0 and its included third-party notices: `static/vendor/ECharts-LICENSE.txt` and `ECharts-NOTICE.txt`. Project: https://github.com/apache/echarts .

Vazirmatn and Manrope fonts are distributed under SIL Open Font License 1.1; their license texts and provenance are under `static/fonts/`.

Microsoft Edge WebView2 Runtime is a separately installed Microsoft component and is not redistributed by this package. Project code licensing is independent of these dependency notices.

Android embeds Python through Chaquopy (MIT; https://github.com/chaquo/chaquopy). Its license and Python's license are included in APK assets. Python package licenses remain in their bundled distribution metadata; font and chart licenses accompany the shared static assets. Android System WebView and the system print/document services are provided by the device, not redistributed by Verity. Android does not bundle pywebview, Python.NET or Playwright.
