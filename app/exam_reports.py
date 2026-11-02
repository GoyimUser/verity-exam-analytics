"""Localized examination reports derived from the selected saved records."""
import base64
from html import escape
import io
from pathlib import Path
from .analytics import build_analytics
from .study_reports import number,date_label
from .export_utils import safe_cell
from .pdf_render import render_pdf

WORDS={
 'en':dict(title='Examination performance report',summary='Performance summary',count='Examinations',mean='Mean percentage',weighted='Maximum-score weighted percentage',accuracy='Attempt accuracy',scope='Selected filters',all='All records',trend='Chronological results',records='Examination records',title_field='Title',date='Date',subject='Subject',topic='Topic',type='Type',total='Questions',correct='Correct',incorrect='Incorrect',unanswered='Unanswered',raw='Raw score',maximum='Maximum score',percentage='Percentage',duration='Minutes',attempt='Attempt',correct_weight='Correct points',incorrect_weight='Incorrect penalty',unanswered_weight='Unanswered points',start='Start time',end='End time',notes='Notes',tags='Tags',created='Created (UTC)',updated='Modified (UTC)',none='Not recorded'),
 'fa':dict(title='گزارش عملکرد آزمون‌ها',summary='خلاصه عملکرد',count='تعداد آزمون‌ها',mean='میانگین درصد',weighted='درصد وزنی بر پایه حداکثر نمره',accuracy='دقت پاسخ‌های داده‌شده',scope='فیلترهای انتخاب‌شده',all='همه رکوردها',trend='روند نتایج به ترتیب تاریخ',records='رکوردهای آزمون',title_field='نام',date='تاریخ',subject='درس',topic='موضوع',type='نوع',total='کل پرسش‌ها',correct='درست',incorrect='نادرست',unanswered='بی‌پاسخ',raw='نمره خام',maximum='حداکثر نمره',percentage='درصد',duration='دقیقه',attempt='تلاش',correct_weight='امتیاز درست',incorrect_weight='جریمه نادرست',unanswered_weight='امتیاز بی‌پاسخ',start='زمان شروع',end='زمان پایان',notes='یادداشت',tags='برچسب‌ها',created='ایجاد (UTC)',updated='ویرایش (UTC)',none='ثبت نشده')}
FIELDS={'title':'title_field','exam_date':'date','subject_name':'subject','topic_name':'topic','exam_type':'type','total_questions':'total','correct_answers':'correct','incorrect_answers':'incorrect','unanswered':'unanswered','raw_score':'raw','maximum_score':'maximum','percentage':'percentage','duration_minutes':'duration','attempt_number':'attempt','correct_weight':'correct_weight','incorrect_weight':'incorrect_weight','unanswered_weight':'unanswered_weight','start_time':'start','end_time':'end','notes':'notes','tags':'tags','created_at':'created','updated_at':'updated'}


def display(value,language,digits):
    if isinstance(value,list):return ', '.join(value)
    if isinstance(value,(int,float)):
        result=number(f'{value:,.2f}'.rstrip('0').rstrip('.') if isinstance(value,float) else f'{value:,}',language,digits)
        return result.replace('.', '٫').replace(',', '٬') if language=='fa' and digits=='native' else result
    return str(value) if value not in ('',None) else WORDS[language]['none']


def summary(rows):
    a=build_analytics(rows);s=a.get('summary',{})
    return [('count',len(rows)),('mean',s.get('mean_percentage')),('weighted',s.get('weighted_percentage')),('accuracy',s.get('overall_accuracy'))]


def excel(rows,language='en',digits='native',scope=None):
    from openpyxl import Workbook
    from openpyxl.styles import Font,PatternFill,Alignment
    from openpyxl.chart import LineChart,Reference
    from openpyxl.utils import get_column_letter
    w=WORDS[language];book=Workbook();sheet=book.active;sheet.title=w['records']
    sheet.append([w[v] for v in FIELDS.values()])
    for row in rows:sheet.append([safe_cell(', '.join(row[k]) if isinstance(row.get(k),list) else row.get(k)) for k in FIELDS])
    stats=book.create_sheet(w['summary']);stats.append([w['summary'],w['percentage']])
    for key,value in summary(rows):stats.append([w[key],value])
    stats.append([w['scope'],safe_cell(str(scope or w['all']))])
    if rows:
        chart=LineChart();chart.title=w['trend'];chart.y_axis.title=w['percentage']
        chart.add_data(Reference(sheet,min_col=12,max_col=12,min_row=1,max_row=len(rows)+1),titles_from_data=True)
        chart.set_categories(Reference(sheet,min_col=2,min_row=2,max_row=len(rows)+1));chart.width=23;chart.height=12;stats.add_chart(chart,'A9')
    for tab in book:
        tab.sheet_view.rightToLeft=language=='fa';tab.freeze_panes='A2'
        for cell in tab[1]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='245C70')
        for column in range(1,tab.max_column+1):tab.column_dimensions[get_column_letter(column)].width=25
        for row in tab.iter_rows(min_row=2):
            for cell in row:cell.alignment=Alignment(wrap_text=True,vertical='top',readingOrder=2 if language=='fa' else 1)
    sheet.auto_filter.ref=sheet.dimensions
    stream=io.BytesIO();book.save(stream);return stream.getvalue()


