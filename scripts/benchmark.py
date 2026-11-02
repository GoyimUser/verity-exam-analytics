"""Disposable 10,000-exam / 1,000-week workload with query-count evidence."""
import json
import sys
import tempfile
import time
from datetime import date,timedelta
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import storage,study
from app.analytics import build_analytics


def run():
    original=storage.DB_PATH
    try:
        with tempfile.TemporaryDirectory(prefix='verity-benchmark-') as directory:
            storage.DB_PATH=Path(directory)/'benchmark.db';storage.initialize()
            seed=storage.save_exam({'title':'Seed','exam_date':'2020-01-01','total_questions':15,'correct_answers':3,'incorrect_answers':4,'tags':['benchmark']})
            with storage.database() as db:
                columns=[r[1] for r in db.execute('PRAGMA table_info(exams)') if r[1]!='id']
                data=[]
                for i in range(1,10000):
                    row=dict(seed,title=f'Exam {i}',exam_date=(date(2000,1,1)+timedelta(days=i)).isoformat(),revision=f'{i:032x}')
                    data.append([row[c] for c in columns])
                db.executemany(f'INSERT INTO exams({",".join(columns)}) VALUES({",".join("?" for _ in columns)})',data)
                for i in range(1000):
                    start=(date(2000,1,1)+timedelta(weeks=i)).isoformat()
                    db.execute('INSERT INTO study_weeks VALUES(?,?,?,?,?)',(start,'',i+1,storage.now(),storage.now()))
                    db.execute('INSERT INTO study_entries(week_start,category_id,video,name_en,name_fa,study_group,minutes,description) VALUES(?,1,0,?,?,?,60,?)',(start,'Parity','زوجیت','theoretical',''))
            queries=[];connect=storage.connect
            def traced():
                db=connect();db.set_trace_callback(queries.append);return db
            storage.connect=traced
            try:
                start=time.perf_counter();page=storage.list_exams(limit=50,offset=5000);history=time.perf_counter()-start;exam_queries=len([q for q in queries if q.startswith('SELECT')]);queries.clear()
                start=time.perf_counter();weeks=study.list_weeks();study_seconds=time.perf_counter()-start;study_queries=len([q for q in queries if q.startswith('SELECT')])
                start=time.perf_counter();analytics=build_analytics(storage.list_exams());analytics_seconds=time.perf_counter()-start
            finally:storage.connect=connect
            assert len(page)==50 and len(weeks)==1000 and analytics['count']==10000
            assert exam_queries==2 and study_queries==3
            return {'exams':10000,'weeks':1000,'history_page':50,'exam_queries':exam_queries,'study_queries':study_queries,'history_seconds':history,'study_seconds':study_seconds,'full_analytics_seconds':analytics_seconds}
    finally:storage.DB_PATH=original


if __name__=='__main__':
    result=run();target=Path('output/benchmark.json');target.parent.mkdir(exist_ok=True);target.write_text(json.dumps(result,indent=2));print(json.dumps(result))
