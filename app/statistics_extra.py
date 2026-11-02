"""Descriptive, reproducible statistics. No significance or causality claims."""
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean, pstdev

def describe(rows):
    values=[r['percentage'] for r in rows]
    return {'count':len(rows),'mean':mean(values) if values else None,
            'std_dev':pstdev(values) if len(values)>1 else None,
            'ids':[r['id'] for r in rows],
            'from':min((r['exam_date'] for r in rows),default=None),
            'to':max((r['exam_date'] for r in rows),default=None)}

def compare(first,second):
    a,b=describe(first),describe(second)
    return {'first':a,'second':b,'delta_pp':b['mean']-a['mean'] if a['count'] and b['count'] else None,
            'volatility_delta_pp':b['std_dev']-a['std_dev'] if a['std_dev'] is not None and b['std_dev'] is not None else None,
            'tentative':min(a['count'],b['count'])<5,'overlapping_ids':sorted(set(a['ids'])&set(b['ids']))}

def group_summary(rows,key):
    groups=defaultdict(list)
    for row in rows: groups[key(row)].append(row)
    result=[]
    for identity,group in sorted(groups.items(),key=lambda pair:str(pair[0])):
        row={'label':identity,**describe(group),'error_rate':sum(r['incorrect_answers'] for r in group)/sum(r['total_questions'] for r in group)*100,'tentative':len(group)<5}
        if isinstance(identity,tuple):
            row.update(label=' / '.join(value or 'Unassigned' for value in identity),kind='topic',subject=identity[0],topic=identity[1])
        result.append(row)
    return result

def extended(rows):
    weekly=group_summary(rows,lambda r:(date.fromisoformat(r['exam_date'])-timedelta(days=date.fromisoformat(r['exam_date']).weekday())).isoformat())
    topics=group_summary(rows,lambda r:(r.get('subject_name'),r.get('topic_name')))
    types=group_summary(rows,lambda r:r.get('exam_type') or 'Practice')
    x=[date.fromisoformat(r['exam_date']).toordinal() for r in rows]; y=[r['percentage'] for r in rows]
    slope=None
    if len(set(x))>=3:
        xm,ym=mean(x),mean(y)
        slope=sum((a-xm)*(b-ym) for a,b in zip(x,y))/sum((a-xm)**2 for a in x)
    best_up=best_down=up=down=0
    periods=[]; run=[]; direction=0
    for index in range(1,len(rows)):
        change=(y[index]>y[index-1])-(y[index]<y[index-1])
        up=up+1 if change>0 else 0; down=down+1 if change<0 else 0
        best_up=max(best_up,up);best_down=max(best_down,down)
        if change!=direction or not change:
            if run: periods.append({'direction':direction,'ids':run})
            run=[rows[index-1]['id'],rows[index]['id']] if change else []
        elif change: run.append(rows[index]['id'])
        direction=change
    if run: periods.append({'direction':direction,'ids':run})
    return {'weekly':weekly,'topics':topics,'exam_types':types,'slope_pp_per_day':slope,
            'streaks':{'current_improvements':up,'current_declines':down,'longest_improvements':best_up,'longest_declines':best_down,'periods':periods},
            'recent_comparison':compare(rows[-10:-5],rows[-5:]) if len(rows)>=10 else None,
            'best_week':max(weekly,key=lambda w:w['mean']) if weekly else None,
            'worst_week':min(weekly,key=lambda w:w['mean']) if weekly else None}

def simulate(rows,probability):
    if isinstance(probability,bool) or not isinstance(probability,(int,float)) or not 0<=probability<=1:
        raise ValueError('Assumed accuracy must be between 0 and 1.')
    details=[]
    for r in rows:
        correct_weight=r.get('correct_weight',r['maximum_score']/r['total_questions'])
        gain=r['unanswered']*(probability*correct_weight-(1-probability)*r['incorrect_weight']-r.get('unanswered_weight',0))
        details.append({'id':r['id'],'expected_raw_score':r['raw_score']+gain,
                        'expected_percentage':(r['raw_score']+gain)/r['maximum_score']*100,
                        'gain_pp':gain/r['maximum_score']*100})
    return {'hypothetical':True,'assumed_accuracy':probability,'count':len(rows),'rows':details,
            'mean_gain_pp':mean(d['gain_pp'] for d in details) if details else None,
            'mean_expected_percentage':mean(d['expected_percentage'] for d in details) if details else None}