def html_report(rows,language='en',digits='native',scope=None):
    w=WORDS[language];rtl=language=='fa'
    font=base64.b64encode((Path(__file__).parents[1]/'static/fonts/Vazirmatn-Regular.ttf').read_bytes()).decode()
    def fmt(v):return escape(display(v,language,digits))
    def isolate(v):return '<bdi>'+fmt(v)+'</bdi>'
    cards=''.join(f'<div><small>{w[k]}</small><strong><bdi dir="ltr">{fmt(v)}{("٪" if rtl else "%") if k!="count" and v is not None else ""}</bdi></strong></div>' for k,v in summary(rows))
    values=[r['percentage'] for r in rows];low=min([0]+values);high=max([100]+values);span=high-low or 1
    points=' '.join(f'{45+i*570/max(1,len(rows)-1):.2f},{190-(v-low)/span*160:.2f}' for i,v in enumerate(values))
    markers=''.join(f'<circle cx="{45+i*570/max(1,len(rows)-1):.2f}" cy="{190-(v-low)/span*160:.2f}" r="3" fill="#087e69"/>' for i,v in enumerate(values))
    chart=f'<svg viewBox="0 0 660 230" role="img" aria-label="{w["trend"]}"><path d="M45 20V190H630" stroke="#8298a5" fill="none"/><text direction="ltr" unicode-bidi="isolate" x="5" y="30">{fmt(high)}%</text><text direction="ltr" unicode-bidi="isolate" x="5" y="190">{fmt(low)}%</text><polyline points="{points}" stroke="#087e69" stroke-width="2" fill="none"/></svg>'
    chart=chart.replace('</svg>',markers+'</svg>')
    if rows:chart+=f'<p class="ends"><bdi>{date_label(rows[0]["exam_date"],language,digits)}</bdi><bdi>{date_label(rows[-1]["exam_date"],language,digits)}</bdi></p>'
    sections=[]
    for row in rows:
        cells=''.join(f'<div><dt>{w[label]}</dt><dd>{isolate(date_label(row[k],language,digits) if k=="exam_date" else row.get(k))}</dd></div>' for k,label in FIELDS.items() if k not in ('title','notes'))
        sections.append(f'<section><h2>{isolate(row["title"])}</h2><dl>{cells}</dl><p class="notes"><b>{w["notes"]}</b><br>{isolate(row.get("notes"))}</p></section>')
    scopes=' · '.join(str(v) for v in (scope or {}).values() if v) or w['all']
    return f'''<!doctype html><html lang="{language}" dir="{'rtl' if rtl else 'ltr'}"><meta charset="utf-8"><style>
    @font-face{{font-family:Vazirmatn;src:url(data:font/truetype;base64,{font})}}*{{box-sizing:border-box}}body{{font:10pt/1.65 Vazirmatn,sans-serif;color:#19364a}}h1{{font-size:24pt}}h2{{font-size:15pt;break-after:avoid}}header{{border-bottom:2px solid #087e69}}.cards{{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:20px 0}}.cards>div{{background:#edf7f3;padding:14px;border-radius:10px}}strong{{display:block;font-size:22pt;overflow-wrap:anywhere}}svg{{width:100%;height:200px}}.ends{{display:flex;justify-content:space-between;direction:ltr}}section{{break-before:page}}dl{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}dl>div{{border-bottom:1px solid #dbe6ea;break-inside:avoid}}dt{{color:#526878;font-size:9pt}}dd{{margin:0;font-weight:bold;overflow-wrap:anywhere}}.notes{{white-space:pre-wrap;overflow-wrap:anywhere}}bdi{{unicode-bidi:isolate}}small{{color:#526878}}</style><body><header><small>VERITY</small><h1>{w['title']}</h1><p>{w['scope']}: {isolate(scopes)}</p></header><div class="cards">{cards}</div><h2>{w['trend']}</h2>{chart}{''.join(sections)}</body></html>'''


def pdf(rows,language,digits,scope):
    return render_pdf(html_report(rows,language,digits,scope))
