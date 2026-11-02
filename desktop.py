"""Windows entry point: isolated loopback server + native WebView2 window."""
from __future__ import annotations

import argparse
import ctypes
import http.cookiejar
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import secrets
import socket
import sys
import tempfile
import threading
import time
import urllib.request
from contextlib import closing

VERSION = '1.0.0'


def data_directory(override: str | None = None) -> Path:
    if override:
        return Path(override).resolve()
    return Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData' / 'Local'))) / 'Verity'


class DesktopSession:
    """Keep the local desktop API private to this application's browser session."""
    def __init__(self, app, token: str, origin: str):
        self.app, self.token, self.origin = app, token, origin

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        from http.cookies import SimpleCookie
        from urllib.parse import parse_qs
        from starlette.responses import JSONResponse
        headers = dict(scope.get('headers', []))
        origin = headers.get(b'origin', b'').decode()
        host = headers.get(b'host', b'').decode()
        cookies = SimpleCookie()
        try:
            cookies.load(headers.get(b'cookie', b'').decode())
            session = cookies.get('verity_session')
            valid = session is not None and secrets.compare_digest(session.value, self.token)
        except Exception:
            valid = False
        bootstrap = scope['method'] == 'GET' and scope['path'] == '/' and secrets.compare_digest(
            parse_qs(scope.get('query_string', b'').decode()).get('session', [''])[0], self.token)
        if host != self.origin.removeprefix('http://') or (origin and origin != self.origin) or not (valid or bootstrap):
            return await JSONResponse({'detail': 'This desktop session is not authorized.'}, status_code=403)(scope, receive, send)

        async def session_send(message):
            if message['type'] == 'http.response.start':
                message = {**message, 'headers': list(message.get('headers', []))}
                message['headers'].extend([(b'cache-control', b'no-store'), (b'referrer-policy', b'no-referrer')])
                if bootstrap:
                    message['headers'].append((b'set-cookie', f'verity_session={self.token}; HttpOnly; SameSite=Strict; Path=/'.encode()))
            await send(message)
        await self.app(scope, receive, session_send)


def lock_data(directory: Path):
    """One process per data folder, so restore/write coordination stays valid."""
    import msvcrt
    handle = (directory / 'desktop.lock').open('a+b')
    if handle.seek(0, 2) == 0:
        handle.write(b'0'); handle.flush()
    handle.seek(0)
    try:
        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        handle.close()
        raise RuntimeError('Verity is already running. Switch to its existing window.')
    return handle


