"""Build the per-user Windows installer and update release checksums."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from desktop import VERSION


def compiler():
    candidates = [os.environ.get('INNO_SETUP_COMPILER'), shutil.which('ISCC')]
    for variable in ('ProgramFiles(x86)', 'ProgramFiles'):
        for version in ('7', '6'):
            candidates.append(str(Path(os.environ.get(variable, 'C:/Program Files')) / f'Inno Setup {version}' / 'ISCC.exe'))
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise SystemExit('Install Inno Setup 6/7 or set INNO_SETUP_COMPILER to ISCC.exe.')


def release_files():
    release = ROOT / 'release'
    files=[release / f'Verity-{VERSION}-windows-x64{suffix}' for suffix in ('.exe', '.zip', '-setup.exe')]
    android=release/f'Verity-{VERSION}-android.apk'
    if android.exists():files.append(android)
    return files


def main():
    if sys.platform != 'win32':
        raise SystemExit('Build the installer on Windows.')
    if not (ROOT / 'dist/Verity.exe').is_file():
        raise SystemExit('Run python scripts/build_windows.py first.')
    subprocess.run([compiler(), '/Qp', f'/DAppVersion={VERSION}', str(ROOT / 'packaging/installer.iss')], cwd=ROOT, check=True)
    files = release_files()
    checksums = [f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}' for path in files]
    (ROOT / 'release/SHA256SUMS.txt').write_text('\n'.join(checksums) + '\n', encoding='utf-8')
    print('Installer and checksums:', files[-1])


if __name__ == '__main__':
    main()
