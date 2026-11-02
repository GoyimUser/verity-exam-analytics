import unittest
from fastapi.testclient import TestClient
from app import storage
from app.main import app
from tests import test_storage

class FrontendContracts(unittest.TestCase):
    setUp=test_storage.StorageTests.setUp
    tearDown=test_storage.StorageTests.tearDown
    payload=test_storage.StorageTests.payload

    def test_preview_matches_saved_scoring_and_does_not_write(self):
        with TestClient(app,base_url='http://127.0.0.1') as client:
            for weights in [(4,1),(5,0),(3.25,2.5)]:
                data={**self.payload(),'correct_weight':weights[0],'incorrect_weight':weights[1]}
                preview=client.post('/api/score-preview',json=data)
                self.assertEqual(preview.status_code,200)
                self.assertEqual(storage.list_exams(),[])
                row=storage.save_exam(data)
                for key,value in preview.json().items():self.assertEqual(value,row[key])
                storage.delete_exam(row['id'])
            for invalid in (None,True,1.5,-1):
                response=client.post('/api/score-preview',json={**self.payload(),'correct_answers':invalid})
                self.assertEqual(response.status_code,422)
            storage.update_preferences({'correct_weight':5,'incorrect_weight':0})
            self.assertEqual(client.post('/api/score-preview',json=self.payload()).json()['raw_score'],15)

    def test_search_scope_matches_history_analytics_and_scenarios(self):
        storage.save_exam(self.payload())
        storage.save_exam({**self.payload(),'title':'Another','subject':'Science','topic':'Light'})
        with TestClient(app,base_url='http://127.0.0.1') as client:
            for search in ('Algebra','Functions','Science','no-match'):
                count=len(client.get('/api/exams',params={'search':search}).json())
                self.assertEqual(client.get('/api/analytics',params={'search':search}).json()['count'],count)
                self.assertEqual(client.get('/api/simulation',params={'search':search,'probability':.5}).json()['count'],count)

    def test_localized_export_keeps_canonical_values(self):
        storage.save_exam(self.payload())
        with TestClient(app,base_url='http://127.0.0.1') as client:
            output=client.get('/api/export/csv?language=fa').text
            self.assertIn('نام آزمون',output)
            self.assertIn('2026-10-01',output)
            self.assertIn('13.333',output)
            self.assertIn('title',client.get('/api/export/csv').text)
