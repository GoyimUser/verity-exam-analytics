# Build from repository root with: python -m PyInstaller packaging/verity.spec
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

root = Path(SPECPATH).parent
datas, binaries, hiddenimports = collect_all('webview')
pdf_datas, pdf_binaries, pdf_imports = collect_all('playwright')
datas += pdf_datas
binaries += pdf_binaries
hiddenimports += pdf_imports
datas += [(str(root / 'static'), 'static'), (str(root / 'build' / 'third-party'), 'third-party')]
a = Analysis([str(root / 'desktop.py')], pathex=[str(root)], binaries=binaries, datas=datas,
    hiddenimports=hiddenimports + ['uvicorn.logging','uvicorn.loops.asyncio','uvicorn.protocols.http.h11_impl','uvicorn.lifespan.on'],
    excludes=['PyQt5','PyQt6','PySide2','PySide6','tkinter'], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='Verity', debug=False,
    bootloader_ignore_signals=False, strip=False, upx=False, console=False,
    icon=str(root / 'build' / 'verity.ico'), version=str(root / 'packaging' / 'version.txt'))
