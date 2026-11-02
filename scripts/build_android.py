"""Build and sign an Android release. Signing material stays outside the repo."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from desktop import VERSION

def run(args,env):subprocess.run([str(a) for a in args],cwd=ROOT,env=env,check=True)

def main():
    env=os.environ.copy()
    env['VERITY_BUILD_PYTHON']=sys.executable
    wheels=ROOT/'output/android-wheels';wheels.mkdir(parents=True,exist_ok=True)
    wheel=wheels/'pydantic-1.10.24-py3-none-any.whl'
    if not wheel.exists():
        build_env={**env,'SKIP_CYTHON':'1'}
        args=[sys.executable,'-m','pip','wheel','pydantic==1.10.24','--no-binary','pydantic','--no-deps','--wheel-dir',wheels]
        if env.get('VERITY_PIP_INDEX_URL'):args+=['--index-url',env['VERITY_PIP_INDEX_URL']]
        run(args,build_env)
    signing=Path(env.get('LOCALAPPDATA',str(Path.home())))/'VerityBuild/android-signing'
    signing.mkdir(parents=True,exist_ok=True)
    config=signing/'credentials.json'
    if not config.exists():
        with config.open('x',encoding='utf-8') as f:json.dump({'password':secrets.token_urlsafe(40)},f)
        if os.name=='nt':
            run(['icacls',signing,'/inheritance:r','/grant:r',f"{env['USERNAME']}:(OI)(CI)F"],env)
        else:os.chmod(signing,0o700);os.chmod(config,0o600)
    env['VERITY_STORE_PASSWORD']=json.loads(config.read_text())['password']
    key=signing/'verity-release.jks';env['VERITY_KEYSTORE']=str(key)
    java_bin=Path(env['JAVA_HOME'])/'bin'
    if not key.exists():
        run([java_bin/('keytool.exe' if os.name=='nt' else 'keytool'),'-genkeypair','-keystore',key,'-storepass:env','VERITY_STORE_PASSWORD','-keypass:env','VERITY_STORE_PASSWORD','-alias','verity','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Verity, O=GoyimUser'],env)
    wrapper=ROOT/'android'/('gradlew.bat' if os.name=='nt' else 'gradlew')
    run([wrapper,'-p',ROOT/'android','assembleRelease','--console=plain'],env)
    apk=ROOT/'android/app/build/outputs/apk/release/app-release.apk'
    target=ROOT/f'release/Verity-{VERSION}-android.apk';target.parent.mkdir(exist_ok=True)
    shutil.copy2(apk,target)
    print('Signed Android artifact:',target)
    print('Keep a private backup of the signing directory for future upgrades:',signing)

if __name__=='__main__':main()
