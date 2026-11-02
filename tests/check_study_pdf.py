"""Opt-in real-browser PDF integration: python -m tests.check_study_pdf.

Requires installed Edge/Chrome or `python -m playwright install chromium`.
Produces review artifacts from temporary test records; never opens personal data.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from fastapi.testclient import TestClient
from app import storage, study
from app.main import app


def main():
    previous=storage.DB_PATH
    output=Path('outputs/study');output.mkdir(parents=True,exist_ok=True)
    try:
        with TemporaryDirectory(prefix='verity-study-pdf-') as folder:
            storage.DB_PATH=Path(folder)/'test.db';storage.initialize()
            study.save_week('2026-10-24',dict(revision=0,notes='Weekly aggregate — گزارش مجموع هفتگی',entries=[
                dict(category_id=8,minutes=315,description='Free tag programming — برنامه‌نویسی تگ آزاد'),
                dict(category_id=6,minutes=90,description='Stage 1, Course 32 — مرحله اول، دوره ۳۲'),
                dict(category_id=7,details=[dict(label='Analysis of Stage 1, Course 31 — تحلیل مرحله اول، دوره ۳۱',minutes=225),dict(label='Analysis of Stage 1, Course 32 — تحلیل مرحله اول، دوره ۳۲',minutes=45)]),
                dict(category_id=2,minutes=325),dict(category_id=3,minutes=465)]))
            with TestClient(app,base_url='http://127.0.0.1') as client:
                for language in ('en','fa'):
                    response=client.get('/api/study/export',params=dict(format='pdf',language=language))
                    assert response.status_code==200,response.text
                    assert response.content.startswith(b'%PDF-') and len(response.content)>10000
                    (output/f'weekly-{language}.pdf').write_bytes(response.content)
                    print(f'{language}: downloadable PDF verified ({len(response.content)} bytes)')
    finally:storage.DB_PATH=previous


if __name__=='__main__':main()
