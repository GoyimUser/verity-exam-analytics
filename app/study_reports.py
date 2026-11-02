"""Localized text, table exports and print-quality PDF reports from saved weeks."""
from __future__ import annotations
import base64
import csv
from html import escape
import io
import os
from pathlib import Path
from .study import day
from .export_utils import safe_cell

WORDS={
 'en':{'title':'Weekly Study Report','theoretical':'Theoretical study','practical':'Practical study','overall':'Overall total','video':'Video','category':'Category','minutes':'Minutes','duration':'Duration','description':'Description','detail':'Activity breakdown','start':'Week start','end':'Week end','hours':'h','mins':'m','chart':'Time by category','period':'Saturday to Friday','notes':'Notes','week':'Week','total':'Total','group':'Group'},
 'fa':{'title':'گزارش مطالعه هفتگی','theoretical':'مطالعه نظری','practical':'مطالعه عملی','overall':'مجموع کل','video':'ویدیو','category':'دسته','minutes':'دقیقه','duration':'مدت','description':'توضیحات','detail':'ریز فعالیت‌ها','start':'شروع هفته','end':'پایان هفته','hours':'ساعت','mins':'دقیقه','chart':'زمان به تفکیک دسته','period':'شنبه تا جمعه','notes':'یادداشت','week':'هفته','total':'مجموع','group':'گروه'}
}

def number(value,language,digits='native'):
    result=str(value)
    return result.translate(str.maketrans('0123456789','۰۱۲۳۴۵۶۷۸۹')) if language=='fa' and digits=='native' else result

def duration(minutes,language='en',digits='native'):
    h,m=divmod(minutes,60); w=WORDS[language]
    return f"{number(h,language,digits)} {w['hours']} {number(m,language,digits)} {w['mins']}"

def date_label(value,language,digits='native'):
    if language=='fa':
        from .calendar_localization import persian_parts
        year,month,day_number=persian_parts(day(value))
        months=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']
        return number(f'{day_number} {months[month-1]} {year}',language,digits)
    return day(value).strftime('%d %b %Y')

def entry_name(entry,language):
    return entry['name_'+language]+(' · '+WORDS[language]['video'] if entry['video'] else '')

def report_text(week,language='en',digits='native'):
    w=WORDS[language]; lines=[w['title'],f"{date_label(week['week_start'],language,digits)} - {date_label(week['week_end'],language,digits)}",w['period'],'']
    for group in ('theoretical','practical'):
        lines.append(w[group])
        for entry in week['entries']:
            if entry['study_group']!=group or not entry['minutes']:continue
            line=f"{entry_name(entry,language)}: {duration(entry['minutes'],language,digits)}"
            if entry['description']:line+=f" ({entry['description']})"
            lines.append(line)
            for detail in entry['details']:lines.append(f"- {duration(detail['minutes'],language,digits)}: {detail['label']}")
        lines.append(f"{w['total']} {w[group]}: {duration(week['totals'][group],language,digits)}");lines.append('')
    lines.append(f"{w['overall']}: {duration(week['totals']['overall'],language,digits)}")
    if week['notes']:lines.extend(['',w['notes']+': '+week['notes']])
    return '\n'.join(lines)

def table_rows(weeks,language='en',digits='native'):
    w=WORDS[language]
    rows=[[w['start'],w['end'],w['group'],w['category'],w['minutes'],w['duration'],w['description'],w['detail']]]
    for week in weeks:
        for entry in week['entries']:
            if not entry['minutes']:continue
            rows.append([date_label(week['week_start'],language,digits),date_label(week['week_end'],language,digits),w[entry['study_group']],entry_name(entry,language),entry['minutes'],duration(entry['minutes'],language,digits),entry['description'],'\n'.join(f"{d['label']}: {duration(d['minutes'],language,digits)}" for d in entry['details'])])
        for group in ('theoretical','practical','overall'):
            rows.append([date_label(week['week_start'],language,digits),date_label(week['week_end'],language,digits),w[group],w['total'],week['totals'][group],duration(week['totals'][group],language,digits),'',''])
    return rows

