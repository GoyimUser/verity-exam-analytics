import math
import unittest
from fastapi.testclient import TestClient
from app import storage
from app.main import app
from app.scoring import calculate_score
from app.analytics import build_analytics
from tests import test_storage


class RegressionTests(unittest.TestCase):
    setUp = test_storage.StorageTests.setUp
    tearDown = test_storage.StorageTests.tearDown
    payload = test_storage.StorageTests.payload
    def test_partial_patch_preserves_metadata_and_scoring(self):
        record = storage.save_exam({**self.payload(), "correct_weight": 5, "incorrect_weight": 2,
                                    "notes": "keep", "start_time": "10:00", "end_time": "11:00", "duration_minutes": 60})
        with TestClient(app,base_url='http://127.0.0.1') as client:
            response = client.patch(f"/api/exams/{record['id']}", json={"correct_answers": 4})
        self.assertEqual(response.status_code, 200)
        updated = response.json()
        for key in ("subject_name", "topic_name", "tags", "notes", "start_time", "end_time", "duration_minutes", "correct_weight", "incorrect_weight"):
            self.assertEqual(updated[key], record[key], key)
        self.assertEqual(updated["raw_score"], 12)

    def test_api_rejects_invalid_values_without_side_effects(self):
        with TestClient(app,base_url='http://127.0.0.1') as client:
            for value in (1.5, True, None):
                response = client.post('/api/exams', json={**self.payload(), "correct_answers": value})
                self.assertEqual(response.status_code, 422)
            self.assertEqual(client.patch('/api/settings', json={"correct_weight": "NaN"}).status_code, 422)
            self.assertEqual(client.patch('/api/settings', json={"theme": "unknown"}).status_code, 422)
            self.assertEqual(client.patch('/api/exams/999999', json=self.payload()).status_code, 404)
        self.assertEqual(storage.list_exams(), [])

    def test_nonfinite_scoring_and_duration(self):
        for value in (math.nan, math.inf, -math.inf):
            with self.assertRaises(ValueError): calculate_score(15, 3, 4, value)
            with self.assertRaises(ValueError): storage.save_exam({**self.payload(), "duration_minutes": value})
        with self.assertRaises(ValueError): calculate_score(True, 0, 0)

    def test_tags_and_topics_are_reused(self):
        storage.save_exam({**self.payload(), "subject": "", "tags": ["Timed", "timed"]})
        storage.save_exam({**self.payload(), "subject": "", "title": "Another"})
        with storage.database() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM topics').fetchone()[0], 1)

    def test_histogram_and_heatmap_preserve_observations(self):
        storage.save_exam({**self.payload(), "correct_answers": 0, "incorrect_answers": 15, "incorrect_weight": 5})
        storage.save_exam({**self.payload(), "title": "Second", "correct_answers": 15, "incorrect_answers": 0})
        result = build_analytics(storage.list_exams())
        self.assertEqual(sum(b['count'] for b in result['distribution']), 2)
        self.assertEqual(result['heatmap']['values'], [[0, 0, -12.5]])

    def test_import_shape_validation(self):
        for payload in ([], None, 'invalid'):
            with self.assertRaises(ValueError): storage.import_json(payload)
