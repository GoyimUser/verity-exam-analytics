"""Opt-in bilingual PDF rendering and geometry checks using disposable records."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
from app import storage,exam_reports,study,study_reports


def main():
    import pymupdf
    previous=storage.DB_PATH;output=Path('output/pdf/completion');output.mkdir(parents=True,exist_ok=True);results=[]
    try:
        with TemporaryDirectory(prefix='verity-exam-pdf-') as folder:
            storage.DB_PATH=Path(folder)/'test.db';storage.initialize()
            for i in range(2):
                storage.save_exam(dict(title=f'Practice {i+1} — آزمون مرحله اول',subject='Mathematics — ریاضی',topic='Parity — زوجیت',exam_date=f'2026-10-{20+i}',total_questions=15,correct_answers=3 if i else 0,incorrect_answers=4,notes='Review the counting strategy.\nروش شمارش را مرور کنید.',tags=['review','مرور'],start_time='23:45',end_time='00:30'))
            study.save_week('2026-10-24',dict(revision=0,entries=[dict(category_id=1,minutes=210),dict(category_id=8,minutes=90)]))
            for language in ('en','fa'):
                documents={'exams':exam_reports.pdf(storage.list_exams(direction='asc'),language,'native',{}),'study':study_reports.pdf_report(study.list_weeks(),language,'native')}
                for kind,content in documents.items():
                    path=output/f'{kind}-{language}.pdf';path.write_bytes(content);doc=pymupdf.open(stream=content,filetype='pdf')
                    assert len(doc)>0
                    for index,page in enumerate(doc):
                        text=page.get_text();assert len(text)>30
                        for block in page.get_text('blocks'):
                            assert block[0]>=0 and block[2]<=page.rect.width+1,(path,index,block[:4])
                        page.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save(output/f'{kind}-{language}-{index+1}.png')
                    results.append(dict(document=path.name,pages=len(doc),bytes=len(content)))
                    doc.close()
    finally:storage.DB_PATH=previous
    (output/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))


if __name__=='__main__':main()
