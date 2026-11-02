"""Forward, transactional SQLite migrations. Never recalculate historical scores."""
import math
from uuid import uuid4
from .scoring import calculate_score

VERSION = 5

FINITE_GUARD = '    OR NEW.maximum_score<=0 OR abs(NEW.maximum_score)>1e308 OR abs(NEW.raw_score)>1e308 OR abs(NEW.percentage)>1e308\n'


def migrate(db, stamp):
    versions = {r[0] for r in db.execute('SELECT version FROM schema_migrations')}
    if any(v > VERSION for v in versions):
        raise ValueError('Database version is newer than this application.')
    if VERSION in versions:
        return
    if not db.in_transaction:
        db.execute('BEGIN IMMEDIATE')
    # Validate before DDL. Failed migration leaves records, columns and markers intact.
    for row in db.execute('SELECT * FROM exams'):
        for key in ('total_questions','correct_answers','incorrect_answers','attempt_number'):
            if type(row[key]) is not int or abs(row[key]) > 2**53-1:
                raise ValueError('Migration requires valid integer examination counts.')
        score = calculate_score(row['total_questions'],row['correct_answers'],row['incorrect_answers'],row['correct_weight'],row['incorrect_weight'],row['unanswered_weight'] if 4 in versions else 0)
        for key in ('unanswered','raw_score','maximum_score','percentage'):
            if not math.isclose(row[key],getattr(score,key),rel_tol=1e-9,abs_tol=1e-8):
                raise ValueError('Migration found inconsistent historical scores; restore a valid backup.')
        if row['duration_minutes'] is not None and (not math.isfinite(row['duration_minutes']) or row['duration_minutes']<0):
            raise ValueError('Migration found invalid duration.')
    if 4 not in versions:
        db.execute('ALTER TABLE exams ADD COLUMN unanswered_weight REAL NOT NULL DEFAULT 0')
        db.execute("ALTER TABLE exams ADD COLUMN revision TEXT NOT NULL DEFAULT ''")
        for row in db.execute('SELECT id FROM exams').fetchall():
            db.execute('UPDATE exams SET revision=? WHERE id=?',(uuid4().hex,row[0]))
        db.execute("INSERT OR IGNORE INTO preferences VALUES('unanswered_weight','0')")
        db.execute('INSERT INTO schema_migrations VALUES(4,?)',(stamp,))
    else:
        # v4 existed briefly without the finite-score guard. Replace only our
        # two guards transactionally; do not change any examination facts.
        db.execute('DROP TRIGGER IF EXISTS exam_domain_insert')
        db.execute('DROP TRIGGER IF EXISTS exam_domain_update')
    install_guards(db)
    db.execute('INSERT INTO schema_migrations VALUES(?,?)',(VERSION,stamp))


def guard_sql(event):
    integers = ' OR '.join(f"typeof(NEW.{k})!='integer' OR NEW.{k}>{2**53-1}" for k in ('total_questions','correct_answers','incorrect_answers','unanswered','attempt_number'))
    raw='(NEW.correct_answers*NEW.correct_weight-NEW.incorrect_answers*NEW.incorrect_weight+NEW.unanswered*NEW.unanswered_weight)'
    return f'''CREATE TRIGGER exam_domain_{event.lower()} BEFORE {event} ON exams BEGIN
    SELECT CASE WHEN {integers}
    OR NEW.total_questions<=0 OR NEW.correct_answers<0 OR NEW.incorrect_answers<0 OR NEW.attempt_number<1
    OR NEW.unanswered!=NEW.total_questions-NEW.correct_answers-NEW.incorrect_answers OR NEW.unanswered<0
    OR NEW.correct_weight NOT BETWEEN 1e-100 AND 1e100
    OR NEW.incorrect_weight NOT BETWEEN 0 AND 1e100
    OR NEW.unanswered_weight NOT BETWEEN -1e100 AND NEW.correct_weight
    OR (NEW.duration_minutes IS NOT NULL AND (typeof(NEW.duration_minutes) NOT IN ('real','integer') OR NEW.duration_minutes<0 OR NEW.duration_minutes>1e100))
    OR NEW.maximum_score<=0 OR abs(NEW.maximum_score)>1e308 OR abs(NEW.raw_score)>1e308 OR abs(NEW.percentage)>1e308
    OR abs(NEW.maximum_score-NEW.total_questions*NEW.correct_weight)>max(1e-8,abs(NEW.maximum_score)*1e-9)
    OR abs(NEW.raw_score-{raw})>max(1e-8,abs(NEW.raw_score)*1e-9)
    OR abs(NEW.percentage-NEW.raw_score/NEW.maximum_score*100)>max(1e-8,abs(NEW.percentage)*1e-9)
    OR typeof(NEW.revision)!='text' OR length(NEW.revision)!=32
    THEN RAISE(ABORT,'Invalid examination domain or derived score') END; END'''


def install_guards(db):
    for event in ('INSERT','UPDATE'):
        db.execute(guard_sql(event))


def legacy_v4_guards():
    """Exact historical guard definitions accepted for backup migration only."""
    return {('trigger',f'exam_domain_{event.lower()}'):guard_sql(event).replace(FINITE_GUARD,'') for event in ('INSERT','UPDATE')}