def run(directory: Path, smoke_result: Path | None = None, ui_smoke_result: Path | None = None):
    directory.mkdir(parents=True, exist_ok=True)
    lock = lock_data(directory)
    logs = directory / 'logs'; logs.mkdir(exist_ok=True)
    handler = RotatingFileHandler(logs / 'desktop.log', maxBytes=1_000_000, backupCount=2, encoding='utf-8')
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
    from app import storage
    # Never store user facts in the executable/extraction/installation folder.
    storage.DB_PATH = directory / 'verity.db'
    from app.main import app
    import uvicorn
    listener = socket.socket()
    listener.bind(('127.0.0.1', 0))
    origin = f'http://127.0.0.1:{listener.getsockname()[1]}'
    token = secrets.token_urlsafe(32)
    url = f'{origin}/?session={token}'
    server = uvicorn.Server(uvicorn.Config(DesktopSession(app, token, origin), log_config=None,
        access_log=False, loop='asyncio', http='h11', ws='none', lifespan='on'))
    thread = threading.Thread(target=server.run, kwargs={'sockets': [listener]}, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 30
        while not server.started:
            if not thread.is_alive() or time.monotonic() > deadline:
                raise RuntimeError('The local application server did not start. See logs/desktop.log.')
            time.sleep(.05)
        if smoke_result:
            smoke(origin, url, directory, smoke_result)
            return
        import webview
        webview.settings['ALLOW_DOWNLOADS'] = True
        window = webview.create_window('Verity — Exam Intelligence', url, width=1280, height=900,
            min_size=(390, 650), background_color='#10141e', hidden=bool(ui_smoke_result))
        if ui_smoke_result:
            def ui_check():
                deadline = time.monotonic() + 45
                result = {'ok': False}
                while time.monotonic() < deadline:
                    try:
                        result = window.evaluate_js("({ok:!!document.querySelector('#main-content')&&document.querySelector('#app').getAttribute('aria-busy')==='false',title:document.title,language:document.documentElement.lang})")
                        if result and result.get('ok'): break
                    except Exception:
                        pass
                    time.sleep(.2)
                if result.get('ok'):
                    window.evaluate_js("""void (async()=>{
                      try {
                        const week=await api('/api/study/weeks/2026-10-31');
                        const prior=week.totals.overall;
                        await api('/api/study/weeks/2026-10-31',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:week.revision,entries:[{category_id:1,minutes:210}]})});
                        const checks=[];
                        for(const language of ['en','fa']) {
                          await api('/api/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,application_mode:'advanced'})});
                          S.view='study';await load();await document.fonts.ready;
                          if(!document.querySelector('#study-form')||!document.querySelector('#study-stack canvas'))throw Error('Study interface failed');
                          const response=await fetch('/api/study/export?format=pdf&language='+language);
                          if(!response.ok||(await response.blob()).size<1000)throw Error('Native PDF fetch failed');
                          checks.push(language);
                        }
                        window.__nativeSmoke={ok:true,study:true,pdfLanguages:checks,previousMinutes:prior,persistedMinutes:210,rtl:document.documentElement.dir==='rtl',font:document.fonts.check('14px Vazirmatn')};
                      }catch(error){window.__nativeSmoke={ok:false,error:String(error)}}
                    })();""")
                    deadline=time.monotonic()+90
                    while time.monotonic()<deadline:
                        result=window.evaluate_js('window.__nativeSmoke || null')
                        if result:break
                        time.sleep(.2)
                    result=result or {'ok':False,'error':'Native study check timed out'}
                ui_smoke_result.write_text(json.dumps(result), encoding='utf-8')
                window.destroy()
            webview.start(ui_check, gui='edgechromium', private_mode=True)
        else:
            webview.start(gui='edgechromium', private_mode=True)
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        listener.close()
        lock.close()
        logging.getLogger().removeHandler(handler)
        handler.close()


def smoke(origin: str, url: str, directory: Path, result_path: Path):
    """Exercise the real frozen HTTP server against a disposable database."""
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def request(path, data=None, method=None):
        body = json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(origin + path, data=body, method=method,
            headers={'Content-Type':'application/json'} if body else {})
        with opener.open(req, timeout=60) as response:
            content = response.read()
            if not content:return None
            return json.loads(content) if 'application/json' in response.headers.get('Content-Type','') else content
    with opener.open(url) as response: assert b'<html' in response.read()
    for asset in ('app.js','locale.js','translations.js','workflows.js','study.js','persian-calendar.json','fonts/Vazirmatn-Variable.ttf','vendor/echarts.min.js'):
        assert request('/static/' + asset)
    assert request('/api/exams') == []
    data = {'title':'Packaged smoke test','exam_date':'2026-10-31','total_questions':15,'correct_answers':3,'incorrect_answers':4}
    row = request('/api/exams', data)
    assert row['raw_score'] == 8 and row['unanswered'] == 8
    assert abs(row['percentage'] - 100 * 8 / 60) < 1e-9
    assert request('/api/analytics')['count'] == 1
    assert request('/api/score-preview', data)['raw_score'] == 8
    for language in ('en','fa'):
        assert request('/api/export/pdf?language='+language).startswith(b'%PDF')
        assert request('/api/export/xlsx?language='+language).startswith(b'PK')
    week=request('/api/study/weeks/2026-10-31',{'revision':0,'entries':[{'category_id':1,'minutes':210}]},'PUT')
    assert week['totals']['overall']==210
    assert request('/api/study/analytics')['weeks'][0]['totals']['overall']==210
    for language in ('en','fa'):
        for format,signature in [('pdf',b'%PDF'),('xlsx',b'PK')]:
            assert request(f'/api/study/export?format={format}&language={language}').startswith(signature)
    # Reopen the same on-disk file after the request connection has closed.
    import sqlite3
    with closing(sqlite3.connect(directory/'verity.db')) as persisted:
        assert persisted.execute('SELECT minutes FROM study_entries').fetchone()[0]==210
    request('/api/study/weeks/2026-10-31?revision='+str(week['revision']),method='DELETE')
    request('/api/exams/' + str(row['id']), method='DELETE')
    assert request('/api/exams') == []
    result_path.write_text(json.dumps({'ok':True,'version':VERSION,'frozen':bool(getattr(sys,'frozen',False)),
        'storage':str(directory),'checks':['static assets','score preview','CRUD','analytics','study persistence','English/Persian exam and study PDF/XLSX downloads']}), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', help='Optional isolated data folder for portable profiles/testing.')
    parser.add_argument('--smoke-test', type=Path, help='Write a smoke result using a disposable database, then exit.')
    parser.add_argument('--ui-smoke-test', type=Path, help='Verify the native renderer and close; use with an isolated --data-dir.')
    args = parser.parse_args()
    if args.ui_smoke_test and not args.data_dir:
        parser.error('--ui-smoke-test requires an isolated --data-dir.')
    try:
        if args.smoke_test:
            with tempfile.TemporaryDirectory(prefix='verity-release-test-') as temporary:
                run(Path(temporary), args.smoke_test.resolve())
        else:
            run(data_directory(args.data_dir), ui_smoke_result=args.ui_smoke_test)
    except Exception as exc:
        logging.exception('Desktop startup failed')
        if args.smoke_test:
            args.smoke_test.write_text(json.dumps({'ok':False,'error':str(exc)}), encoding='utf-8')
        elif args.ui_smoke_test:
            args.ui_smoke_test.write_text(json.dumps({'ok':False,'error':str(exc)}), encoding='utf-8')
        else:
            ctypes.windll.user32.MessageBoxW(None,
                f'{exc}\n\nVerity requires Microsoft Edge WebView2 Runtime.\nLogs: {data_directory(args.data_dir) / "logs"}',
                'Verity — Startup error', 0x10)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