def csv_report(weeks,language,digits):
    output=io.StringIO();csv.writer(output).writerows([[safe_cell(x) for x in row] for row in table_rows(weeks,language,digits)])
    return ('\ufeff'+output.getvalue()).encode('utf-8')

def excel_report(weeks,language,digits):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.chart import BarChart, Reference
    from openpyxl.utils import get_column_letter
    book=Workbook(); sheet=book.active;sheet.title=WORDS[language]['title']
    for row in table_rows(weeks,language,digits):sheet.append([safe_cell(x) for x in row])
    sheet.sheet_view.rightToLeft=language=='fa';sheet.freeze_panes='A2';sheet.auto_filter.ref=sheet.dimensions
    for cell in sheet[1]:cell.font=Font(name='Vazirmatn' if language=='fa' else 'Calibri',bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='245C70')
    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            cell.font=Font(name='Vazirmatn' if language=='fa' else 'Calibri')
            cell.alignment=Alignment(vertical='top',wrap_text=True,readingOrder=2 if language=='fa' else 1)
    for index,width in enumerate([26,26,24,32,14,22,50,60],1):sheet.column_dimensions[get_column_letter(index)].width=width
    summary=book.create_sheet(WORDS[language]['chart']);summary.sheet_view.rightToLeft=language=='fa'
    ids=list(dict.fromkeys(e['category_id'] for week in weeks for e in week['entries']))
    labels={e['category_id']:e['current_name_'+language] for week in weeks for e in week['entries']}
    summary.append([WORDS[language]['week']]+[safe_cell(labels[k]) for k in ids])
    for week in weeks:summary.append([date_label(week['week_start'],language,digits)]+[sum(e['minutes'] for e in week['entries'] if e['category_id']==k) for k in ids])
    if weeks and ids:
        chart=BarChart();chart.type='col';chart.grouping='stacked';chart.overlap=100;chart.title=WORDS[language]['chart'];chart.y_axis.title=WORDS[language]['minutes']
        chart.add_data(Reference(summary,min_col=2,max_col=len(ids)+1,min_row=1,max_row=len(weeks)+1),titles_from_data=True)
        colors={e['category_id']:e['color'].lstrip('#') for week in weeks for e in week['entries']}
        for series,category_id in zip(chart.series,ids):
            series.graphicalProperties.solidFill=colors[category_id]
            series.graphicalProperties.line.noFill=True
        chart.set_categories(Reference(summary,min_col=1,min_row=2,max_row=len(weeks)+1));chart.width=24;chart.height=13;summary.add_chart(chart,'A'+str(len(weeks)+4))
    output=io.BytesIO();book.save(output);return output.getvalue()

