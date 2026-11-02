from __future__ import annotations

import csv
import io
import json
import shutil
import sqlite3
import math
import threading
from uuid import uuid4
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .scoring import ScoreValidationError, calculate_score
from .validation import number
from .export_utils import safe_cell

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "verity.db"
DATABASE_LOCK = threading.RLock()


class ExaminationNotFoundError(ValueError):
    """Raised when a requested examination record does not exist."""

class DuplicateExamError(ValueError): pass

class StaleExamError(ValueError): pass

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY, subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL, name TEXT NOT NULL, UNIQUE(subject_id,name));
CREATE TABLE IF NOT EXISTS exams (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL, topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
 exam_type TEXT, exam_date TEXT NOT NULL, start_time TEXT, end_time TEXT, duration_minutes REAL, total_questions INTEGER NOT NULL CHECK(total_questions>0), correct_answers INTEGER NOT NULL CHECK(correct_answers>=0), incorrect_answers INTEGER NOT NULL CHECK(incorrect_answers>=0), unanswered INTEGER NOT NULL CHECK(unanswered>=0), correct_weight REAL NOT NULL DEFAULT 4, incorrect_weight REAL NOT NULL DEFAULT 1, raw_score REAL NOT NULL, maximum_score REAL NOT NULL, percentage REAL NOT NULL, notes TEXT, attempt_number INTEGER NOT NULL DEFAULT 1 CHECK(attempt_number>0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK(correct_answers + incorrect_answers <= total_questions));
CREATE INDEX IF NOT EXISTS idx_exams_date ON exams(exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_exams_subject_date ON exams(subject_id, exam_date DESC);
CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS exam_tags (exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(exam_id,tag_id));
CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

def now() -> str: return datetime.now(timezone.utc).isoformat()
def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

@contextmanager
def database():
    """Commit on success, roll back on error, and always release Windows file locks."""
    DATABASE_LOCK.acquire()
    db = None
    try:
        db = connect()
        yield db
        db.commit()
    except Exception:
        if db is not None: db.rollback()
        raise
    finally:
        if db is not None: db.close()
        DATABASE_LOCK.release()

def initialize() -> None:
    with database() as db:
        db.executescript(SCHEMA)
        db.execute("INSERT OR IGNORE INTO schema_migrations VALUES(1,?)", (now(),))
        # v2 adds no columns: preferences are a versioned key/value store, keeping existing
        # databases and examination facts untouched while adding mode and locale state.
        db.execute("INSERT OR IGNORE INTO schema_migrations VALUES(2,?)", (now(),))
        db.execute("INSERT OR IGNORE INTO preferences VALUES('theme','dark')")
        db.execute("INSERT OR IGNORE INTO preferences VALUES('correct_weight','4')")
        db.execute("INSERT OR IGNORE INTO preferences VALUES('incorrect_weight','1')")
        db.execute("INSERT OR IGNORE INTO preferences VALUES('default_total_questions','15')")
        db.execute("INSERT OR IGNORE INTO preferences VALUES('application_mode','advanced')")
        db.execute("INSERT OR IGNORE INTO preferences VALUES('language','en')")
        db.execute("INSERT OR IGNORE INTO preferences VALUES('persian_digits','native')")
        from .study import migrate
        migrate(db)
        from .migrations import migrate as migrate_exams
        migrate_exams(db, now())

def _subject(db: sqlite3.Connection, name: str | None) -> int | None:
    if not name or not name.strip(): return None
    name = name.strip(); db.execute("INSERT OR IGNORE INTO subjects(name,created_at) VALUES(?,?)", (name, now()))
    return db.execute("SELECT id FROM subjects WHERE name=? COLLATE NOCASE", (name,)).fetchone()[0]
def _topic(db: sqlite3.Connection, subject_id: int | None, name: str | None) -> int | None:
    if not name or not name.strip(): return None
    name = name.strip()
    existing = db.execute("SELECT id FROM topics WHERE subject_id IS ? AND name=?", (subject_id,name)).fetchone()
    if existing: return existing[0]
    db.execute("INSERT OR IGNORE INTO topics(subject_id,name) VALUES(?,?)", (subject_id,name))
    return db.execute("SELECT id FROM topics WHERE subject_id IS ? AND name=?", (subject_id,name)).fetchone()[0]
def _tags(db: sqlite3.Connection, exam_id: int, tags: list[str]) -> None:
    db.execute("DELETE FROM exam_tags WHERE exam_id=?", (exam_id,))
    for label in sorted({str(x).strip() for x in tags if str(x).strip()}):
        db.execute("INSERT OR IGNORE INTO tags(name) VALUES(?)", (label,)); tag_id=db.execute("SELECT id FROM tags WHERE name=? COLLATE NOCASE",(label,)).fetchone()[0]
        db.execute("INSERT OR IGNORE INTO exam_tags(exam_id,tag_id) VALUES(?,?)", (exam_id,tag_id))

def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ValueError(f"{label} must be a whole number.")
    try:
        result = int(value)
        if abs(result) > 2**53 - 1: raise ValueError()
        return result
    except (ValueError, TypeError): raise ValueError(f"{label} must be a whole number.")

def _prepare(db: sqlite3.Connection, data: dict[str,Any]) -> tuple[dict[str,Any], Any]:
    data = dict(data)
    for field, default in (("correct_weight",4),("incorrect_weight",1),("unanswered_weight",0)):
        data[field] = number(data.get(field,default),field,1e-100 if field=='correct_weight' else -1e100 if field=='unanswered_weight' else 0)
    try:
        for field in ("total_questions", "correct_answers", "incorrect_answers"):
            data[field] = _integer(data[field], field.replace("_", " "))
        data["attempt_number"] = _integer(data.get("attempt_number", 1), "Attempt number")
        score=calculate_score(data["total_questions"],data["correct_answers"],data["incorrect_answers"],float(data.get("correct_weight",4)),float(data.get("incorrect_weight",1)),float(data.get("unanswered_weight",0)))
    except (KeyError, TypeError, ValueError, OverflowError) as exc: raise ValueError(str(exc))
    if data["attempt_number"] < 1: raise ValueError("Attempt number must be at least 1.")
    if "allow_duplicate" in data and type(data["allow_duplicate"]) is not bool:
        raise ValueError("Allow duplicate must be true or false.")
    for field in ("start_time", "end_time"):
        value = data.get(field)
        if value not in (None, ""):
            if not isinstance(value, str): raise ValueError(f"{field} must use HH:MM.")
            try:
                if datetime.strptime(value, "%H:%M").strftime("%H:%M") != value: raise ValueError()
            except ValueError: raise ValueError(f"{field} must use HH:MM.")
    if data.get("duration_minutes") not in (None, ""):
        try:
            if isinstance(data["duration_minutes"], bool): raise ValueError()
            data["duration_minutes"] = float(data["duration_minutes"])
        except (TypeError, ValueError, OverflowError): raise ValueError("Duration must be numeric.")
    if data.get("duration_minutes") in (None, "") and data.get("start_time") and data.get("end_time"):
        def minutes(value):
            h,m=map(int,value.split(':'));return h*60+m
        data['duration_minutes']=(minutes(data['end_time'])-minutes(data['start_time']))%1440
    for field in ("title", "subject", "topic", "notes", "exam_type"):
        if data.get(field) is not None and not isinstance(data[field], str):
            raise ValueError(f"{field} must be text.")
        if len(data.get(field) or '') > (20000 if field=='notes' else 500):
            raise ValueError(f"{field} is too long.")
    if not isinstance(data.get("tags", []), list) or any(not isinstance(tag, str) for tag in data.get("tags", [])):
        raise ValueError("Tags must be an array of text labels.")
    if len(data.get('tags',[]))>100 or any(len(tag)>100 for tag in data.get('tags',[])):
        raise ValueError('Use at most 100 tags of up to 100 characters.')
    title=str(data.get("title") or "").strip()
    date=str(data.get("exam_date", "")).strip()
    if not title: raise ValueError("An examination title is required.")
    try:
        parsed_date = datetime.strptime(date,"%Y-%m-%d")
        if parsed_date.strftime("%Y-%m-%d") != date: raise ValueError()
    except ValueError: raise ValueError("Examination date must use YYYY-MM-DD.")
    subject_id=_subject(db,data.get("subject")); topic_id=_topic(db,subject_id,data.get("topic"))
    result={"title":title,"subject_id":subject_id,"topic_id":topic_id,"exam_type":str(data.get("exam_type") or "Practice"),"exam_date":date,"start_time":data.get("start_time") or None,"end_time":data.get("end_time") or None,"duration_minutes":float(data["duration_minutes"]) if data.get("duration_minutes") not in (None,"") else None,"total_questions":int(data["total_questions"]),"correct_answers":int(data["correct_answers"]),"incorrect_answers":int(data["incorrect_answers"]),"unanswered":score.unanswered,"correct_weight":float(data.get("correct_weight",4)),"incorrect_weight":float(data.get("incorrect_weight",1)),"unanswered_weight":float(data.get("unanswered_weight",0)),"raw_score":score.raw_score,"maximum_score":score.maximum_score,"percentage":score.percentage,"notes":str(data.get("notes") or "").strip(),"attempt_number":int(data.get("attempt_number") or 1)}
    if result["duration_minutes"] is not None and (not math.isfinite(result["duration_minutes"]) or result["duration_minutes"] < 0): raise ValueError("Duration must be finite and non-negative.")
    if result["attempt_number"] < 1: raise ValueError("Attempt number must be at least 1.")
    return result, data.get("tags", [])

def _row(db: sqlite3.Connection, row: sqlite3.Row) -> dict[str,Any]:
    d=dict(row); d["tags"]=[x[0] for x in db.execute("SELECT t.name FROM tags t JOIN exam_tags et ON et.tag_id=t.id WHERE et.exam_id=? ORDER BY t.name",(d["id"],)).fetchall()]
    return d

SELECT = "SELECT e.*, s.name subject_name, t.name topic_name FROM exams e LEFT JOIN subjects s ON s.id=e.subject_id LEFT JOIN topics t ON t.id=e.topic_id"
def validate_date_range(from_date: str, to_date: str) -> None:
    for value in (from_date, to_date):
        if value:
            try:
                if datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d") != value: raise ValueError()
            except ValueError: raise ValueError("Date filters must use valid YYYY-MM-DD dates.")
    if from_date and to_date and from_date > to_date:
        raise ValueError("The start date must not be after the end date.")

def list_exams(search: str="", subject: str="", sort: str="exam_date", direction: str="desc", from_date: str="", to_date: str="", limit: int | None=None, offset: int=0) -> list[dict]:
    validate_date_range(from_date, to_date)
    clauses=[]; params=[]
    if search: clauses.append("(e.title LIKE ? OR e.notes LIKE ? OR s.name LIKE ? OR t.name LIKE ?)"); params += [f"%{search}%"]*4
    if subject: clauses.append("s.name=?"); params.append(subject)
    if from_date: clauses.append("e.exam_date>=?"); params.append(from_date)
    if to_date: clauses.append("e.exam_date<=?"); params.append(to_date)
    safe={"exam_date":"e.exam_date","percentage":"e.percentage","raw_score":"e.raw_score","title":"e.title","created_at":"e.created_at"}; order=safe.get(sort,"e.exam_date"); direction="ASC" if direction.lower()=="asc" else "DESC"
    sql=SELECT+(" WHERE "+" AND ".join(clauses) if clauses else "")+f" ORDER BY {order} {direction}, e.id DESC"
    if limit is not None:
        if type(limit) is not int or not 1<=limit<=200 or type(offset) is not int or offset<0:raise ValueError('Invalid pagination.')
        sql+=' LIMIT ? OFFSET ?';params.extend([limit,offset])
    with database() as db:
        rows=[dict(r) for r in db.execute(sql,params)]
        tags={r['id']:[] for r in rows}
        # One joined batch, independent of the number of examinations.
        for r in db.execute('SELECT et.exam_id,t.name FROM exam_tags et JOIN tags t ON t.id=et.tag_id JOIN ('+sql+') selected ON selected.id=et.exam_id ORDER BY t.name',params):
            if r[0] in tags:tags[r[0]].append(r[1])
        for row in rows:row['tags']=tags[row['id']]
        return rows
def get_exam(exam_id:int)->dict|None:
    with database() as db:
        row=db.execute(SELECT+" WHERE e.id=?",(exam_id,)).fetchone(); return _row(db, row) if row else None
def save_exam(data:dict[str,Any], exam_id:int|None=None)->dict:
    with database() as db: return _save_exam(db,data,exam_id)

def _save_exam(db, data, exam_id=None):
    # Check before resolving metadata. An absent PATCH must not create orphan subjects,
    # topics, or tags as a side effect.
    if exam_id is not None and not db.execute("SELECT 1 FROM exams WHERE id=?", (exam_id,)).fetchone():
        raise ExaminationNotFoundError("Examination not found.")
    if exam_id is not None:
        existing = _row(db, db.execute(SELECT + " WHERE e.id=?", (exam_id,)).fetchone())
        if 'revision' in data and data['revision'] != existing['revision']:
            raise StaleExamError('examConflict')
        data = {**existing, "subject": existing["subject_name"], "topic": existing["topic_name"], **data}
    else:
        defaults = dict(db.execute("SELECT key,value FROM preferences"))
        data = {"total_questions": defaults.get("default_total_questions", "15"),
                "correct_weight": defaults.get("correct_weight", "4"),
                "incorrect_weight": defaults.get("incorrect_weight", "1"), "unanswered_weight":defaults.get("unanswered_weight","0"), **data}
    record,tags=_prepare(db,data)
    dup="SELECT id FROM exams WHERE title=? AND exam_date=? AND subject_id IS ? AND attempt_number=?"; params=(record["title"],record["exam_date"],record["subject_id"],record["attempt_number"])
    found=db.execute(dup,params).fetchone()
    if found and found[0]!=exam_id and not data.get("allow_duplicate"): raise DuplicateExamError("A matching title, date, subject, and attempt already exists. Change attempt number or explicitly allow a separate attempt.")
    record['revision']=uuid4().hex
    fields=list(record); stamp=now()
    if exam_id is None:
        values=[record[x] for x in fields]+[stamp,stamp]; q=",".join("?"*len(values)); db.execute(f"INSERT INTO exams({','.join(fields)},created_at,updated_at) VALUES({q})",values); exam_id=db.execute("SELECT last_insert_rowid()").fetchone()[0]
    else:
        assignments=",".join(f"{x}=?" for x in fields)+",updated_at=?"; db.execute(f"UPDATE exams SET {assignments} WHERE id=?",[record[x] for x in fields]+[stamp,exam_id])
    if exam_id and data.get('_preserve_timestamps'):
        for key in ('created_at','updated_at'):
            value=data.get(key)
            if value:
                parsed=datetime.fromisoformat(value)
                if parsed.tzinfo is None:raise ValueError('Imported timestamps require a timezone.')
                db.execute(f'UPDATE exams SET {key}=? WHERE id=?',(parsed.astimezone(timezone.utc).isoformat(),exam_id))
    _tags(db,exam_id,tags)
    return _row(db, db.execute(SELECT+' WHERE e.id=?',(exam_id,)).fetchone())
def delete_exam(exam_id:int)->bool:
    with database() as db: return bool(db.execute("DELETE FROM exams WHERE id=?",(exam_id,)).rowcount)
def subjects()->list[str]:
    with database() as db:return [x[0] for x in db.execute("SELECT name FROM subjects ORDER BY name").fetchall()]
def preferences()->dict:
    with database() as db:return {x[0]:x[1] for x in db.execute("SELECT key,value FROM preferences WHERE key!='internal_study_revision'").fetchall()}
def update_preferences(values:dict[str,Any])->dict:
    allowed={"theme","correct_weight","incorrect_weight","unanswered_weight","default_total_questions","application_mode","language","persian_digits"}
    with database() as db:
        for key,value in values.items():
            if key not in allowed:
                continue
            if isinstance(value, (dict, list, bool)) or value is None:
                raise ValueError("Preference values must be text or numbers.")
            if key == "theme" and value not in ("dark", "light"):
                raise ValueError("Theme must be dark or light.")
            if key == "application_mode" and value not in {"quick","advanced"}:
                raise ValueError("Application mode must be quick or advanced.")
            if key == "language" and value not in {"en","fa"}:
                raise ValueError("Language must be en or fa.")
            if key == "persian_digits" and value not in {"native","latin"}:
                raise ValueError("Persian digit setting must be native or latin.")
            if key == "default_total_questions" and _integer(value, "Default total questions") < 1:
                raise ValueError("Default total questions must be a positive integer.")
            if key in {"correct_weight","incorrect_weight","unanswered_weight"}:
                try:
                    numeric = number(value,key,1e-100 if key=='correct_weight' else -1e100 if key=='unanswered_weight' else 0)
                except (TypeError, ValueError) as exc:
                    raise ValueError("Scoring defaults must be numeric.") from exc
                if not math.isfinite(numeric) or (key == "correct_weight" and numeric <= 0) or (key == "incorrect_weight" and numeric < 0):
                    raise ValueError("Scoring defaults must be non-negative; correct weight must be positive.")
            db.execute("INSERT INTO preferences(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(key,str(value)))
        p=dict(db.execute('SELECT key,value FROM preferences'))
        calculate_score(1,0,0,float(p['correct_weight']),float(p['incorrect_weight']),float(p.get('unanswered_weight',0)))
    return preferences()
def export_json(**scope)->dict:return {"version":1,"exported_at":now(),"exams":list_exams(sort="exam_date",direction="asc",**scope),"preferences":preferences(),"scope":scope}
def export_csv(language='en',**scope)->str:
    from .interchange import csv_export
    return csv_export(list_exams(sort='exam_date',direction='asc',**scope),language)

def import_json(payload:dict, allow_duplicate=False, preview=False)->dict:
    if not isinstance(payload,dict) or not isinstance(payload.get('exams'),list):
        raise ValueError('Expected a JSON object with an exams array.')
    if 'version' in payload and (type(payload['version']) is not int or payload['version']!=1):
        raise ValueError('Unsupported import version. Use version 1 or a legacy unversioned exams object.')
    if len(payload['exams'])>10000: raise ValueError('Import supports at most 10000 records.')
    def process(db):
        # Keep every row savepoint inside one outer transaction. Releasing the
        # outermost SQLite savepoint would otherwise commit each accepted row.
        if not db.in_transaction: db.execute('BEGIN')
        results=[]; created=0; skipped=0
        for index,item in enumerate(payload['exams']):
            db.execute('SAVEPOINT import_row')
            try:
                if not isinstance(item,dict): raise ValueError('Each examination must be an object.')
                incoming={**item,'subject':item.get('subject') or item.get('subject_name'),
                          'topic':item.get('topic') or item.get('topic_name'),'allow_duplicate':allow_duplicate,'_preserve_timestamps':True}
                record=_save_exam(db,incoming)
                created+=1; results.append({'row':index+1,'status':'accepted','title':record['title']})
            except DuplicateExamError as exc:
                db.execute('ROLLBACK TO import_row'); skipped+=1
                results.append({'row':index+1,'status':'duplicate','error':str(exc)})
            except (ValueError,TypeError,OverflowError) as exc:
                db.execute('ROLLBACK TO import_row')
                results.append({'row':index+1,'status':'invalid','error':str(exc)})
            finally: db.execute('RELEASE import_row')
        errors=[r for r in results if r['status']=='invalid']
        return {'created':created,'skipped':skipped,'errors':errors,'rows':results,'preview':preview,'atomic':True}
    if preview:
        with database() as source:
            scratch=sqlite3.connect(':memory:'); scratch.row_factory=sqlite3.Row
            try:
                source.backup(scratch); scratch.execute('PRAGMA foreign_keys=ON')
                return process(scratch)
            finally: scratch.close()
    with database() as db:
        result=process(db)
        if result['errors']:
            raise ValueError('Import rejected: invalid rows. Preview the file for row errors; no records were saved.')
        return result

def backup(target:Path)->None:
    with database() as db:
        dest=sqlite3.connect(target)
        try: db.backup(dest)
        finally: dest.close()

def validate_backup(candidate: sqlite3.Connection) -> None:
    """Reject foreign schemas and inconsistent facts before touching live storage."""
    candidate.row_factory = sqlite3.Row
    candidate.execute("PRAGMA trusted_schema=OFF")
    if [r[0] for r in candidate.execute("PRAGMA integrity_check")] != ["ok"]:
        raise ValueError("Backup integrity check failed.")
    if candidate.execute("PRAGMA foreign_key_check").fetchone():
        raise ValueError("Backup contains broken relationships.")
    reference = sqlite3.connect(":memory:")
    reference.row_factory = sqlite3.Row
    try:
        reference.executescript(SCHEMA)
        versions = {r[0] for r in candidate.execute("SELECT version FROM schema_migrations")}
        if versions not in ({1}, {1,2}, {1,2,3}, {1,2,3,4}, {1,2,3,4,5}): raise ValueError("Backup version is unsupported.")
        if 3 in versions:
            from .study import create_schema
            create_schema(reference)
        if 4 in versions:
            from .migrations import migrate as migrate_reference
            migrate_reference(reference,now())
        expected = {r[0]: r[1] for r in reference.execute("SELECT name,sql FROM sqlite_master WHERE type='table'")}
        actual = {r[0]: r[1] for r in candidate.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        normalize = lambda sql: ''.join(sql.lower().split()).replace('ifnotexists', '')
        if actual.keys() != expected.keys() or any(normalize(actual[k]) != normalize(v) for k,v in expected.items()):
            raise ValueError("Backup schema is incomplete or unsupported.")
        expected_objects={(r[0],r[1]):normalize(r[2]) for r in reference.execute("SELECT type,name,sql FROM sqlite_master WHERE type IN ('trigger','view')")}
        actual_objects={(r[0],r[1]):normalize(r[2]) for r in candidate.execute("SELECT type,name,sql FROM sqlite_master WHERE type IN ('trigger','view')")}
        if actual_objects != expected_objects:
            from .migrations import legacy_v4_guards
            historical={key:normalize(sql) for key,sql in legacy_v4_guards().items()}
            if versions != {1,2,3,4} or actual_objects != historical:
                raise ValueError("Backup contains unsupported schema objects.")
        versions = {r[0] for r in candidate.execute("SELECT version FROM schema_migrations")}
        if 3 in versions:
            from .study import validate_backup as validate_study_backup
            validate_study_backup(candidate)
        for row in candidate.execute(SELECT):
            incoming = dict(row)
            incoming.update(subject=row["subject_name"], topic=row["topic_name"])
            prepared, _ = _prepare(reference, incoming)
            for key in ("unanswered", "raw_score", "maximum_score", "percentage"):
                value = row[key]
                if not isinstance(value, (float,int)) or not math.isfinite(value) or not math.isclose(value, prepared[key], rel_tol=1e-9, abs_tol=1e-8):
                    raise ValueError("Backup contains inconsistent examination scores.")
        prefs = dict(candidate.execute("SELECT key,value FROM preferences"))
        for key, choices in {"theme": ("light","dark"), "language": ("en","fa"), "application_mode": ("quick","advanced"), "persian_digits": ("native","latin")}.items():
            if key in prefs and prefs[key] not in choices: raise ValueError("Backup contains invalid preferences.")
        calculate_score(_integer(prefs.get("default_total_questions", "15"), "Default total questions"), 0, 0,
                        number(prefs.get("correct_weight",4),'correct_weight',1e-100),
                        number(prefs.get("incorrect_weight",1),'incorrect_weight',0),
                        number(prefs.get('unanswered_weight',0),'unanswered_weight',-1e100))
        if 'internal_study_revision' in prefs:
            if _integer(prefs['internal_study_revision'],'Study revision')<0:
                raise ValueError('Invalid study revision counter in backup.')
    finally: reference.close()

def _install_backup(staged: sqlite3.Connection) -> None:
    from .study import _revision_floor
    with database() as live:
        floor=_revision_floor(live) if live.execute("SELECT 1 FROM sqlite_master WHERE name='study_weeks'").fetchone() else 0
        staged.backup(live)
    initialize()
    # Restore is a new concurrency generation. Preserve factual dates/durations,
    # while preventing a pre-restore editor from matching an old revision token.
    with database() as db:
        for row in db.execute('SELECT id FROM exams').fetchall():
            db.execute('UPDATE exams SET revision=? WHERE id=?',(uuid4().hex,row[0]))
        revision=max(floor,_revision_floor(db))
        starts=[row[0] for row in db.execute('SELECT week_start FROM study_weeks ORDER BY week_start')]
        if revision+len(starts)>2**53-1:raise ValueError('Study revision range exhausted.')
        for start in starts:
            revision+=1
            db.execute('UPDATE study_weeks SET revision=? WHERE week_start=?',(revision,start))
        db.execute("INSERT INTO preferences VALUES('internal_study_revision',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(str(revision),))

def restore(source:Path)->Path:
    """Serialize in-process database access; retain a recovery copy before restore.

    Run the local application with one worker. The lock does not coordinate separate
    application processes or external SQLite editors.
    """
    if not source.is_file(): raise ValueError("Backup file was not received.")
    staged = sqlite3.connect(":memory:")
    try:
        candidate = sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)
        try: candidate.backup(staged)
        finally: candidate.close()
        validate_backup(staged)
        with DATABASE_LOCK:
            recovery_dir = DB_PATH.parent / "recovery"
            recovery_dir.mkdir(exist_ok=True)
            recovery = recovery_dir / f"before-restore-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{uuid4().hex}.db"
            backup(recovery)
            try:
                _install_backup(staged)
            except Exception as exc:
                original = sqlite3.connect(recovery)
                try:
                    with database() as live: original.backup(live)
                finally: original.close()
                raise ValueError("Restore failed; the original database was recovered.") from exc
            return recovery
    except sqlite3.DatabaseError as exc:
        raise ValueError("The uploaded file is not a valid supported SQLite backup.") from exc
    finally: staged.close()
