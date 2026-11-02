from fastapi import APIRouter, HTTPException, Query, Path
from fastapi.responses import Response
from . import study, study_reports
from .pdf_render import BrowserUnavailable
import logging

router=APIRouter(prefix='/api/study',tags=['Weekly study'])

@router.get('/categories')
def categories():return study.categories()

@router.post('/categories',status_code=201)
def create_category(data:dict):return study.save_category(data)

@router.patch('/categories/{category_id}')
def edit_category(data:dict,category_id:int=Path(ge=1,le=2**31-1)):return study.save_category(data,category_id)

@router.get('/weeks/{value}')
def week(value:str):return study.get_week(value)

@router.put('/weeks/{value}')
def save_week(value:str,data:dict):return study.save_week(value,data)

@router.delete('/weeks/{value}',status_code=204)
def delete_week(value:str,revision:int=Query(ge=1,le=2**53-1)):study.delete_week(value,revision)

@router.get('/analytics')
def analytics(from_date:str='',to_date:str='',category_id:int|None=Query(default=None,ge=1),calendar:str='gregorian'):
    if calendar not in ('gregorian','persian'):raise study.StudyError('studyInvalidDate')
    return study.analytics(study.list_weeks(from_date,to_date,category_id),calendar)

@router.get('/export')
def export(format:str='text',from_date:str='',to_date:str='',category_id:int|None=Query(default=None,ge=1),language:str='en',digits:str='native'):
    if language not in ('en','fa') or digits not in ('native','latin'):raise study.StudyError('studyInvalidText')
    weeks=study.list_weeks(from_date,to_date,category_id)
    if not weeks:raise study.StudyError('studyNoReports',404)
    if format=='text':content='\n\n'.join(study_reports.report_text(w,language,digits) for w in weeks);mime='text/plain';extension='txt'
    elif format=='csv':content=study_reports.csv_report(weeks,language,digits);mime='text/csv';extension='csv'
    elif format=='xlsx':content=study_reports.excel_report(weeks,language,digits);mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';extension='xlsx'
    elif format=='pdf':
        if len(weeks)>52:raise study.StudyError('studyPdfLimit')
        try:content=study_reports.pdf_report(weeks,language,digits)
        except BrowserUnavailable as exc:raise HTTPException(503,'studyPdfUnavailable') from exc
        except Exception as exc:
            logging.getLogger(__name__).exception('Study PDF generation failed')
            raise HTTPException(500,'reportFailed') from exc
        mime='application/pdf';extension='pdf'
    else:raise study.StudyError('studyInvalidExport')
    return Response(content,media_type=mime,headers={'Content-Disposition':f'attachment; filename="verity-weekly-study.{extension}"'})
