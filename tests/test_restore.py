import sqlite3
import threading
import tempfile
from pathlib import Path
import unittest
from contextlib import closing
from unittest.mock import patch
from fastapi.testclient import TestClient
from app import storage
from app.main import app
from tests import test_storage


class RestoreTests(unittest.TestCase):
    setUp = test_storage.StorageTests.setUp
    tearDown = test_storage.StorageTests.tearDown
    payload = test_storage.StorageTests.payload

    def snapshot(self):
        path = storage.DB_PATH.parent / 'upload.db'
        storage.backup(path)
        return path

    def test_restore_retains_original_recovery_copy(self):
        first = storage.save_exam(self.payload())
        snapshot = self.snapshot()
        storage.save_exam({**self.payload(), 'title': 'Later result'})
        recovery = storage.restore(snapshot)
        self.assertEqual([r['id'] for r in storage.list_exams()], [first['id']])
        with closing(sqlite3.connect(recovery)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM exams').fetchone()[0], 2)

    def test_invalid_backups_never_replace_live_data(self):
        storage.save_exam(self.payload())
        original = storage.export_json()['exams']
        for sql in ('DROP TABLE preferences', 'UPDATE exams SET raw_score=999',
                    'UPDATE exams SET subject_id=999', 'INSERT INTO schema_migrations VALUES(999,\'future\')',
                    "UPDATE preferences SET value='NaN' WHERE key='correct_weight'",
                    'CREATE VIEW unexpected AS SELECT * FROM exams'):
            with self.subTest(sql=sql):
                path = self.snapshot()
                with closing(sqlite3.connect(path)) as db:
                    triggers=list(db.execute("SELECT sql FROM sqlite_master WHERE type='trigger'"))
                    if sql=='UPDATE exams SET raw_score=999':
                        db.execute('DROP TRIGGER exam_domain_insert');db.execute('DROP TRIGGER exam_domain_update')
                    db.execute(sql)
                    if sql=='UPDATE exams SET raw_score=999':
                        for trigger in triggers:db.execute(trigger[0])
                    db.commit()
                with self.assertRaises(ValueError): storage.restore(path)
                self.assertEqual(storage.export_json()['exams'], original)
        self.assertFalse((storage.DB_PATH.parent / 'recovery').exists())

    def test_failed_install_recovers_original_database(self):
        storage.save_exam(self.payload())
        path = self.snapshot()
        storage.save_exam({**self.payload(), 'title': 'Keep this'})
        before = storage.export_json()['exams']
        def fail_after_replacement(staged):
            with storage.database() as live: staged.backup(live)
            raise RuntimeError('simulated post-install failure')
        with patch.object(storage, '_install_backup', side_effect=fail_after_replacement):
            with self.assertRaisesRegex(ValueError, 'original database was recovered'):
                storage.restore(path)
        self.assertEqual(storage.export_json()['exams'], before)

    def test_restore_waits_for_existing_database_access(self):
        path = self.snapshot()
        started, finished = threading.Event(), threading.Event()
        failures = []
        def restore():
            started.set()
            try: storage.restore(path)
            except Exception as exc: failures.append(exc)
            finally: finished.set()
        with storage.database():
            thread = threading.Thread(target=restore)
            thread.start()
            self.assertTrue(started.wait(2))
            self.assertFalse(finished.wait(.1))
        thread.join(5)
        self.assertTrue(finished.is_set())
        self.assertEqual(failures, [])

    def test_api_boundaries_and_defaults(self):
        with TestClient(app,base_url='http://127.0.0.1') as client:
            for changes in ({'attempt_number': 0}, {'duration_minutes': {}}, {'start_time': []},
                            {'total_questions': 10**100}, {'allow_duplicate': 'false'}):
                self.assertEqual(client.post('/api/exams', json={**self.payload(), **changes}).status_code, 422)
            for endpoint in ('exams', 'analytics'):
                for query in ('from_date=2026-02-30', 'from_date=2026-02-01&to_date=2026-01-01'):
                    self.assertEqual(client.get(f'/api/{endpoint}?{query}').status_code, 422)
            storage.update_preferences({'correct_weight': 5, 'incorrect_weight': 2})
            record = client.post('/api/exams', json=self.payload()).json()
            self.assertEqual(record['raw_score'], 7)
            storage.update_preferences({'correct_weight': 10})
            updated = client.patch(f"/api/exams/{record['id']}", json={'notes': 'keep weights'}).json()
            self.assertEqual(updated['correct_weight'], 5)

    def test_upload_and_download_temporary_files_are_cleaned(self):
        storage.save_exam(self.payload())
        snapshot = self.snapshot().read_bytes()
        created = []
        real_mkstemp = tempfile.mkstemp
        def tracked(*args, **kwargs):
            kwargs['dir'] = str(storage.DB_PATH.parent)
            descriptor, name = real_mkstemp(*args, **kwargs)
            created.append(Path(name))
            return descriptor, name
        with TestClient(app,base_url='http://127.0.0.1') as client, patch('app.main.tempfile.mkstemp', side_effect=tracked):
            self.assertEqual(client.get('/api/backup').status_code, 200)
            self.assertEqual(client.post('/api/restore', files={'file': ('bad.db', b'invalid')}).status_code, 422)
            response = client.post('/api/restore', files={'file': ('good.db', snapshot)})
            self.assertEqual(response.status_code, 200)
            self.assertTrue((storage.DB_PATH.parent / 'recovery' / response.json()['recovery_backup']).is_file())
            with patch.object(storage, 'backup', side_effect=RuntimeError('disk failure')):
                with self.assertRaises(RuntimeError): client.get('/api/backup')
        self.assertEqual(len(created), 4)
        self.assertTrue(all(not path.exists() for path in created))
