"""Independent weekly study aggregates. No exam facts or daily logs are used."""
from __future__ import annotations
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean, median, pstdev
import re
from . import storage

SCHEMA = """
CREATE TABLE IF NOT EXISTS study_categories (
 id INTEGER PRIMARY KEY, code TEXT UNIQUE, name_en TEXT NOT NULL, name_fa TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', study_group TEXT NOT NULL CHECK(study_group IN ('theoretical','practical')),
 color TEXT NOT NULL, display_order INTEGER NOT NULL DEFAULT 0,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS study_weeks (
 week_start TEXT PRIMARY KEY CHECK(length(week_start)=10 AND strftime('%w',week_start)='6'),
 notes TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS study_entries (
 id INTEGER PRIMARY KEY, week_start TEXT NOT NULL REFERENCES study_weeks(week_start) ON DELETE CASCADE,
 category_id INTEGER NOT NULL REFERENCES study_categories(id) ON DELETE RESTRICT,
 video INTEGER NOT NULL DEFAULT 0 CHECK(video IN (0,1)),
 name_en TEXT NOT NULL, name_fa TEXT NOT NULL,
 study_group TEXT NOT NULL CHECK(study_group IN ('theoretical','practical')),
 minutes INTEGER CHECK(minutes IS NULL OR (typeof(minutes)='integer' AND minutes BETWEEN 0 AND 10080)),
 description TEXT NOT NULL DEFAULT '', UNIQUE(week_start,category_id,video)
);
CREATE TABLE IF NOT EXISTS study_details (
 id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES study_entries(id) ON DELETE CASCADE,
 label TEXT NOT NULL, minutes INTEGER NOT NULL CHECK(typeof(minutes)='integer' AND minutes BETWEEN 0 AND 10080),
 display_order INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_study_entry_category ON study_entries(category_id,week_start);
CREATE INDEX IF NOT EXISTS idx_study_detail_entry ON study_details(entry_id);
"""

DEFAULTS = [
 ('parity','Parity','زوجیت','theoretical','#5b8def'),
 ('counting','Counting','شمارش','theoretical','#7c6fdd'),
 ('invariants','Invariants','ناوردایی','theoretical','#d779b1'),
 ('induction','Induction','استقرا','theoretical','#d8a34e'),
 ('pigeonhole','Pigeonhole Principle','اصل لانه کبوتری','theoretical','#45a3aa'),
 ('exam','Examination','آزمون','theoretical','#df795f'),
 ('analysis','Exam Analysis','تحلیل آزمون','theoretical','#819842'),
 ('programming','Programming – Free Tags','برنامه‌نویسی تگ آزاد','practical','#39af8b'),
 ('binary-search','Binary Search','باینری سرچ','practical','#ad85d7'),
 ('dp','DP','DP','practical','#459ac7'),
 ('contest','Contest','کانتست','practical','#c68146'),
]

class StudyError(ValueError):
    def __init__(self, code, status=422):
        self.code, self.status = code, status
        super().__init__(code)

def create_schema(db):
    for statement in SCHEMA.split(';'):
        if statement.strip(): db.execute(statement)

def migrate(db):
    if db.execute('SELECT 1 FROM schema_migrations WHERE version=3').fetchone(): return
    if not db.in_transaction: db.execute('BEGIN IMMEDIATE')
    create_schema(db)
    stamp=storage.now()
    for order,(code,en,fa,group,color) in enumerate(DEFAULTS):
        db.execute('INSERT INTO study_categories(code,name_en,name_fa,study_group,color,display_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
                   (code,en,fa,group,color,order,stamp,stamp))
    db.execute('INSERT INTO schema_migrations VALUES(3,?)',(stamp,))

def day(value):
    try:
        parsed=date.fromisoformat(value)
        if parsed.isoformat()!=value: raise ValueError()
        return parsed
    except (ValueError,TypeError): raise StudyError('studyInvalidDate')

def week_bounds(value):
    chosen=day(value)
    try:
        start=chosen-timedelta(days=(chosen.weekday()-5)%7)
        end=start+timedelta(days=6)
    except OverflowError: raise StudyError('studyInvalidDate')
    # Match the existing Jalali input range in both languages. A complete week
    # must remain selectable after switching calendars (Jalali years 1200–1600).
    if start < date(1821,3,21) or end > date(2222,3,20):
        raise StudyError('studyDateRange')
    return start.isoformat(),end.isoformat()

