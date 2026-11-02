from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from math import sqrt
from statistics import mean, median, pstdev
from typing import Any
from .statistics_extra import extended


def _round(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None


def _linear_slope(points: list[float]) -> float | None:
    if len(points) < 3:
        return None
    xbar, ybar = (len(points) - 1) / 2, mean(points)
    denominator = sum((x - xbar) ** 2 for x in range(len(points)))
    return sum((x - xbar) * (y - ybar) for x, y in enumerate(points)) / denominator if denominator else None


def build_analytics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Build all derived statistics from the supplied factual examination rows."""
    rows = sorted(rows, key=lambda r: (r["exam_date"], r["id"]))
    if not rows:
        return {"count": 0, "summary": {}, "timeline": [], "subjects": [], "monthly": [], "distribution": [], "composition": {}, "heatmap": [], "insights": [], "limitations": ["Add at least one examination to begin analysis."]}
    pcts = [r["percentage"] for r in rows]
    total_q = sum(r["total_questions"] for r in rows)
    total_c = sum(r["correct_answers"] for r in rows)
    total_i = sum(r["incorrect_answers"] for r in rows)
    total_u = sum(r["unanswered"] for r in rows)
    durations = [r["duration_minutes"] for r in rows if r["duration_minutes"] is not None]
    weighted = sum(r["raw_score"] for r in rows) / sum(r["maximum_score"] for r in rows) * 100
    timeline = []
    for index, r in enumerate(rows):
        window = pcts[max(0, index - 4): index + 1]
        timeline.append({"id": r["id"], "date": r["exam_date"], "title": r["title"], "subject": r["subject_name"], "percentage": r["percentage"], "moving_average": _round(mean(window)), "rolling_std": _round(pstdev(window) if len(window) > 1 else None), "raw_score": r["raw_score"], "maximum_score": r["maximum_score"]})
    by_subject: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_subject[r["subject_name"]].append(r)
    subjects = []
    for name, group in sorted(by_subject.items(), key=lambda pair:pair[0] or ""):
        gp = [x["percentage"] for x in group]
        gq, gi = sum(x["total_questions"] for x in group), sum(x["incorrect_answers"] for x in group)
        subjects.append({"subject": name, "count": len(group), "average": _round(mean(gp)), "weighted_percentage": _round(sum(x["raw_score"] for x in group) / sum(x["maximum_score"] for x in group) * 100), "std_dev": _round(pstdev(gp) if len(gp) > 1 else None), "error_rate": _round(gi / gq * 100), "tentative": len(group)<5, "ids": [r["id"] for r in group], "trend_per_exam": _round(_linear_slope(gp))})
    by_month: dict[str, list[float]] = defaultdict(list)
    for r in rows: by_month[r["exam_date"][:7]].append(r["percentage"])
    monthly = [{"month": m, "average": _round(mean(v)), "count": len(v)} for m, v in sorted(by_month.items())]
    bins = [{"label": "< -50", "lower":None,"upper":-50,"count": sum(p < -50 for p in pcts)}]
    bins += [{"label": f"[{start}, {start + 10})", "lower":start,"upper":start+10,"count": sum(start <= p < start + 10 for p in pcts)} for start in range(-50, 100, 10)]
    bins += [{"label": "100", "lower":100,"upper":100,"count": sum(p == 100 for p in pcts)}]
    composition = {"correct": total_c, "incorrect": total_i, "unanswered": total_u, "accuracy_attempted": _round(total_c / (total_c + total_i) * 100 if total_c + total_i else None), "completion_rate": _round((total_c + total_i) / total_q * 100), "unanswered_rate": _round(total_u / total_q * 100), "negative_marking_points": _round(sum(r["incorrect_answers"] * r["incorrect_weight"] for r in rows)), "reduce_wrong_gain_pp": _round(sum(r["incorrect_answers"] * r["incorrect_weight"] / r["maximum_score"] * 100 for r in rows) / len(rows))}
    dates = sorted({r["exam_date"] for r in rows})
    subject_names = sorted(by_subject, key=lambda name:name or "")
    heatmap = []
    cells = defaultdict(list)
    for r in rows: cells[(r["exam_date"], r["subject_name"])].append(r["percentage"])
    date_index = {value: index for index, value in enumerate(dates)}
    subject_index = {value: index for index, value in enumerate(subject_names)}
    for (day, subject), values in cells.items():
        heatmap.append([date_index[day], subject_index[subject], _round(mean(values))])
    recent = pcts[-min(5, len(pcts)):]
    prior = pcts[-10:-5] if len(pcts) >= 10 else []
    slope = _linear_slope(pcts)
    insights: list[dict[str, str]] = []
    if prior:
        delta = mean(recent) - mean(prior)
        direction = "improved" if delta >= 0 else "declined"
        insights.append({"kind": "trend", "title": f"Recent performance {direction} by {abs(delta):.1f} points", "detail": f"Last 5 exam average: {mean(recent):.1f}% versus the preceding 5: {mean(prior):.1f}%."})
    if len(subjects) >= 2:
        weak = max(subjects, key=lambda s: s["error_rate"])
        insights.append({"kind": "subject", "title": f"{weak['subject'] or 'Unassigned'} has the highest error rate", "detail": f"{weak['error_rate']:.1f}% of its questions were incorrect across {weak['count']} exam(s)."})
    if composition["unanswered_rate"] > 0:
        insights.append({"kind": "completion", "title": f"{composition['unanswered_rate']:.1f}% of questions were unanswered", "detail": "This describes the recorded answers; it does not establish whether attempting more questions would improve the score."})
    if len(pcts) >= 5:
        insights.append({"kind": "consistency", "title": f"Performance variability is {pstdev(pcts):.1f} points", "detail": "Lower population standard deviation means your recorded exam percentages are more consistent."})
    limitations = []
    if len(rows) < 5: limitations.append("Trend and variability signals are tentative with fewer than 5 examinations.")
    if len(rows) < 10: limitations.append("A recent-versus-prior comparison needs 10 examinations; it is not shown yet.")
    extra = extended(rows)
    evidence=extra["recent_comparison"]
    for insight in insights:
        insight["evidence"] = evidence if insight["kind"]=="trend" else {"ids":[r["id"] for r in rows], "from":rows[0]["exam_date"],"to":rows[-1]["exam_date"], "count":len(rows)}
        if insight['kind']=='subject':
            group=by_subject[weak['subject']]
            insight['subject']=weak
            insight['evidence']={'ids':[r['id'] for r in group],'from':group[0]['exam_date'],'to':group[-1]['exam_date'],'count':len(group)}
    return {"extended":extra, "count": len(rows), "summary": {"mean_percentage": _round(mean(pcts)), "weighted_percentage": _round(weighted), "question_weighted_percentage": _round(sum(r["percentage"]*r["total_questions"] for r in rows)/total_q), "mean_completion_rate": _round(mean((r["correct_answers"]+r["incorrect_answers"])/r["total_questions"]*100 for r in rows)), "median_percentage": _round(median(pcts)), "highest_percentage": _round(max(pcts)), "lowest_percentage": _round(min(pcts)), "std_dev": _round(pstdev(pcts) if len(pcts) > 1 else None), "average_raw_score": _round(mean(r["raw_score"] for r in rows)), "total_correct": total_c, "total_incorrect": total_i, "total_unanswered": total_u, "overall_accuracy": _round(total_c / (total_c + total_i) * 100 if total_c + total_i else None), "completion_rate": _round((total_c + total_i) / total_q * 100), "average_duration": _round(mean(durations)) if durations else None, "trend_per_exam": _round(slope), "best_subject": max(subjects, key=lambda s: s["average"])["subject"], "worst_subject": min(subjects, key=lambda s: s["average"])["subject"]}, "timeline": timeline, "subjects": subjects, "monthly": monthly, "distribution": bins, "composition": composition, "heatmap": {"dates": dates, "subjects": subject_names, "values": heatmap, "counts": [[date_index[day],subject_index[subject],len(values)] for (day,subject),values in cells.items()]}, "insights": insights, "limitations": limitations}
