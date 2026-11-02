"""Acceptance regressions for the remaining review queue."""
import io
import json
import sqlite3
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from app import storage,study,metadata,exam_reports
from app.main import app
from app.migrations import migrate
from app.scoring import calculate_score
from app.statistics_extra import simulate
from app.interchange import csv_payload
from app.pdf_render import BrowserUnavailable
from tests import test_storage


class CompletionTests(unittest.TestCase):
    setUp=test_storage.StorageTests.setUp
    tearDown=test_storage.StorageTests.tearDown
    payload=test_storage.StorageTests.payload

    def test_index_versions_assets_and_disallows_stale_html(self):
        import hashlib
        with TestClient(app,base_url='http://127.0.0.1') as client:
            response=client.get('/')
            digest=hashlib.sha256(Path('static/app.js').read_bytes()).hexdigest()[:16]
            self.assertEqual(response.headers['cache-control'],'no-store')
            self.assertIn('/static/app.js?v='+digest,response.text)
            self.assertIn('/static/translations.js?v=',response.text)

    def test_stale_exam_edit_and_restore_revision(self):
        row=storage.save_exam(self.payload())
        with TestClient(app,base_url='http://127.0.0.1') as client:
            latest=client.patch(f'/api/exams/{row["id"]}',json={'notes':'New','revision':row['revision']}).json()
            self.assertNotEqual(latest['revision'],row['revision'])
            self.assertEqual(client.patch(f'/api/exams/{row["id"]}',json={'notes':'Stale','revision':row['revision']}).status_code,409)
            self.assertEqual(storage.get_exam(row['id'])['notes'],'New')
            # Existing integrations can still submit a partial PATCH without a token.
            self.assertEqual(client.patch(f'/api/exams/{row["id"]}',json={'notes':'Legacy'}).status_code,200)
        path=Path(self.directory.name)/'backup.db';storage.backup(path);before=storage.get_exam(row['id'])
        storage.restore(path)
        with self.assertRaises(storage.StaleExamError):storage.save_exam({'revision':before['revision'],'notes':'Old'},row['id'])

    def test_unanswered_weights_snapshot_preview_simulation(self):
        old=storage.save_exam(self.payload())
        storage.update_preferences({'unanswered_weight':-2})
        with TestClient(app,base_url='http://127.0.0.1') as client:
            data=dict(self.payload(),title='Weighted')
            preview=client.post('/api/score-preview',json=data).json();row=client.post('/api/exams',json=data).json()
            self.assertEqual(row['raw_score'],-8);self.assertEqual(row['percentage'],preview['percentage'])
            self.assertEqual(storage.get_exam(old['id'])['raw_score'],8)
            self.assertEqual(simulate([row],.5)['rows'][0]['expected_raw_score'],20)
        with self.assertRaises(ValueError):storage.update_preferences({'unanswered_weight':5})
        self.assertEqual(storage.preferences()['unanswered_weight'],'-2')
        for weight in (float('nan'),float('inf'),True,5):
            with self.assertRaises(ValueError):calculate_score(15,3,4,4,1,weight)

    def test_timing_overnight_and_explicit_duration(self):
        for start,end,explicit,want in [('09:00','10:15',None,75),('23:45','00:30',None,45),('10:00','10:00',None,0),('23:00','01:00',15,15)]:
            row=storage.save_exam(dict(self.payload(),start_time=start,end_time=end,duration_minutes=explicit,allow_duplicate=True))
            self.assertEqual(row['duration_minutes'],want)
        with self.assertRaises(ValueError):storage.save_exam(dict(self.payload(),start_time='25:00'))

    def test_metadata_preserves_relations_and_rejects_used_delete(self):
        row=storage.save_exam(self.payload());ids=(row['subject_id'],row['topic_id'])
        metadata.change('subjects',ids[0],'Renamed');metadata.change('topics',ids[1],'Renamed topic')
        new=storage.get_exam(row['id']);self.assertEqual(new['subject_name'],'Renamed');self.assertEqual(new['topic_name'],'Renamed topic')
        self.assertNotEqual(new['revision'],row['revision']);self.assertEqual(new['raw_score'],row['raw_score'])
        for kind,identifier in zip(('subjects','topics'),ids):
            with self.assertRaises(ValueError):metadata.change(kind,identifier,delete=True)
        storage.delete_exam(row['id']);metadata.change('topics',ids[1],delete=True);metadata.change('subjects',ids[0],delete=True)
        self.assertEqual(metadata.list_metadata(),{'subjects':[],'topics':[]})

    def test_csv_roundtrip_preserves_snapshot_and_formula_text(self):
        row=storage.save_exam(dict(self.payload(),title='=1+1',notes="'quoted",tags=['=tag','comma, tag'],correct_weight=5,incorrect_weight=2,unanswered_weight=-1,start_time='23:30',end_time='00:15'))
        for language in ('en','fa'):
            exported=storage.export_csv(language=language)
            payload=csv_payload(exported);self.assertEqual(payload['exams'][0]['title'],'=1+1')
            with TestClient(app,base_url='http://127.0.0.1') as client:
                preview=client.post('/api/import?preview=true&allow_duplicate=true',files={'file':('exams.csv',exported.encode())})
                self.assertEqual(preview.status_code,200);self.assertEqual(len(storage.list_exams()),1)
            result=storage.import_json(payload,allow_duplicate=True);self.assertEqual(result['created'],1)
            restored=storage.list_exams()[0]
            for key in ('notes','tags','raw_score','percentage','unanswered_weight','created_at','updated_at','duration_minutes','start_time','end_time'):self.assertEqual(restored[key],row[key])
            storage.delete_exam(restored['id'])
        malformed=csv_payload(exported);malformed['exams'].append(dict(malformed['exams'][0],correct_answers=-1))
        with self.assertRaises(ValueError):storage.import_json(malformed,allow_duplicate=True)
        self.assertEqual(len(storage.list_exams()),1)

    def test_excel_scope_numeric_cells_and_safe_text(self):
        storage.save_exam(dict(self.payload(),title='=danger'));storage.save_exam(dict(self.payload(),title='Other',exam_date='2026-09-01'))
        with TestClient(app,base_url='http://127.0.0.1') as client:
            for language in ('en','fa'):
                response=client.get('/api/export/xlsx',params={'from_date':'2026-10-01','language':language})
                self.assertEqual(response.status_code,200)
                book=load_workbook(io.BytesIO(response.content));sheet=book.worksheets[0]
                self.assertEqual(sheet.max_row,2);self.assertEqual(sheet['A2'].value,"'=danger");self.assertEqual(sheet['F2'].value,15)
                self.assertEqual(sheet.sheet_view.rightToLeft,language=='fa');self.assertEqual(len(book.worksheets[1]._charts),1)

    def test_pdf_error_classification_for_both_modules(self):
        storage.save_exam(self.payload());study.save_week('2026-10-31',{'revision':0,'entries':[]})
        with TestClient(app,base_url='http://127.0.0.1') as client:
            for module,url in [('app.study_reports.pdf_report','/api/study/export?format=pdf'),('app.exam_reports.pdf','/api/export/pdf')]:
                with patch(module,side_effect=BrowserUnavailable()):self.assertEqual(client.get(url).json()['detail'],'studyPdfUnavailable')
                with patch(module,side_effect=RuntimeError('render fault')),self.assertLogs(level='ERROR') as logs:
                    response=client.get(url);self.assertEqual(response.status_code,500);self.assertEqual(response.json()['detail'],'reportFailed')
                    self.assertIn('render fault',''.join(logs.output))

    def test_migration_rollback_and_sql_domain_guards(self):
        db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row;db.executescript(storage.SCHEMA)
        db.execute("INSERT INTO schema_migrations VALUES(1,'legacy')");db.commit()
        with patch('app.migrations.install_guards',side_effect=RuntimeError('DDL fault')):
            with self.assertRaises(RuntimeError):
                try:migrate(db,storage.now());db.commit()
                except Exception:db.rollback();raise
        self.assertNotIn('revision',[r[1] for r in db.execute('PRAGMA table_info(exams)')])
        self.assertNotIn(4,[r[0] for r in db.execute('SELECT version FROM schema_migrations')]);db.close()
        row=storage.save_exam(self.payload())
        for change in ['total_questions=1.5','unanswered=0','correct_weight=-1','raw_score=999','duration_minutes=-1','percentage=999']:
            with self.assertRaises(sqlite3.IntegrityError):
                with storage.database() as live:live.execute(f'UPDATE exams SET {change} WHERE id=?',(row['id'],))
        self.assertEqual(storage.get_exam(row['id']),row)

    def test_pagination_and_constant_related_query_count(self):
        with storage.database() as db:
            for i in range(150):storage._save_exam(db,dict(self.payload(),title=f'Exam {i}'))
        seen=[];original=storage.connect
        def traced():
            db=original();db.set_trace_callback(seen.append);return db
        with patch('app.storage.connect',traced):rows=storage.list_exams(limit=50,offset=50)
        self.assertEqual(len(rows),50);self.assertLessEqual(sum(x.startswith('SELECT') for x in seen),2)
        with TestClient(app,base_url='http://127.0.0.1') as client:
            self.assertEqual(len(client.get('/api/exams?limit=50&offset=100').json()),50)
            self.assertEqual(client.get('/api/analytics').json()['count'],150)
        for value in ('2026-10-03','2026-10-10','2026-10-17'):study.save_week(value,{'revision':0,'entries':[{'category_id':1,'minutes':60}]})
        seen.clear()
        with patch('app.storage.connect',traced):weeks=study.list_weeks()
        self.assertEqual(len(weeks),3);self.assertEqual(sum(x.startswith('SELECT') for x in seen),3)

    def test_pdf_html_localized_escaped_metadata(self):
        row=storage.save_exam(dict(self.payload(),title='<script>alert(1)</script>',notes='RTL فارسی'))
        for language in ('en','fa'):
            html=exam_reports.html_report([row],language)
            self.assertIn('dir="rtl"' if language=='fa' else 'dir="ltr"',html)
            self.assertNotIn('<script>alert',html);self.assertIn('<polyline',html);self.assertIn('font/truetype;base64',html)
            self.assertIn(row['created_at'],html)
