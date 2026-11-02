import tempfile
import unittest
from pathlib import Path

from app import storage


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.previous = storage.DB_PATH
        storage.DB_PATH = Path(self.directory.name) / "test.db"
        storage.initialize()

    def tearDown(self):
        storage.DB_PATH = self.previous
        self.directory.cleanup()

    def payload(self):
        return {"title": "Algebra mock", "subject": "Math", "topic": "Functions", "exam_date": "2026-10-01", "total_questions": 15, "correct_answers": 3, "incorrect_answers": 4, "attempt_number": 1, "tags": ["timed"]}

    def test_persist_edit_and_delete(self):
        created = storage.save_exam(self.payload())
        self.assertEqual(created["unanswered"], 8)
        self.assertAlmostEqual(created["percentage"], 13.3333333)
        updated = storage.save_exam({**self.payload(), "correct_answers": 5, "incorrect_answers": 2}, created["id"])
        self.assertEqual(updated["unanswered"], 8)
        self.assertEqual(updated["raw_score"], 18)
        self.assertTrue(storage.delete_exam(created["id"]))
        self.assertIsNone(storage.get_exam(created["id"]))

    def test_duplicate_requires_explicit_choice(self):
        storage.save_exam(self.payload())
        with self.assertRaises(ValueError):
            storage.save_exam(self.payload())
        second = storage.save_exam({**self.payload(), "allow_duplicate": True})
        self.assertIsNotNone(second["id"])

    def test_json_export_import_and_csv(self):
        storage.save_exam(self.payload())
        exported = storage.export_json()
        self.assertEqual(exported["exams"][0]["tags"], ["timed"])
        self.assertIn("Algebra mock", storage.export_csv())
        result = storage.import_json(exported, allow_duplicate=True)
        self.assertEqual(result["created"], 1)
        self.assertEqual(len(storage.list_exams()), 2)

    def test_mode_locale_and_quick_defaults_persist_without_touching_records(self):
        exam = storage.save_exam(self.payload())
        settings = storage.update_preferences({
            "application_mode": "quick", "language": "fa", "persian_digits": "native",
            "default_total_questions": "20", "correct_weight": "3", "incorrect_weight": "0.5",
        })
        self.assertEqual(settings["application_mode"], "quick")
        self.assertEqual(settings["language"], "fa")
        self.assertEqual(settings["default_total_questions"], "20")
        # Defaults are only for future records; historical fact and score configuration are unchanged.
        persisted = storage.get_exam(exam["id"])
        self.assertEqual(persisted["total_questions"], 15)
        self.assertEqual(persisted["correct_weight"], 4)
        self.assertEqual(persisted["incorrect_weight"], 1)
        with self.assertRaises(ValueError):
            storage.update_preferences({"application_mode": "invalid"})

    def test_missing_update_is_not_found_and_cannot_create_metadata(self):
        attempted = {**self.payload(), "subject": "Must not be created"}
        with self.assertRaises(storage.ExaminationNotFoundError):
            storage.save_exam(attempted, exam_id=999_999)
        self.assertNotIn("Must not be created", storage.subjects())


if __name__ == "__main__":
    unittest.main()
