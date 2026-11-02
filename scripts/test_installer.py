"""Install/reinstall/uninstall acceptance using disposable Windows folders."""
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
import winreg

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from desktop import VERSION

KEY=r'Software\Microsoft\Windows\CurrentVersion\Uninstall\{A37CF996-669D-4B47-8669-332D2E9DDA37}_is1'

def registered():
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,KEY,0,winreg.KEY_READ|winreg.KEY_WOW64_64KEY):
            return True
    except FileNotFoundError:
        return False

def run(arguments):
    subprocess.run([str(a) for a in arguments],cwd=ROOT,check=True,timeout=180,creationflags=subprocess.CREATE_NO_WINDOW)

def main():
    if registered():raise SystemExit('A Verity installation exists; refusing to replace it for a test.')
    output=(ROOT/'output/installer-smoke').resolve();output.mkdir(parents=True,exist_ok=True)
    folder=(output/f'app-{int(time.time())}').resolve()
    assert folder.is_relative_to(output) and not folder.exists()
    profile=output/f'profile-{int(time.time())}'
    installer=ROOT/f'release/Verity-{VERSION}-windows-x64-setup.exe'
    args=[installer,'/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS','/TASKS=',f'/DIR={folder}',f'/LOG={output / "install.log"}']
    result={'ok':False,'checks':[]}
    try:
        run(args)
        assert registered() and (folder/'Verity.exe').is_file()
        assert not list(folder.rglob('*.db')),'A database must never ship with the installer.'
        assert (folder/'THIRD_PARTY_NOTICES.md').is_file()
        result['checks'].append('per-user install, app registration, notices and no bundled database')
        smoke=output/'installed-http.json';run([folder/'Verity.exe','--smoke-test',smoke])
        assert json.loads(smoke.read_text())['ok']
        result['checks'].append('installed executable HTTP, scoring, study and bilingual PDF/XLSX smoke')
        for attempt in (1,2):
            if attempt==2:run(args)
            target=output/f'native-{attempt}.json'
            run([folder/'Verity.exe','--data-dir',profile,'--ui-smoke-test',target])
            native=json.loads(target.read_text());assert native['ok']
            assert native['previousMinutes']==(0 if attempt==1 else 210)
        result['checks'].append('native window and reinstall retain study history')
    finally:
        uninstaller=folder/'unins000.exe'
        if uninstaller.exists():
            assert folder.is_relative_to(output)
            run([uninstaller,'/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',f'/LOG={output / "uninstall.log"}'])
            for _ in range(50):
                if not (folder/'Verity.exe').exists() and not registered():break
                time.sleep(.1)
        assert not (folder/'Verity.exe').exists() and not registered()
    with sqlite3.connect(profile/'verity.db') as db:
        assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        assert db.execute('SELECT sum(minutes) FROM study_entries').fetchone()[0]==210
    result['checks'].append('uninstall removes app registration/files and retains the data profile')
    result['ok']=True
    (output/'results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result))

if __name__=='__main__':main()
