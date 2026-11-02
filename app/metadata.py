"""Referenced-safe management of examination subjects and topics."""
from uuid import uuid4
from . import storage


def list_metadata():
    with storage.database() as db:
        subjects=[dict(r) for r in db.execute('SELECT s.*, (SELECT count(*) FROM exams e WHERE e.subject_id=s.id) exam_count FROM subjects s ORDER BY name')]
        topics=[dict(r) for r in db.execute('SELECT t.*, (SELECT count(*) FROM exams e WHERE e.topic_id=t.id) exam_count FROM topics t ORDER BY name')]
        return {'subjects':subjects,'topics':topics}


def change(kind,identifier,name=None,delete=False):
    if kind not in ('subjects','topics'):raise ValueError('Invalid metadata kind.')
    with storage.database() as db:
        if not db.execute(f'SELECT 1 FROM {kind} WHERE id=?',(identifier,)).fetchone():raise storage.ExaminationNotFoundError('Metadata not found.')
        column='subject_id' if kind=='subjects' else 'topic_id'
        if delete:
            used=db.execute(f'SELECT 1 FROM exams WHERE {column}=?',(identifier,)).fetchone()
            if kind=='subjects':used=used or db.execute('SELECT 1 FROM topics WHERE subject_id=?',(identifier,)).fetchone()
            if used:raise ValueError('metadataReferenced')
            db.execute(f'DELETE FROM {kind} WHERE id=?',(identifier,));return {'deleted':True}
        if not isinstance(name,str) or not name.strip() or len(name)>500:raise ValueError('Invalid metadata name.')
        name=name.strip()
        if kind=='topics':
            parent=db.execute('SELECT subject_id FROM topics WHERE id=?',(identifier,)).fetchone()[0]
            if db.execute('SELECT 1 FROM topics WHERE subject_id IS ? AND name=? AND id!=?',(parent,name,identifier)).fetchone():raise ValueError('metadataDuplicate')
        db.execute(f'UPDATE {kind} SET name=? WHERE id=?',(name,identifier))
        for row in db.execute(f'SELECT id FROM exams WHERE {column}=?',(identifier,)).fetchall():
            db.execute('UPDATE exams SET revision=?,updated_at=? WHERE id=?',(uuid4().hex,storage.now(),row[0]))
        return {'updated':True}
