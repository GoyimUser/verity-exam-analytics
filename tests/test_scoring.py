import tempfile
import unittest
from pathlib import Path
from app.scoring import ScoreValidationError, calculate_score
from app.analytics import build_analytics

class ScoreTests(unittest.TestCase):
    def test_specification_case(self):
        score=calculate_score(15,3,4)
        self.assertEqual(score.unanswered,8);self.assertEqual(score.raw_score,8);self.assertEqual(score.maximum_score,60);self.assertAlmostEqual(score.percentage,13.3333333)
    def test_negative_is_preserved(self): self.assertEqual(calculate_score(10,0,4).percentage,-10)
    def test_invalid_counts(self):
        with self.assertRaises(ScoreValidationError):calculate_score(10,7,4)
        with self.assertRaises(ScoreValidationError):calculate_score(0,0,0)
    def test_analytics_weighted_distinct_from_mean(self):
        rows=[{"id":1,"exam_date":"2026-01-01","title":"a","subject_name":"A","percentage":100,"total_questions":1,"correct_answers":1,"incorrect_answers":0,"unanswered":0,"raw_score":4,"maximum_score":4,"incorrect_weight":1,"duration_minutes":None},{"id":2,"exam_date":"2026-01-02","title":"b","subject_name":"B","percentage":0,"total_questions":99,"correct_answers":0,"incorrect_answers":0,"unanswered":99,"raw_score":0,"maximum_score":396,"incorrect_weight":1,"duration_minutes":None}]
        result=build_analytics(rows);self.assertEqual(result["summary"]["mean_percentage"],50);self.assertEqual(result["summary"]["weighted_percentage"],1)

    def test_negative_marking_uses_each_exam_weight(self):
        rows = []
        for index, (incorrect, weight) in enumerate(((10, 1), (1, 5)), start=1):
            rows.append({"id": index, "exam_date": f"2026-01-0{index}", "title": str(index), "subject_name": "X", "percentage": 0, "total_questions": 20, "correct_answers": 0, "incorrect_answers": incorrect, "unanswered": 20 - incorrect, "raw_score": -incorrect * weight, "maximum_score": 80, "incorrect_weight": weight, "duration_minutes": None})
        self.assertEqual(build_analytics(rows)["composition"]["negative_marking_points"], 15)

if __name__ == "__main__":unittest.main()
