"""Compatibility regressions for early v4 database guard definitions."""
from pathlib import Path
from unittest.mock import patch
import unittest
from app import storage
from app.migrations import legacy_v4_guards
from tests import test_storage


class UpgradeTests(unittest.TestCase):
    setUp=test_storage.StorageTests.setUp
    tearDown=test_storage.StorageTests.tearDown

    def legacy(self):
        row=storage.save_exam(dict(test_storage.StorageTests.payload(self),unanswered_weight=-2))
        with storage.database() as db:
            db.execute('DELETE FROM schema_migrations WHERE version=5')
            for (_,name),sql in legacy_v4_guards().items():
                db.execute(f'DROP TRIGGER {name}')
                db.execute(sql)
        return row

    def test_legacy_v4_backup_and_upgrade_preserve_facts(self):
        row=self.legacy()
        with storage.database() as db:storage.validate_backup(db)
        path=Path(self.directory.name)/'legacy.db';storage.backup(path)
        storage.initialize()
        self.assertEqual(storage.get_exam(row['id']),row)
        with storage.database() as db:
            self.assertTrue(db.execute('SELECT 1 FROM schema_migrations WHERE version=5').fetchone())
            storage.validate_backup(db)
        storage.restore(path)
        restored=storage.get_exam(row['id'])
        self.assertNotEqual(restored.pop('revision'),row['revision'])
        self.assertEqual(restored,{k:v for k,v in row.items() if k!='revision'})

    def test_guard_upgrade_failure_rolls_back(self):
        row=self.legacy()
        with patch('app.migrations.install_guards',side_effect=RuntimeError('Injected DDL failure')):
            with self.assertRaises(RuntimeError):storage.initialize()
        with storage.database() as db:
            self.assertFalse(db.execute('SELECT 1 FROM schema_migrations WHERE version=5').fetchone())
            storage.validate_backup(db)
        self.assertEqual(storage.get_exam(row['id']),row)

    def test_arbitrary_v4_triggers_are_rejected(self):
        self.legacy()
        with storage.database() as db:
            db.execute('CREATE TRIGGER unrelated AFTER INSERT ON exams BEGIN SELECT 1; END')
            with self.assertRaises(ValueError):storage.validate_backup(db)
