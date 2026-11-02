"""Reproducible release layout; source or user databases are never bundled."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from desktop import VERSION


def prepare():
    from PIL import Image, ImageDraw, ImageFont
    build = ROOT / 'build'; build.mkdir(exist_ok=True)
    icon = Image.new('RGBA', (256,256), (0,0,0,0))
    draw = ImageDraw.Draw(icon)
    draw.rounded_rectangle((8,8,248,248), radius=52, fill='#70e0bb')
    font = ImageFont.truetype(str(ROOT / 'static/fonts/Manrope-Variable.ttf'), 174)
    draw.text((128,121), 'V', font=font, fill='#10141e', anchor='mm', stroke_width=2)
    icon.save(build / 'verity.ico', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
    notices = build / 'third-party'; notices.mkdir(exist_ok=True)
    dependencies=[]
    for dist in importlib.metadata.distributions():
        name=dist.metadata['Name']; dependencies.append({'name':name,'version':dist.version})
        for file in dist.files or []:
            if any(part.lower().startswith(('license','licence','copying','notice')) for part in Path(str(file)).parts):
                source=Path(dist.locate_file(file))
                if source.is_file():
                    target=notices / name / Path(str(file)); target.parent.mkdir(parents=True,exist_ok=True)
                    shutil.copy2(source,target)
    python_license=Path(sys.base_prefix) / 'LICENSE.txt'
    if python_license.exists():shutil.copy2(python_license,notices/'Python-LICENSE.txt')
    (notices/'dependencies.json').write_text(json.dumps(sorted(dependencies,key=lambda d:d['name'].lower()),indent=2),encoding='utf-8')


def package():
    release=ROOT/'release'; release.mkdir(exist_ok=True)
    exe=ROOT/'dist'/'Verity.exe'
    named=release/f'Verity-{VERSION}-windows-x64.exe'; shutil.copy2(exe,named)
    bundle=release/f'Verity-{VERSION}-windows-x64.zip'
    with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.write(exe,'Verity/Verity.exe')
        archive.write(ROOT/'WINDOWS.md','Verity/README.md')
        archive.write(ROOT/'THIRD_PARTY_NOTICES.md','Verity/THIRD_PARTY_NOTICES.md')
        for folder,prefix in [(ROOT/'build/third-party','Verity/third-party'),(ROOT/'static/fonts','Verity/font-licenses'),(ROOT/'static/vendor','Verity/chart-licenses')]:
            for path in folder.rglob('*'):
                if path.is_file() and (folder.name=='third-party' or path.suffix in ('.txt','.md')):
                    archive.write(path,prefix+'/'+path.relative_to(folder).as_posix())
    hashes=[f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}' for path in (named,bundle)]
    (release/'SHA256SUMS.txt').write_text('\n'.join(hashes)+'\n',encoding='utf-8')


if __name__=='__main__':
    if sys.platform!='win32':raise SystemExit('Build on Windows with x64 Python 3.12.')
    prepare()
    subprocess.run([sys.executable,'-m','PyInstaller','--noconfirm','packaging/verity.spec'],cwd=ROOT,check=True)
    result=ROOT/'build'/'smoke-result.json'
    if result.exists():result.unlink()
    subprocess.run([str(ROOT/'dist/Verity.exe'),'--smoke-test',str(result)],cwd=ROOT,check=True,timeout=120)
    if not json.loads(result.read_text(encoding='utf-8'))['ok']:raise SystemExit('Packaged smoke test failed.')
    package()
