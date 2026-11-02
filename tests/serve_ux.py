"""Launch UI review fixtures in an automatically cleaned temporary database.

Run: python -m tests.serve_ux (http://127.0.0.1:8002).
"""
import tempfile
import os
from datetime import date, timedelta
from pathlib import Path
import uvicorn
from app import storage, study
from app.main import app

if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='verity-ux-') as temporary:
        storage.DB_PATH = Path(temporary) / 'review.db'
        storage.initialize()
        for index in range(18):
            storage.save_exam({
                'title': f'Practice {index + 1} — آزمون تمرینی با عنوان طولانی برای بررسی نمایش',
                'exam_date': (date(2026, 9, 1) + timedelta(days=index*3)).isoformat(),
                'total_questions': 15, 'correct_answers': 3 + index % 12,
                'incorrect_answers': 1, 'subject': ['Mathematics', 'فیزیک'][index % 2],
                'notes': 'Temporary UI fixture — داده موقت بررسی رابط کاربری',
                'tags': ['timed', 'مرور'], 'duration_minutes': 30,
            })
        for index in range(8):
            study.save_week((date(2026,9,5)+timedelta(weeks=index)).isoformat(), {
                'revision':0, 'notes':'Disposable study fixture — داده آزمایشی مطالعه',
                'entries':[{'category_id':1,'minutes':220+index*15},
                           {'category_id':2,'minutes':170+index*10},
                           {'category_id':8,'minutes':210+index*12},
                           {'category_id':9,'video':True,'minutes':65+index*20},
                           {'category_id':7,'details':[{'label':'Stage 1, course 31 — تحلیل مرحله اول','minutes':225},{'label':'Course 32 — دوره ۳۲','minutes':45}]}]})
        uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('VERITY_TEST_PORT','8002')), access_log=False)
