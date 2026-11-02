"""Android starts the existing local API and stores facts in private app files."""
import secrets
import socket
import threading
import time
from pathlib import Path

_url = None

def start(directory):
    global _url
    if _url:return _url
    from app import storage,study,study_reports,exam_reports
    storage.DB_PATH=Path(directory)/'verity.db'
    from app.main import app
    from fastapi.responses import HTMLResponse
    from fastapi import HTTPException
    from desktop import DesktopSession
    import uvicorn
    @app.get('/api/android/report')
    def report(kind:str='exam',language:str='en',digits:str='native',from_date:str='',to_date:str='',subject:str='',search:str='',category_id:int|None=None):
        if language not in ('en','fa') or digits not in ('native','latin'):raise HTTPException(422,'Invalid locale')
        if kind=='study':
            weeks=study.list_weeks(from_date,to_date,category_id)
            if len(weeks)>52:raise HTTPException(422,'studyPdfLimit')
            return HTMLResponse(study_reports.report_html(weeks,language,digits))
        rows=storage.list_exams(from_date=from_date,to_date=to_date,subject=subject,search=search)
        if len(rows)>500:raise HTTPException(422,'reportFailed')
        return HTMLResponse(exam_reports.html_report(rows,language,digits))
    listener=socket.socket();listener.bind(('127.0.0.1',0));listener.listen(128)
    origin=f'http://127.0.0.1:{listener.getsockname()[1]}'
    token=secrets.token_urlsafe(32)
    server=uvicorn.Server(uvicorn.Config(DesktopSession(app,token,origin),host='127.0.0.1',port=0,loop='asyncio',http='h11',log_level='warning'))
    threading.Thread(target=server.run,kwargs={'sockets':[listener]},daemon=True).start()
    deadline=time.monotonic()+30
    while not server.started:
        if time.monotonic()>deadline:raise RuntimeError('Local server startup timed out')
        time.sleep(.05)
    _url=origin+'/?session='+token
    return _url
