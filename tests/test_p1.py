"""P1 contracts: validation is atomic and statistics retain their denominators."""
import asyncio
import json
import unittest
from datetime import date, timedelta
from fastapi.testclient import TestClient
from app import storage
from app.main import app
from app.analytics import build_analytics
from app.statistics_extra import compare, extended, simulate
from app.validation import BodyLimitMiddleware
from tests import test_storage


class P1Tests(unittest.TestCase):
    setUp=test_storage.StorageTests.setUp
    tearDown=test_storage.StorageTests.tearDown
    payload=test_storage.StorageTests.payload

    def test_malformed_boundaries_return_4xx_and_rollback(self):
        malformed={
            'correct_weight':[True,None,{},[],10**400,'Infinity',0,'1e-101'],
            'incorrect_weight':[True,None,{},[],10**400,-1],
            'total_questions':[True,None,{},[],10**100,1.2,'1.2'],
            'duration_minutes':[True,{},[],10**400,'NaN',-1],
            'start_time':[True,{},[],123,'1:20','24:00'],
            'end_time':[{},False,'01:00:00'],
            'title':[[],{},False,'x'*501],
            'notes':[{},[],True,'x'*20001],
            'tags':[None,{},'tag',[{}],['x'*101],['x']*101],
            'attempt_number':[True,{},[],10**100,0],
            'allow_duplicate':['true',1,{}],
        }
        with TestClient(app,base_url='http://127.0.0.1') as client:
            for field,values in malformed.items():
                for value in values:
                    with self.subTest(field=field,value=str(value)[:40]):
                        response=client.post('/api/exams',json={**self.payload(),field:value})
                        self.assertEqual(response.status_code,422,response.text)
                        self.assertIn('detail',response.json())
            for verb in ('get','patch','delete'):
                kw={'json':{}} if verb=='patch' else {}
                self.assertEqual(getattr(client,verb)('/api/exams/'+str(10**100),**kw).status_code,422)
            response=client.post('/api/exams',content=b'{"title":'+b'['*1200+b'0'+b']'*1200+b'}',headers={'Content-Type':'application/json'})
            self.assertIn(response.status_code,(400,422))
        self.assertEqual(storage.list_exams(),[])
        self.assertEqual(storage.subjects(),[])

    def test_settings_rollback_and_finite_numeric_bounds(self):
        before=storage.preferences()
        with TestClient(app,base_url='http://127.0.0.1') as client:
            for value in (None,{},[],True,10**400,'NaN'):
                response=client.patch('/api/settings',json={'language':'fa','correct_weight':value})
                self.assertEqual(response.status_code,422)
                self.assertEqual(storage.preferences(),before)
            self.assertEqual(client.post('/api/exams',json={**self.payload(),'correct_answers':'۳','incorrect_answers':'۴'}).status_code,201)

    def test_request_limit_counts_chunked_bytes(self):
        async def exercise():
            messages=[{'type':'http.request','body':b'x'*(600*1024),'more_body':True},
                      {'type':'http.request','body':b'y'*(600*1024),'more_body':False}]
            output=[]
            async def receive():return messages.pop(0)
            async def send(message):output.append(message)
            async def downstream(*args):self.fail('Oversized request reached the application')
            await BodyLimitMiddleware(downstream)({'type':'http','method':'POST','path':'/api/exams'},receive,send)
            self.assertEqual(output[0]['status'],413)
        asyncio.run(exercise())
        with TestClient(app,base_url='http://127.0.0.1') as client:
            response=client.post('/api/exams',content=b'x'*(1024*1024+1))
            self.assertEqual(response.status_code,413)
            self.assertEqual(response.json()['code'],'body_too_large')

    def test_import_preview_duplicates_and_atomic_failure(self):
        first=storage.save_exam(self.payload())
        valid={**self.payload(),'title':'New','subject':'New subject'}
        invalid={**self.payload(),'title':'Invalid','correct_answers':-1}
        payload={'exams':[first,valid,valid,invalid,None]}
        with TestClient(app,base_url='http://127.0.0.1') as client:
            upload={'file':('import.json',json.dumps(payload),'application/json')}
            preview=client.post('/api/import?preview=true',files=upload)
            self.assertEqual(preview.status_code,200)
            self.assertEqual([r['status'] for r in preview.json()['rows']],['duplicate','accepted','duplicate','invalid','invalid'])
            self.assertEqual(len(storage.list_exams()),1)
            self.assertEqual(storage.subjects(),['Math'])
            rejected=client.post('/api/import',files=upload)
            self.assertEqual(rejected.status_code,422)
            self.assertEqual(len(storage.list_exams()),1)
            self.assertEqual(storage.subjects(),['Math'])
            upload={'file':('valid.json',json.dumps({'exams':[first,valid,valid]}),'application/json')}
            result=client.post('/api/import',files=upload).json()
            self.assertEqual((result['created'],result['skipped']),(1,2))
            self.assertEqual(len(storage.list_exams()),2)
            result=client.post('/api/import?allow_duplicate=true',files=upload).json()
            self.assertEqual((result['created'],result['skipped']),(3,0))
            self.assertEqual(len(storage.list_exams()),5)

    def test_distinct_weighting_and_completion_definitions(self):
        # A: 5/10 correct at +4 -> 50%, 20/40. B: 20/20 at +2 -> 100%, 40/40.
        storage.save_exam({**self.payload(),'total_questions':10,'correct_answers':5,'incorrect_answers':0})
        storage.save_exam({**self.payload(),'title':'B','total_questions':20,'correct_answers':20,'incorrect_answers':0,'correct_weight':2})
        s=build_analytics(storage.list_exams())['summary']
        self.assertEqual(s['mean_percentage'],75)
        self.assertEqual(s['weighted_percentage'],75)
        self.assertEqual(s['question_weighted_percentage'],83.33)
        self.assertEqual(s['completion_rate'],83.33)
        self.assertEqual(s['mean_completion_rate'],75)

    def test_undefined_accuracy_and_sparse_dispersion(self):
        record=storage.save_exam({**self.payload(),'correct_answers':0,'incorrect_answers':0})
        a=build_analytics([record])
        self.assertIsNone(a['summary']['overall_accuracy'])
        self.assertIsNone(a['composition']['accuracy_attempted'])
        self.assertIsNone(a['summary']['std_dev'])
        self.assertIsNone(a['subjects'][0]['std_dev'])
        self.assertIsNone(a['timeline'][0]['rolling_std'])
        self.assertTrue(a['subjects'][0]['tentative'])
        record=storage.save_exam({'incorrect_answers':1},record['id'])
        self.assertEqual(build_analytics([record])['summary']['overall_accuracy'],0)

    def test_calendar_slope_streaks_and_weekly_evidence(self):
        rows=[]
        for i,(days,percentage) in enumerate([(0,10),(2,30),(6,70),(7,70),(8,60),(9,40)]):
            rows.append({'id':i+1,'exam_date':(date(2026,1,5)+timedelta(days=days)).isoformat(),
                         'percentage':percentage,'incorrect_answers':1,'total_questions':10,'subject_name':'Math','topic_name':'Algebra','exam_type':'Quiz'})
        self.assertAlmostEqual(extended(rows[:3])['slope_pp_per_day'],10)
        self.assertIsNone(extended([rows[0],{**rows[1],'exam_date':rows[0]['exam_date']},rows[2]])['slope_pp_per_day'])
        e=extended(rows)
        self.assertEqual([g['count'] for g in e['weekly']],[3,3])
        self.assertEqual([g['label'] for g in e['weekly']],['2026-01-05','2026-01-12'])
        self.assertEqual(e['streaks']['longest_improvements'],2)
        self.assertEqual(e['streaks']['current_declines'],2)
        self.assertEqual(e['streaks']['periods'],[{'direction':1,'ids':[1,2,3]},{'direction':-1,'ids':[4,5,6]}])
        self.assertEqual(e['topics'][0]['error_rate'],10)
        self.assertEqual(e['exam_types'][0]['count'],6)
        self.assertEqual(e['topics'][0]['ids'],[1,2,3,4,5,6])

    def test_comparison_empty_overlap_volatility_and_api_ranges(self):
        records=[]
        for i in range(10):
            records.append(storage.save_exam({**self.payload(),'title':str(i),'exam_date':f'2026-10-{i+1:02}','correct_answers':i,'incorrect_answers':0}))
        recent=build_analytics(records)['extended']['recent_comparison']
        self.assertAlmostEqual(recent['delta_pp'],100/3)
        self.assertAlmostEqual(recent['volatility_delta_pp'],0)
        self.assertFalse(recent['tentative'])
        self.assertIsNone(compare([],records)['delta_pp'])
        self.assertEqual(compare(records[:3],records[2:])['overlapping_ids'],[records[2]['id']])
        with TestClient(app,base_url='http://127.0.0.1') as client:
            params={'first_from':'2026-10-01','first_to':'2026-10-05','second_from':'2026-10-06','second_to':'2026-10-10'}
            result=client.get('/api/comparison',params=params)
            self.assertEqual(result.status_code,200)
            self.assertEqual(result.json()['first']['count'],5)
            self.assertEqual(client.get('/api/comparison',params={**params,'first_from':'2026-11-01'}).status_code,422)

    def test_hypothetical_scenarios_preserve_records_and_weights(self):
        row=storage.save_exam({**self.payload(),'correct_weight':5,'incorrect_weight':2})
        # 8 blank, p=.5 -> expected gain 8*(2.5-1)=12 points / max75.
        result=simulate([row],.5)
        self.assertEqual(result['mean_gain_pp'],16)
        self.assertTrue(result['hypothetical'])
        self.assertAlmostEqual(simulate([row],0)['mean_gain_pp'],-16/75*100)
        self.assertAlmostEqual(simulate([row],1)['mean_gain_pp'],40/75*100)
        self.assertAlmostEqual(simulate([row],2/7)['mean_gain_pp'],0)
        with TestClient(app,base_url='http://127.0.0.1') as client:
            self.assertEqual(client.get('/api/simulation?probability=0.5').status_code,200)
            for value in ('NaN','-1','2'):
                self.assertEqual(client.get('/api/simulation?probability='+value).status_code,422)
        self.assertEqual(storage.get_exam(row['id']),row)

    def test_heatmap_counts_exact_source_and_subject_evidence(self):
        rows=[storage.save_exam(self.payload()),storage.save_exam({**self.payload(),'title':'B','correct_answers':0,'incorrect_answers':15,'incorrect_weight':100}),
              storage.save_exam({**self.payload(),'title':'C','subject':'Science'})]
        a=build_analytics(rows)
        self.assertEqual(a['timeline'][0]['percentage'],8/60*100)
        self.assertEqual(a['heatmap']['counts'][0],[0,0,2])
        self.assertLess(a['heatmap']['values'][0][2],-50)
        subject=next(i for i in a['insights'] if i['kind']=='subject')
        self.assertEqual(subject['evidence']['ids'],[rows[0]['id'],rows[1]['id']])
        self.assertEqual(sum(b['count'] for b in a['distribution']),3)
