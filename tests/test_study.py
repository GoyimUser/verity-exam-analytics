"""Weekly aggregate contracts, using disposable databases only."""
import csv
import io
import sqlite3
import unittest
from contextlib import closing
from datetime import date, timedelta
from pathlib import Path
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from app import storage, study, study_reports
from app.main import app
from tests import test_storage


class StudyTests(unittest.TestCase):
    setUp = test_storage.StorageTests.setUp
    tearDown = test_storage.StorageTests.tearDown
    payload = test_storage.StorageTests.payload

    def entry(self, code, minutes=0, **kwargs):
        category = next(c for c in study.categories() if c['code'] == code)
        return dict(category_id=category['id'], minutes=minutes, **kwargs)

    def save(self, entries, when='2026-10-17', revision=0):
        return study.save_week(when, dict(entries=entries, revision=revision))

    def test_every_date_maps_to_saturday_friday_across_years(self):
        for offset in range(800):
            chosen = date(2023, 12, 20) + timedelta(days=offset)
            start, end = map(date.fromisoformat, study.week_bounds(chosen.isoformat()))
            self.assertEqual(start.weekday(), 5)
            self.assertEqual(end.weekday(), 4)
            self.assertEqual((end-start).days, 6)
            self.assertLessEqual(start, chosen)
            self.assertGreaterEqual(end, chosen)
        self.assertEqual(study.week_bounds('2026-10-23'), ('2026-10-17','2026-10-23'))
        self.assertEqual(study.week_bounds('2026-10-24')[0], '2026-10-24')
        for invalid in ['0001-01-01', '9999-12-31', '2026-02-30', '20261017', None]:
            with self.assertRaises(study.StudyError): study.week_bounds(invalid)

    def test_default_parents_and_video_are_independent_entries(self):
        self.assertEqual(len(study.categories()), 11)
        self.assertEqual(sum(c['study_group']=='theoretical' for c in study.categories()), 7)
        result=self.save([self.entry('binary-search',60),self.entry('binary-search',295,video=True)])
        self.assertEqual(result['totals'], dict(theoretical=0,practical=355,overall=355))
        self.assertEqual(len(result['entries']), 2)

    def test_verified_report_examples_and_detail_override(self):
        a=self.save([self.entry('parity',260),self.entry('counting',220),self.entry('invariants',165),self.entry('programming',210)])
        self.assertEqual(a['totals'], dict(theoretical=645,practical=210,overall=855))
        b=self.save([self.entry('programming',315),self.entry('exam',90),self.entry('analysis',999,details=[dict(label='Stage 1, course 31',minutes=225),dict(label='Stage 1, course 32',minutes=45)]),self.entry('counting',325),self.entry('invariants',465)],'2026-10-24')
        self.assertEqual(b['totals'], dict(theoretical=1150,practical=315,overall=1465))
        with storage.database() as db:
            self.assertIsNone(db.execute('SELECT minutes FROM study_entries WHERE category_id=7').fetchone()[0])
        c=self.save([self.entry('programming',270),self.entry('binary-search',295,video=True),self.entry('contest',40),self.entry('parity',355),self.entry('counting',115),self.entry('exam',210),self.entry('analysis',125)],'2026-10-03')
        self.assertEqual(c['totals'], dict(theoretical=805,practical=605,overall=1410))

    def test_durations_and_malformed_records_are_atomic(self):
        self.assertEqual(study.duration(3,30),210)
        for h,m in [(3,60),(-1,0),(0,-1),(1.2,0),(True,0),(168,1)]:
            with self.assertRaises(study.StudyError): study.duration(h,m)
        cases=[[self.entry('parity',x)] for x in [-1,True,1.2,None,'60',10081]]
        cases += [[self.entry('parity',6000),self.entry('counting',6000)],
                  [self.entry('parity',10),self.entry('parity',20)],
                  [self.entry('parity',10,details=[dict(label='',minutes=5)])]]
        for rows in cases:
            with self.assertRaises(study.StudyError): self.save(rows)
            self.assertEqual(study.get_week('2026-10-17')['revision'],0)
        self.assertEqual(self.save([self.entry('parity',10080)])['totals']['overall'],10080)
        for invalid in ['bad\x00text','bad\ufffftext','bad\ud800text']:
            with self.assertRaises(study.StudyError):study.text(invalid)

    def test_week_unique_revision_update_delete_and_persistence(self):
        first=self.save([self.entry('parity',60)])
        with self.assertRaises(study.StudyError) as conflict:self.save([], '2026-10-23')
        self.assertEqual(conflict.exception.status,409)
        second=self.save([self.entry('parity',120)], '2026-10-23', revision=1)
        self.assertEqual(second['created_at'],first['created_at'])
        self.assertEqual(second['revision'],2)
        storage.initialize()
        self.assertEqual(len(study.list_weeks()),1)
        self.assertEqual(study.get_week('2026-10-20')['totals']['overall'],120)
        with self.assertRaises(study.StudyError):study.delete_week('2026-10-17',1)
        study.delete_week('2026-10-17',2)
        self.assertEqual(study.list_weeks(),[])
        with storage.database() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM study_entries').fetchone()[0],0)

    def test_category_edits_keep_snapshots_and_disabled_history(self):
        row=self.entry('parity',60)
        self.save([row])
        study.save_category(dict(name_en='New name',name_fa='نام تازه',study_group='practical',color='#123456',description='Changed',display_order=50),row['category_id'])
        old=self.save([dict(row,minutes=90)],revision=1)
        self.assertEqual(old['entries'][0]['name_en'],'Parity')
        self.assertEqual(old['totals']['theoretical'],90)
        new=self.save([row],'2026-10-24')
        self.assertEqual(new['entries'][0]['name_en'],'New name')
        self.assertEqual(new['totals']['practical'],60)
        study.save_category(dict(enabled=False),row['category_id'])
        self.save([row],revision=2)
        with self.assertRaises(study.StudyError):self.save([row],'2026-10-31')
        custom=study.save_category(dict(name_en='Graphs',name_fa='گراف',study_group='practical',color='#aabbcc'))
        self.assertIsNone(custom['code'])
        storage.initialize()
        self.assertEqual(len(study.categories()),12)

    def test_analytics_missing_weeks_zero_weeks_filter_and_month_allocation(self):
        self.save([self.entry('parity',60)],'2026-09-26')
        self.save([self.entry('programming',180)],'2026-10-03')
        self.save([],'2026-10-17')
        a=study.analytics(study.list_weeks())
        self.assertEqual(a['average_minutes'],80)
        self.assertEqual(a['median_minutes'],60)
        self.assertAlmostEqual(a['std_minutes'],74.8331477355)
        self.assertEqual([w['change_minutes'] for w in a['weeks']],[None,120,None])
        self.assertEqual(a['months'],[dict(month='2026-09',minutes=60,count=1),dict(month='2026-10',minutes=180,count=2)])
        self.assertEqual(a['shares']['theoretical'],25)
        filtered=study.list_weeks('2026-10-09','2026-10-23',self.entry('parity')['category_id'])
        self.assertEqual(len(filtered),2)
        self.assertEqual(sum(w['totals']['overall'] for w in filtered),0)
        self.assertIsNone(study.analytics([])['average_minutes'])
        self.assertIsNone(study.analytics([a['weeks'][0]])['std_minutes'])
        self.assertIsNone(study.analytics(filtered)['shares']['theoretical'])

    def test_jalali_date_round_trip_and_months(self):
        from app.calendar_localization import persian_parts
        self.assertEqual(persian_parts(date(2026,10,17)),(1405,7,25))
        self.assertEqual(persian_parts(date(2124,3,22)),(1503,1,3))
        self.save([self.entry('parity',45)],'2026-10-17')
        self.assertEqual(study.analytics(study.list_weeks(),'persian')['months'][0]['month'],'1405-07')
        self.assertIn('۲۵ مهر ۱۴۰۵',study_reports.date_label('2026-10-17','fa'))
        self.assertIn('25 مهر 1405',study_reports.date_label('2026-10-17','fa','latin'))

    def test_modes_preferences_and_exams_are_independent(self):
        original=storage.save_exam(self.payload())
        self.save([self.entry('parity',210)])
        for mode in ['quick','advanced']:
            storage.update_preferences(dict(application_mode=mode,language='fa'))
            storage.initialize()
            self.assertEqual(study.get_week('2026-10-17')['totals']['overall'],210)
            self.assertEqual({k:v for k,v in storage.get_exam(original['id']).items() if k!='revision'},{k:v for k,v in original.items() if k!='revision'})

    def test_legacy_migration_and_backup_restore_include_study(self):
        original=storage.save_exam(self.payload())
        with storage.database() as db:
            for table in ['study_details','study_entries','study_weeks','study_categories']:db.execute('DROP TABLE '+table)
            db.execute('DELETE FROM schema_migrations WHERE version IN (3,4,5)')
            db.execute('DROP TRIGGER exam_domain_insert');db.execute('DROP TRIGGER exam_domain_update')
            db.execute('ALTER TABLE exams DROP COLUMN revision');db.execute('ALTER TABLE exams DROP COLUMN unanswered_weight')
        legacy=Path(self.directory.name)/'legacy.db';storage.backup(legacy)
        storage.initialize()
        self.assertEqual({k:v for k,v in storage.get_exam(original['id']).items() if k!='revision'},{k:v for k,v in original.items() if k!='revision'})
        self.save([self.entry('parity',210,details=[dict(label='Review',minutes=90)])])
        backup=Path(self.directory.name)/'complete.db';storage.backup(backup)
        study.delete_week('2026-10-17',1)
        storage.restore(backup)
        self.assertEqual(study.get_week('2026-10-17')['totals']['overall'],90)
        with closing(sqlite3.connect(backup)) as db:
            db.execute('UPDATE study_entries SET minutes=99')
            db.commit()
        with self.assertRaises(ValueError):storage.restore(backup)
        self.assertEqual(study.get_week('2026-10-17')['totals']['overall'],90)
        storage.restore(legacy)
        self.assertEqual(len(study.categories()),11)
        self.assertEqual(study.list_weeks(),[])
        self.assertEqual({k:v for k,v in storage.get_exam(original['id']).items() if k!='revision'},{k:v for k,v in original.items() if k!='revision'})

    def test_reports_numeric_values_bidi_safe_html_and_formula_safety(self):
        w=self.save([self.entry('parity',210,description='=HYPERLINK("bad")'),self.entry('counting',0),self.entry('binary-search',45,video=True,details=[dict(label='<script>bad()</script>',minutes=45)])])
        en=study_reports.report_text(w)
        self.assertIn('Overall total: 4 h 15 m',en)
        self.assertNotIn('Counting:',en)
        self.assertIn('Binary Search · Video:',en)
        fa=study_reports.report_text(w,'fa')
        self.assertIn('۴ ساعت ۱۵ دقیقه',fa)
        rows=list(csv.reader(io.StringIO(study_reports.csv_report([w],'en','native').decode('utf-8-sig'))))
        self.assertEqual(rows[1][4],'210')
        self.assertTrue(rows[1][6].startswith("'="))
        book=load_workbook(io.BytesIO(study_reports.excel_report([w],'fa','native')))
        self.assertTrue(book.active.sheet_view.rightToLeft)
        self.assertEqual(book.active['E2'].value,210)
        self.assertEqual(len(book.worksheets[1]._charts),1)
        html=study_reports.report_html([w],'fa')
        self.assertIn('dir="rtl"',html)
        self.assertIn('data:font/truetype;base64',html)
        self.assertNotIn('<script>bad()',html)

    def test_api_endpoints_validation_and_scope_exports(self):
        with TestClient(app,base_url='http://127.0.0.1') as client:
            self.assertEqual(len(client.get('/api/study/categories').json()),11)
            saved=client.put('/api/study/weeks/2026-10-20',json=dict(entries=[self.entry('parity',210)],revision=0))
            self.assertEqual(saved.status_code,200)
            self.assertEqual(saved.json()['week_start'],'2026-10-17')
            self.assertEqual(client.put('/api/study/weeks/2026-10-17',json=dict(revision=1)).status_code,422)
            self.assertEqual(client.get('/api/study/weeks/2026-10-17').json()['totals']['overall'],210)
            self.assertEqual(client.put('/api/study/weeks/2026-10-23',json=dict(entries=[],revision=0)).status_code,409)
            for endpoint in ['weeks/0001-01-01','weeks/9999-12-31','analytics?calendar=iso','analytics?from_date=2026-10-30&to_date=2026-10-01','export?format=invalid']:
                self.assertEqual(client.get('/api/study/'+endpoint).status_code,422,endpoint)
            self.assertEqual(client.patch('/api/study/categories/'+str(10**100),json={}).status_code,422)
            for fmt in ['text','csv','xlsx']:
                response=client.get('/api/study/export',params=dict(format=fmt,language='fa',from_date='2026-10-20',to_date='2026-10-23'))
                self.assertEqual(response.status_code,200)
                self.assertIn('attachment',response.headers['content-disposition'])
            self.assertEqual(client.delete('/api/study/weeks/2026-10-17?revision=1').status_code,204)
            self.assertEqual(client.get('/api/study/export').status_code,404)
