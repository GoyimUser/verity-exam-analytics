from __future__ import annotations

import json
import os
import tempfile
import hashlib
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile, Path as ApiPath
from starlette.background import BackgroundTask
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .analytics import build_analytics
from . import storage
from .validation import BodyLimitMiddleware, LocalOriginMiddleware
from .statistics_extra import compare, simulate
from .scoring import calculate_score
from .validation import number
from dataclasses import asdict
import logging
import sqlite3
from . import exam_reports, metadata
from .pdf_render import BrowserUnavailable
from fastapi.responses import Response
from starlette.requests import Request

app = FastAPI(title="Verity Exam Intelligence", version="1.0.0")
app.add_middleware(BodyLimitMiddleware)
app.add_middleware(LocalOriginMiddleware)
app.add_middleware(TrustedHostMiddleware,allowed_hosts=['localhost','127.0.0.1','[::1]'],www_redirect=False)
from .study_api import router as study_router
from .study import StudyError
app.include_router(study_router)

@app.exception_handler(StudyError)
async def study_failure(request, exc):
    return JSONResponse({'detail':exc.code,'code':exc.code},status_code=exc.status)
app.mount("/static", StaticFiles(directory=Path(__file__).parents[1] / "static"), name="static")

def remove_temporary_file(path: Path) -> None:
    """Best-effort cleanup for one-use backup/import files."""
    try:
        path.unlink(missing_ok=True)
    except OSError:
        # The operating system may still hold the file during response finalization.
        pass

@app.on_event("startup")
def startup(): storage.initialize()
@app.get("/")
def root():
    # Content-addressed URLs prevent an old cached controller from being paired
    # with new templates/resources after a source or packaged upgrade.
    folder=Path(__file__).parents[1]/'static'
    html=(folder/'index.html').read_text(encoding='utf-8')
    def version_asset(match):
        relative=match.group(1)
        digest=hashlib.sha256((folder/relative).read_bytes()).hexdigest()[:16]
        return f'/static/{relative}?v={digest}'
    html=re.sub(r'/static/([^"?]+\.(?:js|css))',version_asset,html)
    return HTMLResponse(html,headers={'Cache-Control':'no-store'})
def failure(exc:Exception): raise HTTPException(422, str(exc))
@app.get("/api/exams")
def exams(search:str="",subject:str="",sort:str="exam_date",direction:str="desc",from_date:str="",to_date:str="",limit:int|None=Query(default=None,ge=1,le=200),offset:int=Query(default=0,ge=0)):
    try: return storage.list_exams(search,subject,sort,direction,from_date,to_date,limit,offset)
    except ValueError as exc: failure(exc)
@app.post("/api/exams",status_code=201)
def create_exam(data:dict[str,Any]):
    try:return storage.save_exam(data)
    except ValueError as exc:failure(exc)
@app.get("/api/exams/{exam_id}")
def exam(exam_id:int=ApiPath(ge=1,le=2**53-1)):
    result=storage.get_exam(exam_id)
    if not result: raise HTTPException(404,"Examination not found.")
    return result
@app.patch("/api/exams/{exam_id}")
def edit_exam(data:dict[str,Any],exam_id:int=ApiPath(ge=1,le=2**53-1)):
    try:return storage.save_exam(data,exam_id)
    except storage.StaleExamError as exc: raise HTTPException(409,str(exc))
    except storage.ExaminationNotFoundError as exc: raise HTTPException(404, str(exc))
    except ValueError as exc:failure(exc)
@app.delete("/api/exams/{exam_id}",status_code=204)
def remove_exam(exam_id:int=ApiPath(ge=1,le=2**53-1)):
    if not storage.delete_exam(exam_id):raise HTTPException(404,"Examination not found.")
@app.get("/api/analytics")
def analytics(from_date:str="",to_date:str="",subject:str="",search:str=""):
    try: return build_analytics(storage.list_exams(search=search,subject=subject,from_date=from_date,to_date=to_date,direction="asc"))
    except ValueError as exc: failure(exc)
@app.get("/api/subjects")
def get_subjects():return storage.subjects()

@app.get('/api/metadata')
def get_metadata():return metadata.list_metadata()

@app.patch('/api/metadata/{kind}/{identifier}')
def rename_metadata(kind:str,identifier:int,data:dict):
    try:return metadata.change(kind,identifier,data.get('name'))
    except sqlite3.IntegrityError:raise HTTPException(409,'metadataDuplicate')
    except storage.ExaminationNotFoundError as exc:raise HTTPException(404,str(exc))
    except ValueError as exc:failure(exc)

@app.delete('/api/metadata/{kind}/{identifier}')
def remove_metadata(kind:str,identifier:int):
    try:return metadata.change(kind,identifier,delete=True)
    except storage.ExaminationNotFoundError as exc:raise HTTPException(404,str(exc))
    except ValueError as exc:failure(exc)

