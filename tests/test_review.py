"""Regression cases reproduced by the November 2026 whole-project review."""
import csv
import io
import json
import sqlite3
import unittest
from contextlib import closing
from pathlib import Path
from fastapi.testclient import TestClient
from app import storage,study
from app.main import app
from app.analytics import build_analytics
from tests import test_storage


class ReviewTests(unittest.TestCase):
    setUp=test_storage.StorageTests.setUp
    tearDown=test_storage.StorageTests.tearDown
    payload=test_storage.StorageTests.payload

    def test_study_stale_token_after_delete_recreate_and_restore(self):
        data=dict(revision=0,entries=[dict(category_id=1,minutes=10)])
        first=study.save_week('2026-10-31',data)
        study.delete_week(first['week_start'],first['revision'])
        storage.initialize()
        new=study.save_week(first['week_start'],dict(data,entries=[dict(category_id=1,minutes=20)]))
        self.assertGreater(new['revision'],first['revision'])
        with self.assertRaises(study.StudyError):study.save_week(first['week_start'],dict(data,revision=first['revision']))
        with self.assertRaises(study.StudyError):study.delete_week(first['week_start'],first['revision'])
        backup=Path(self.directory.name)/'study.db';storage.backup(backup)
        storage.restore(backup)
        with self.assertRaises(study.StudyError):study.save_week(first['week_start'],dict(data,revision=new['revision']))
        self.assertEqual(study.get_week(first['week_start'])['totals']['overall'],20)
        self.assertNotIn('internal_study_revision',storage.preferences())

    def test_origin_and_host_boundary_for_browser_launch(self):
        with TestClient(app,base_url='http://127.0.0.1') as client:
            for origin in ['https://unrelated.example','null','http://localhost','http://127.0.0.1:9000']:
                self.assertEqual(client.post('/api/exams',json=self.payload(),headers={'Origin':origin}).status_code,403)
            self.assertEqual(client.get('/api/exams',headers={'Host':'unrelated.example'}).status_code,400)
            self.assertEqual(client.post('/api/exams',json=self.payload(),headers={'Sec-Fetch-Site':'cross-site'}).status_code,403)
            self.assertEqual(storage.list_exams(),[])
            self.assertEqual(client.post('/api/exams',json=self.payload(),headers={'Origin':'http://127.0.0.1'}).status_code,201)
            self.assertEqual(client.get('/api/exams').status_code,200)
        # Exercise the actual Host middleware without older Starlette test
        # transports mis-parsing an IPv6 literal as a port number.
        for host in ['localhost','[::1]']:
            with TestClient(app,base_url='http://127.0.0.1') as client:
                self.assertEqual(client.get('/api/settings',headers={'Host':host}).status_code,200)

    def test_filtered_export_scope_and_formula_safe_text(self):
        storage.save_exam(dict(self.payload(),title='=1+1',subject='@Math',notes='+command',tags=['-tag'],correct_answers=0,incorrect_answers=4))
        storage.save_exam(dict(self.payload(),title='Other',exam_date='2026-09-01'))
        with TestClient(app,base_url='http://127.0.0.1') as client:
            scope=dict(from_date='2026-10-01',subject='@Math',search='=1+1')
            records=client.get('/api/exams',params=scope).json()
            result=client.get('/api/export/json',params=scope).json()
            self.assertEqual([r['id'] for r in result['exams']],[r['id'] for r in records])
            self.assertEqual(len(result['exams']),1)
            for language in ['en','fa']:
                response=client.get('/api/export/csv',params=dict(scope,language=language))
                rows=list(csv.reader(io.StringIO(response.content.decode('utf-8-sig'))))
                self.assertEqual(len(rows),2)
                for index in [0,1,14]:self.assertTrue(rows[1][index].startswith("'"))
                self.assertEqual(float(rows[1][9]),-4)
            for endpoint in ['json','csv']:
                self.assertEqual(client.get('/api/export/'+endpoint,params={'from_date':'2026-02-30'}).status_code,422)

    def test_local_host_rejects_malformed_authorities(self):
        with TestClient(app,base_url='http://127.0.0.1') as client:
            for host in ['localhost:', 'localhost:0', 'localhost:65536', 'localhost:abc',
                         'user@localhost', 'localhost/path', 'localhost?x',
                         'localhost#x', 'localhost.evil.example', '::1', '[::1]:0']:
                with self.subTest(host=host):
                    self.assertEqual(client.get('/api/settings',headers={'Host':host}).status_code,400)
            self.assertEqual(client.get('/api/settings',headers=[('Host','localhost'),('Host','localhost')]).status_code,400)
            for host in ['localhost:8000','127.0.0.1:65535','[::1]:8000','LOCALHOST']:
                self.assertEqual(client.get('/api/settings',headers={'Host':host}).status_code,200)

    def test_single_exam_report_has_visible_marker(self):
        from app.exam_reports import html_report
        storage.save_exam(self.payload())
        for language in ['en','fa']:
            html=html_report(storage.list_exams(),language,'native')
            self.assertEqual(html.count('<circle '),1)
            self.assertIn('r="3"',html)

    def test_restore_validates_write_domains_without_replacing_data(self):
        storage.save_exam(self.payload())
        study.save_week('2026-10-31',dict(revision=0,entries=[dict(category_id=1,details=[dict(label='Review',minutes=45)])]))
        original=storage.list_exams()
        for sql in ["UPDATE preferences SET value='1e200' WHERE key='correct_weight'",
                    "UPDATE preferences SET value='-1' WHERE key='internal_study_revision'",
                    "UPDATE study_categories SET display_order=1.5 WHERE id=1",
                    "UPDATE study_details SET label=''",
                    "UPDATE study_weeks SET revision=1.5",
                    "UPDATE study_weeks SET notes=char(0)"]:
            with self.subTest(sql=sql):
                target=Path(self.directory.name)/'bad.db';storage.backup(target)
                with closing(sqlite3.connect(target)) as db:db.execute(sql);db.commit()
                with self.assertRaises(ValueError):storage.restore(target)
                self.assertEqual(storage.list_exams(),original)
                self.assertEqual(study.get_week('2026-10-31')['totals']['overall'],45)

    def test_subject_and_topic_names_are_not_sentinel_or_separator_keys(self):
        storage.save_exam(dict(self.payload(),title='Missing',subject=None,topic=None))
        storage.save_exam(dict(self.payload(),title='Literal',subject='Unassigned',topic=None))
        storage.save_exam(dict(self.payload(),title='Slash1',subject='A / B',topic='C'))
        storage.save_exam(dict(self.payload(),title='Slash2',subject='A',topic='B / C'))
        result=build_analytics(storage.list_exams())
        self.assertEqual(len(result['subjects']),4)
        self.assertTrue(all(row['count']==1 for row in result['subjects']))
        self.assertEqual(len(result['extended']['topics']),4)
        self.assertEqual(len(result['heatmap']['subjects']),4)
        self.assertEqual({row['subject'] for row in result['subjects']},{None,'Unassigned','A / B','A'})

    def test_import_versions_fail_before_any_changes(self):
        for version in [2,999,True,None,'1']:
            with self.assertRaises(ValueError):storage.import_json(dict(version=version,exams=[self.payload()]))
            self.assertEqual(storage.list_exams(),[])
        self.assertEqual(storage.import_json(dict(version=1,exams=[self.payload()]))['created'],1)
