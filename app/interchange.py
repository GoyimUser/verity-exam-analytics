"""Versioned CSV interchange. Stable headings; canonical dates and JSON tags."""
import csv
import io
import json
from .export_utils import safe_cell

# Keep existing first 16 columns for old readers, append snapshot metadata.
FIELDS=['title','subject_name','topic_name','exam_type','exam_date','total_questions','correct_answers','incorrect_answers','unanswered','raw_score','maximum_score','percentage','duration_minutes','attempt_number','notes','tags','correct_weight','incorrect_weight','unanswered_weight','start_time','end_time','created_at','updated_at','csv_version']
HEADERS_FA=['نام آزمون','درس','موضوع','نوع آزمون','تاریخ میلادی','کل پرسش‌ها','پاسخ درست','پاسخ نادرست','بی‌پاسخ','نمره خام','حداکثر نمره','درصد','مدت (دقیقه)','شماره تلاش','یادداشت','برچسب‌ها','امتیاز درست','جریمه نادرست','امتیاز بی‌پاسخ','زمان شروع','زمان پایان','زمان ایجاد','زمان ویرایش','csv_version']
NUMERIC={'duration_minutes','correct_weight','incorrect_weight','unanswered_weight'}
INTEGER={'total_questions','correct_answers','incorrect_answers','attempt_number'}


def csv_export(rows,language="en"):
    out=io.StringIO();writer=csv.writer(out);writer.writerow(HEADERS_FA if language=="fa" else FIELDS)
    for row in rows:
        record={k:row.get(k,'') for k in FIELDS};record['csv_version']='1';record['tags']=json.dumps(row['tags'],ensure_ascii=False)
        # Escape leading apostrophes too, making neutralization reversible.
        writer.writerow([("'"+v if isinstance(v,str) and v.startswith("'") else safe_cell(v)) for v in record.values()])
    return out.getvalue()


def csv_payload(content):
    reader=csv.DictReader(io.StringIO(content.lstrip('\ufeff')))
    if reader.fieldnames==HEADERS_FA:reader.fieldnames=FIELDS
    if reader.fieldnames!=FIELDS:raise ValueError('CSV headings must match the version 1 export schema.')
    rows=[]
    for row in reader:
        if None in row or any(v is None for v in row.values()):raise ValueError('Invalid CSV column count.')
        if row.pop('csv_version')!='1':raise ValueError('Unsupported CSV version.')
        for k,v in list(row.items()):
            if v.startswith("'") and (v[1:].startswith("'") or v[1:].lstrip().startswith(('=','+','-','@'))):row[k]=v[1:]
        for k in INTEGER:row[k]=int(row[k])
        for k in NUMERIC:row[k]=float(row[k]) if row[k] else None
        row['tags']=json.loads(row['tags']);rows.append(row)
        if len(rows)>10000:raise ValueError('Import supports at most 10000 records.')
    return {'version':1,'exams':rows}
