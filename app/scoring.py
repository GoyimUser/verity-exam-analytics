from __future__ import annotations

from dataclasses import dataclass
from math import isfinite


class ScoreValidationError(ValueError):
    """Raised when an examination response count is internally impossible."""


@dataclass(frozen=True)
class Score:
    unanswered: int
    raw_score: float
    maximum_score: float
    percentage: float


def calculate_score(total: int, correct: int, incorrect: int, correct_weight: float = 4, incorrect_weight: float = 1, unanswered_weight: float = 0) -> Score:
    if type(total) is not int or total <= 0:
        raise ScoreValidationError("Total questions must be a positive integer.")
    if type(correct) is not int or correct < 0:
        raise ScoreValidationError("Correct answers must be a non-negative integer.")
    if type(incorrect) is not int or incorrect < 0:
        raise ScoreValidationError("Incorrect answers must be a non-negative integer.")
    if correct + incorrect > total:
        raise ScoreValidationError("Correct and incorrect answers cannot exceed total questions.")
    if not all(isinstance(w, (int, float)) and not isinstance(w, bool) and isfinite(w) for w in (correct_weight, incorrect_weight, unanswered_weight)) or correct_weight <= 0 or incorrect_weight < 0:
        raise ScoreValidationError("Correct weight must be positive and incorrect weight cannot be negative.")
    if unanswered_weight > correct_weight:
        raise ScoreValidationError("Unanswered weight cannot exceed correct weight.")
    maximum = total * correct_weight
    raw = correct * correct_weight - incorrect * incorrect_weight + (total - correct - incorrect) * unanswered_weight
    if not isfinite(maximum) or not isfinite(raw) or not isfinite(raw / maximum * 100):
        raise ScoreValidationError("Scoring values exceed the supported numeric range.")
    return Score(total - correct - incorrect, raw, maximum, raw / maximum * 100)