def integer(value, maximum=10080):
    if type(value) is not int or not 0<=value<=maximum: raise StudyError('studyInvalidDuration')
    return value

def text(value, limit=2000):
    if (not isinstance(value,str) or len(value)>limit or
        re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]',value)):
        raise StudyError('studyInvalidText')
    return value.strip()

def duration(hours,minutes):
    return integer(integer(hours,168)*60+integer(minutes,59))

def categories():
    with storage.database() as db:
        return [dict(r) for r in db.execute('SELECT * FROM study_categories ORDER BY display_order,id')]

def save_category(data,category_id=None):
    with storage.database() as db:
        old=db.execute('SELECT * FROM study_categories WHERE id=?',(category_id,)).fetchone() if category_id else None
        if category_id and not old: raise StudyError('studyMissingCategory',404)
        values={**(dict(old) if old else {'description':'','display_order':0,'enabled':1}),**data}
        en,fa=text(values.get('name_en',''),100),text(values.get('name_fa',''),100)
        if not en or not fa: raise StudyError('studyCategoryName')
        group=values.get('study_group'); color=values.get('color')
        if group not in ('theoretical','practical'): raise StudyError('studyInvalidGroup')
        if not isinstance(color,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',color): raise StudyError('studyInvalidColor')
        order=integer(values['display_order'],100000); enabled=values['enabled']
        if type(enabled) not in (bool,int) or enabled not in (0,1): raise StudyError('studyInvalidCategory')
        row=(en,fa,text(values['description']),group,color,order,int(enabled),storage.now())
        if old:
            db.execute('UPDATE study_categories SET name_en=?,name_fa=?,description=?,study_group=?,color=?,display_order=?,enabled=?,updated_at=? WHERE id=?',(*row,category_id))
        else:
            category_id=db.execute('INSERT INTO study_categories(name_en,name_fa,description,study_group,color,display_order,enabled,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',(*row,row[-1])).lastrowid
        return dict(db.execute('SELECT * FROM study_categories WHERE id=?',(category_id,)).fetchone())

def _read_many(db,from_date='',to_date=''):
    weeks={r['week_start']:dict(r) for r in db.execute("SELECT * FROM study_weeks WHERE (?='' OR week_start>=?) AND (?='' OR week_start<=?) ORDER BY week_start",(from_date,from_date,to_date,to_date))}
    details=defaultdict(list)
    for r in db.execute("SELECT d.*,e.week_start FROM study_details d JOIN study_entries e ON e.id=d.entry_id WHERE (?='' OR e.week_start>=?) AND (?='' OR e.week_start<=?) ORDER BY d.display_order,d.id",(from_date,from_date,to_date,to_date)):
        details[r['entry_id']].append({'label':r['label'],'minutes':r['minutes']})
    for week in weeks.values():week.update(week_end=week_bounds(week['week_start'])[1],entries=[])
    for r in db.execute("SELECT e.*,c.color,c.display_order,c.enabled,c.name_en current_name_en,c.name_fa current_name_fa FROM study_entries e JOIN study_categories c ON c.id=e.category_id WHERE (?='' OR week_start>=?) AND (?='' OR week_start<=?) ORDER BY c.display_order,c.id,e.video",(from_date,from_date,to_date,to_date)):
        entry=dict(r);entry['details']=details[entry['id']]
        if entry['minutes'] is None:entry['minutes']=sum(d['minutes'] for d in entry['details'])
        weeks[entry['week_start']]['entries'].append(entry)
    for week in weeks.values():
        week['totals']={g:sum(e['minutes'] for e in week['entries'] if e['study_group']==g) for g in ('theoretical','practical')}
        week['totals']['overall']=sum(week['totals'].values())
    return list(weeks.values())


def _read(db,start):
    return next(iter(_read_many(db,start,start)),{'week_start':start,'week_end':week_bounds(start)[1],'notes':'','revision':0,'created_at':None,'updated_at':None,'entries':[],'totals':{'theoretical':0,'practical':0,'overall':0}})


def get_week(value):
    start,_=week_bounds(value)
    with storage.database() as db:return _read(db,start)

def prepare_entries(db,rows,old):
    if not isinstance(rows,list) or len(rows)>200: raise StudyError('studyInvalidEntries')
    prepared=[]; seen=set()
    for item in rows:
        if not isinstance(item,dict): raise StudyError('studyInvalidEntries')
        category_id=integer(item.get('category_id'),2**31-1); video=item.get('video',False)
        if type(video) not in (bool,int) or video not in (0,1): raise StudyError('studyInvalidEntries')
        key=(category_id,int(video))
        if key in seen: raise StudyError('studyDuplicateCategory')
        seen.add(key)
        category=db.execute('SELECT * FROM study_categories WHERE id=?',(category_id,)).fetchone()
        if not category: raise StudyError('studyMissingCategory')
        existing=old.get(key)
        if not category['enabled'] and not existing: raise StudyError('studyDisabledCategory')
        details=item.get('details',[])
        if not isinstance(details,list) or len(details)>100: raise StudyError('studyInvalidEntries')
        parts=[]
        for part in details:
            if not isinstance(part,dict):raise StudyError('studyInvalidEntries')
            label=text(part.get('label',''),500)
            if not label:raise StudyError('studyDetailLabel')
            parts.append({'label':label,'minutes':integer(part.get('minutes'))})
        # Details are the sole source when supplied; the aggregate is ignored.
        minutes=sum(p['minutes'] for p in parts) if parts else integer(item.get('minutes',0))
        integer(minutes)
        source=existing or category
        prepared.append({'category_id':category_id,'video':int(video),'name_en':source['name_en'],'name_fa':source['name_fa'],
            'study_group':source['study_group'],'description':text(item.get('description','')),'minutes':minutes,'details':parts})
    if sum(e['minutes'] for e in prepared)>10080:raise StudyError('studyWeekLimit')
    return prepared

def save_week(value,data):
    start,_=week_bounds(value)
    # An explicit empty list records a rest week; an omitted list is not consent
    # to erase an existing week's entries through an incomplete PUT request.
    if 'entries' not in data:raise StudyError('studyInvalidEntries')
    with storage.database() as db:
        if not db.in_transaction:db.execute('BEGIN IMMEDIATE')
        current=_read(db,start)
        if data.get('revision')!=current['revision'] or type(data.get('revision')) is not int:raise StudyError('studyConflict',409)
        entries=prepare_entries(db,data['entries'],{(e['category_id'],e['video']):e for e in current['entries']})
        notes=text(data.get('notes',''),5000); stamp=storage.now()
        revision=integer(_revision_floor(db)+1,2**53-1)
        db.execute("INSERT INTO preferences VALUES('internal_study_revision',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(str(revision),))
        db.execute('INSERT INTO study_weeks(week_start,notes,revision,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(week_start) DO UPDATE SET notes=excluded.notes,revision=excluded.revision,updated_at=excluded.updated_at',(start,notes,revision,stamp,stamp))
        db.execute('DELETE FROM study_entries WHERE week_start=?',(start,))
        for e in entries:
            entry_id=db.execute('INSERT INTO study_entries(week_start,category_id,video,name_en,name_fa,study_group,minutes,description) VALUES(?,?,?,?,?,?,?,?)',
                (start,e['category_id'],e['video'],e['name_en'],e['name_fa'],e['study_group'],None if e['details'] else e['minutes'],e['description'])).lastrowid
            for order,part in enumerate(e['details']):
                db.execute('INSERT INTO study_details(entry_id,label,minutes,display_order) VALUES(?,?,?,?)',(entry_id,part['label'],part['minutes'],order))
        return _read(db,start)

def _revision_floor(db):
    """Keep an opaque, monotonic token even after the final report is deleted.

    The existing versioned preference store avoids a destructive table migration.
    Old backups without this internal counter seed from their surviving reports.
    """
    stored=db.execute("SELECT value FROM preferences WHERE key='internal_study_revision'").fetchone()
    maximum=db.execute('SELECT COALESCE(MAX(revision),0) FROM study_weeks').fetchone()[0]
    return max(int(stored[0]) if stored else 0,maximum)


def delete_week(value,revision):
    start,_=week_bounds(value)
    with storage.database() as db:
        floor=_revision_floor(db)
        if not db.execute('DELETE FROM study_weeks WHERE week_start=? AND revision=?',(start,revision)).rowcount:raise StudyError('studyConflict',409)
        db.execute("INSERT INTO preferences VALUES('internal_study_revision',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",(str(floor),))

def list_weeks(from_date='',to_date='',category_id=None):
    if from_date:from_date=week_bounds(from_date)[0]
    if to_date:to_date=week_bounds(to_date)[0]
    if from_date and to_date and from_date>to_date:raise StudyError('studyInvalidRange')
    with storage.database() as db:
        weeks=_read_many(db,from_date,to_date)
    if category_id is not None:
        for week in weeks:
            week['entries']=[e for e in week['entries'] if e['category_id']==category_id]
            week['totals']={g:sum(e['minutes'] for e in week['entries'] if e['study_group']==g) for g in ('theoretical','practical')}
            week['totals']['overall']=sum(week['totals'].values())
    return weeks

def analytics(weeks,calendar='gregorian'):
    totals=[w['totals']['overall'] for w in weeks]; category_totals=defaultdict(int); months=defaultdict(lambda:{'minutes':0,'count':0})
    all_minutes=sum(totals)
    for i,week in enumerate(weeks):
        previous=weeks[i-1] if i else None
        week['change_minutes']=week['totals']['overall']-previous['totals']['overall'] if previous and (day(week['week_start'])-day(previous['week_start'])).days==7 else None
        week['moving_average_minutes']=mean(totals[max(0,i-2):i+1])
        month=week['week_start'][:7]
        if calendar=='persian':
            from .calendar_localization import persian_parts
            year,month_number,_=persian_parts(day(week['week_start']))
            month=f'{year:04d}-{month_number:02d}'
        months[month]['minutes']+=week['totals']['overall'];months[month]['count']+=1
        for e in week['entries']:category_totals[e['category_id']]+=e['minutes']
    group_totals={g:sum(w['totals'][g] for w in weeks) for g in ('theoretical','practical')}
    return {'weeks':weeks,'count':len(weeks),'total_minutes':all_minutes,'group_totals':group_totals,
        'shares':{g:minutes/all_minutes*100 if all_minutes else None for g,minutes in group_totals.items()},
        'average_minutes':mean(totals) if totals else None,'median_minutes':median(totals) if totals else None,
        'std_minutes':pstdev(totals) if len(totals)>1 else None,
        'highest_week':weeks[totals.index(max(totals))]['week_start'] if totals else None,
        'lowest_week':weeks[totals.index(min(totals))]['week_start'] if totals else None,
        'category_totals':[{'category_id':k,'minutes':v,'share':v/all_minutes*100 if all_minutes else None} for k,v in category_totals.items()],
        'months':[{'month':k,**v} for k,v in sorted(months.items())]}

def validate_backup(db):
    for row in db.execute('SELECT * FROM study_categories'):
        if not text(row['name_en'],100) or not text(row['name_fa'],100) or not re.fullmatch(r'#[0-9a-fA-F]{6}',row['color']):raise ValueError('Invalid study categories in backup.')
        text(row['description']);integer(row['display_order'],100000)
    for row in db.execute('SELECT week_start FROM study_weeks'):
        start=row[0]
        if week_bounds(start)[0]!=start:raise ValueError('Invalid study week in backup.')
        week=_read(db,start)
        if integer(week['revision'],2**53-1)<1:raise ValueError('Invalid study revision in backup.')
        text(week['notes'],5000)
        if len(week['entries'])>200:raise ValueError('Too many study entries in backup.')
        if week['totals']['overall']>10080:raise ValueError('Invalid study duration in backup.')
        for entry in db.execute('SELECT * FROM study_entries WHERE week_start=?',(start,)):
            if not text(entry['name_en'],100) or not text(entry['name_fa'],100):raise ValueError('Invalid study entry name in backup.')
            text(entry['description'])
            count=db.execute('SELECT COUNT(*) FROM study_details WHERE entry_id=?',(entry['id'],)).fetchone()[0]
            if (entry['minutes'] is None)!=(count>0):raise ValueError('Ambiguous study duration in backup.')
            if count>100:raise ValueError('Too many study details in backup.')
    for row in db.execute('SELECT label,display_order FROM study_details'):
        if not text(row['label'],500):raise ValueError('Invalid study detail in backup.')
        integer(row['display_order'],100)