@app.get('/api/export/xlsx')
@app.get('/api/export/pdf')
def exam_document(request: Request, language:str='en',digits:str='native',from_date:str='',to_date:str='',subject:str='',search:str=''):
    if language not in ('en','fa') or digits not in ('native','latin'):raise HTTPException(422,'Invalid locale.')
    scope=dict(from_date=from_date,to_date=to_date,subject=subject,search=search)
    try:rows=storage.list_exams(direction='asc',**scope)
    except ValueError as exc:failure(exc)
    extension=request.url.path.rsplit('/',1)[-1]
    if extension=='pdf' and len(rows)>500:raise HTTPException(422,'reportLimit')
    try:
        content=exam_reports.pdf(rows,language,digits,scope) if extension=='pdf' else exam_reports.excel(rows,language,digits,scope)
    except BrowserUnavailable as exc:raise HTTPException(503,'studyPdfUnavailable') from exc
    except Exception as exc:
        logging.getLogger(__name__).exception('Examination report failed')
        raise HTTPException(500,'reportFailed') from exc
    mime='application/pdf' if extension=='pdf' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    return Response(content,media_type=mime,headers={'Content-Disposition':f'attachment; filename="verity-exams.{extension}"'})

@app.post('/api/score-preview')
def score_preview(data:dict[str,Any]):
    try:
        defaults=storage.preferences()
        counts=[storage._integer(data.get(k),k) for k in ('total_questions','correct_answers','incorrect_answers')]
        weights=[number(data.get(k,defaults[k]),k,1e-100 if k=='correct_weight' else -1e100 if k=='unanswered_weight' else 0) for k in ('correct_weight','incorrect_weight','unanswered_weight')]
        return asdict(calculate_score(*counts,*weights))
    except ValueError as exc: failure(exc)

@app.get('/api/comparison')
def comparison(first_from:str,first_to:str,second_from:str,second_to:str,subject:str='',search:str=''):
    try:
        if not all((first_from,first_to,second_from,second_to)): raise ValueError('Both closed date ranges are required.')
        return compare(storage.list_exams(search=search,subject=subject,from_date=first_from,to_date=first_to),
                       storage.list_exams(search=search,subject=subject,from_date=second_from,to_date=second_to))
    except ValueError as exc: failure(exc)

@app.get('/api/simulation')
def simulation(probability:float=Query(ge=0,le=1),from_date:str='',to_date:str='',subject:str='',search:str=''):
    try:return simulate(storage.list_exams(search=search,subject=subject,from_date=from_date,to_date=to_date),probability)
    except ValueError as exc:failure(exc)
@app.get("/api/settings")
def get_settings():return storage.preferences()
@app.patch("/api/settings")
def settings(data:dict[str,Any]):
    try: return storage.update_preferences(data)
    except (ValueError, TypeError) as exc: failure(exc)
@app.get("/api/export/json")
def export_json(from_date:str='',to_date:str='',subject:str='',search:str=''):
    try:return JSONResponse(storage.export_json(from_date=from_date,to_date=to_date,subject=subject,search=search),headers={"Content-Disposition":"attachment; filename=verity-export.json"})
    except ValueError as exc:failure(exc)
@app.get("/api/export/csv")
def export_csv(language:str='en',from_date:str='',to_date:str='',subject:str='',search:str=''):
    if language not in ('en','fa'):raise HTTPException(422,'Language must be en or fa.')
    try:data=storage.export_csv(language=language,from_date=from_date,to_date=to_date,subject=subject,search=search)
    except ValueError as exc:failure(exc)
    return PlainTextResponse(data,media_type="text/csv",headers={"Content-Disposition":"attachment; filename=verity-export.csv"})
@app.post("/api/import")
async def import_data(file:UploadFile=File(...),allow_duplicate:bool=False,preview:bool=False):
    try:
        content=(await file.read()).decode('utf-8-sig')
        from .interchange import csv_payload
        payload=csv_payload(content) if (file.filename or '').lower().endswith('.csv') else json.loads(content)
        return storage.import_json(payload,allow_duplicate,preview)
    except (ValueError,RecursionError) as exc:failure(exc)
@app.get("/api/backup")
def get_backup():
    fd, name = tempfile.mkstemp(suffix="-verity-backup.db")
    os.close(fd)
    temporary=Path(name)
    try: storage.backup(temporary)
    except Exception:
        remove_temporary_file(temporary)
        raise
    return FileResponse(temporary,filename="verity-backup.db",background=BackgroundTask(remove_temporary_file, temporary))
@app.post("/api/restore")
async def restore(file:UploadFile=File(...)):
    fd, name = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    temporary=Path(name)
    try:
        temporary.write_bytes(await file.read())
        recovery = storage.restore(temporary)
        return {"restored":True, "recovery_backup":recovery.name}
    except ValueError as exc:
        failure(exc)
    finally:
        remove_temporary_file(temporary)