def report_html(weeks,language='en',digits='native'):
    w=WORDS[language];rtl=language=='fa';font_path=Path(__file__).parents[1]/'static/fonts/Vazirmatn-Regular.ttf'
    font=base64.b64encode(font_path.read_bytes()).decode()
    pages=[]
    for week in weeks:
        entries=[e for e in week['entries'] if e['minutes']]
        max_minutes=max(1,week['totals']['overall']);y=220;segments=[];legend=[]
        for i,entry in enumerate(entries):
            height=entry['minutes']/max_minutes*190;y-=height
            segments.append(f'<rect x="35" y="{y}" width="70" height="{height}" fill="{entry["color"]}"/>')
            legend.append(f'<li><span style="color:{entry["color"]}">■</span> {escape(entry_name(entry,language))} · {duration(entry["minutes"],language,digits)}</li>')
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="150" height="240" viewBox="0 0 150 240"><line x1="20" x2="120" y1="220" y2="220" stroke="#8298a5"/>{"".join(segments)}</svg>'
        groups=[]
        for group in ('theoretical','practical'):
            rows=[]
            for entry in entries:
                if entry['study_group']!=group:continue
                details=''.join(f'<li>{duration(d["minutes"],language,digits)}: {escape(d["label"])}</li>' for d in entry['details'])
                rows.append(f'<div class="entry"><strong>{escape(entry_name(entry,language))}</strong><b>{duration(entry["minutes"],language,digits)}</b><p>{escape(entry["description"])}</p>{"<ul>"+details+"</ul>" if details else ""}</div>')
            groups.append(f'<section><h2>{w[group]}</h2>{"".join(rows)}<p class="subtotal">{w["total"]}: {duration(week["totals"][group],language,digits)}</p></section>')
        pages.append(f'<article><header><small>VERITY · {w["period"]}</small><h1>{w["title"]}</h1><p>{date_label(week["week_start"],language,digits)} - {date_label(week["week_end"],language,digits)}</p></header><div class="total">{w["overall"]}<strong>{duration(week["totals"]["overall"],language,digits)}</strong></div><div class="chart">{svg}<div><h2>{w["chart"]}</h2><ul>{"".join(legend)}</ul></div></div>{"".join(groups)}{("<p class=notes>"+escape(week["notes"])+"</p>") if week["notes"] else ""}</article>')
    return f'''<!doctype html><html lang="{language}" dir="{'rtl' if rtl else 'ltr'}"><meta charset="utf-8"><style>
    @font-face{{font-family:Vazirmatn;src:url(data:font/truetype;base64,{font})}}*{{box-sizing:border-box}}body{{font-family:Vazirmatn,sans-serif;color:#19364a;font-size:11pt;line-height:1.7;margin:0}}article{{break-after:page}}article:last-child{{break-after:auto}}h1{{font-size:25pt;margin:8px 0}}h2{{font-size:14pt;margin:12px 0}}header{{border-bottom:2px solid #28876c;padding-bottom:14px}}small{{color:#56717f;letter-spacing:1px}}.total{{padding:14px 20px;margin:20px 0;background:#edf7f3;border-radius:12px}}.total strong{{display:block;font-size:24pt}}.chart{{display:flex;align-items:center;gap:30px;margin:20px 0;break-inside:avoid}}.chart ul{{list-style:none;padding:0;font-size:9pt}}.entry{{border-bottom:1px solid #dde6eb;padding:10px 0;break-inside:avoid}}.entry>b{{float:{'left' if rtl else 'right'}}}.entry p{{margin:4px 0;color:#4d6574;white-space:pre-wrap;overflow-wrap:anywhere}}.entry ul{{margin:4px 0}}.subtotal{{font-weight:bold}}.notes{{white-space:pre-wrap;background:#f4f7f8;padding:15px}}section{{break-inside:auto}}h2{{break-after:avoid}}
    /* A normal weekly report fits one A4 page; long breakdowns can flow naturally. */
    body{{font-size:10pt;line-height:1.55}}h1{{font-size:22pt;margin:6px 0}}header{{padding-bottom:10px}}.total{{padding:10px 16px;margin:14px 0}}.total strong{{font-size:22pt}}.chart{{margin:12px 0;gap:20px}}.chart svg{{height:150px;width:100px;flex-shrink:0}}.chart h2{{margin:4px 0}}.chart ul{{font-size:9pt;margin:4px 0}}.entry{{padding:7px 0}}.entry p:empty{{display:none}}h2{{margin:10px 0}}.notes{{padding:10px}}.subtotal{{break-before:avoid}}.entry ul,.notes,strong{{overflow-wrap:anywhere}}.entry>b{{margin-inline-start:12px}}
    </style><body>{''.join(pages)}</body></html>'''

def pdf_report(weeks,language,digits):
    from .pdf_render import render_pdf
    return render_pdf(report_html(weeks,language,digits))
