const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({Intl,Date,console,window:{},L:{en:{},fa:{}},S:{settings:{language:'en',persian_digits:'native'}}});
vm.runInContext(fs.readFileSync('static/jalali.js','utf8'),context);
vm.runInContext(`const Jalali=window.Jalali;function isFa(){return S.settings.language==='fa'};function t(k){return L[S.settings.language][k]||k};function n(v){return new Intl.NumberFormat(isFa()?'fa-IR':'en-GB',{useGrouping:false,numberingSystem:isFa()&&S.settings.persian_digits!=='latin'?'arabext':'latn'}).format(v)};function parseNum(v){return Number(Jalali.toLatin(v))}`,context);
vm.runInContext(fs.readFileSync('static/study.js','utf8'),context);
vm.runInContext(fs.readFileSync('static/translations.js','utf8')+'\nL=TRANSLATIONS;',context);
const run=code=>vm.runInContext(code,context);
test('Saturday boundaries, Friday, Gregorian/Jalali identity and invalid dates',()=>{
 assert.equal(run(`studyWeek('2026-10-23').join(',')`),'2026-10-17,2026-10-23');
 assert.equal(run(`studyWeek('2026-10-24')[0]`),'2026-10-24');
 assert.equal(run(`studyWeek(Jalali.parse('۱۴۰۵/۰۷/۲۵'))[0]`),'2026-10-17');
 assert.equal(run(`studyWeek('2027-01-01')[0]`),'2026-12-26');
 for(const date of ['2026-02-30','invalid','0001-01-01','9999-12-31'])assert.throws(()=>run(`studyWeek('${date}')`));
});
test('all study translation keys are paired and used labels exist',()=>{
 const en=Object.keys(context.L.en).sort(),fa=Object.keys(context.L.fa).sort();assert.deepEqual(en,fa);
 for(const [,key] of fs.readFileSync('static/study.js','utf8').matchAll(/t\('(study\w*)'\)/g))assert.ok(context.L.en[key]&&context.L.fa[key],key);
});
test('integer minute input and localized output never use decimal hours',()=>{
 assert.equal(run(`readStudyMinutes('3','30')`),210);
 assert.equal(run(`readStudyMinutes('۳','۴۵')`),225);
 for(const args of [`'1','60'`,`'-1','0'`,`'1.5','0'`,`'abc','0'`])assert.throws(()=>run(`readStudyMinutes(${args})`));
 run(`S.settings.language='fa'`);assert.equal(run(`studyDuration(210)`),'۳ ساعت ۳۰ دقیقه');
 run(`S.settings.persian_digits='latin'`);assert.equal(run(`studyDuration(210)`),'3 ساعت 30 دقیقه');
 run(`S.settings.language='en'`);assert.equal(run(`studyDuration(-45)`),'−0 Hours 45 Minutes');
 assert.equal(run(`studyDuration(null)`),'—');
});
test('missing weeks are null gaps, while a saved rest week is zero',()=>{
 run(`ST.analysis.weeks=[{week_start:'2026-10-03',entries:[],totals:{overall:60}},{week_start:'2026-10-17',entries:[],totals:{overall:0}}]`);
 assert.equal(run(`studyChartRows().length`),3);
 assert.equal(run(`studyChartRows()[1].totals`),null);
 assert.equal(run(`studyChartRows()[2].totals.overall`),0);
});
test('server calendar matches browser Intl across the full supported range',()=>{
 const rows=[],fmt=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
 for(let d=new Date('1821-03-21T12:00:00Z');d<=new Date('2222-03-20T12:00:00Z');d.setUTCDate(d.getUTCDate()+7)){
  const parts=fmt.formatToParts(d),get=t=>Number(parts.find(p=>p.type===t).value);
  rows.push([d.toISOString().slice(0,10),get('year'),get('month'),get('day')]);
 }
 const output=require('node:child_process').execFileSync('python',['-c',`import json,sys;from datetime import date;from app.calendar_localization import persian_parts; rows=json.load(sys.stdin); bad=[r for r in rows if persian_parts(date.fromisoformat(r[0]))!=tuple(r[1:])]; print(json.dumps(bad))`],{input:JSON.stringify(rows),encoding:'utf8'});
 assert.deepEqual(JSON.parse(output),[]);
});
test('late report responses cannot open dialogs after navigation',async()=>{
 let resolve;context.api=()=>new Promise(r=>resolve=r);
 context.prepareDialog=()=>assert.fail('stale response opened a dialog');
 run(`S.view='study';S.detailsVersion=0`);
 const request=run(`showStudyReport('2026-10-17')`);
 run(`S.view='history';S.detailsVersion++`);resolve({revision:1});await request;
 let reject;context.api=()=>new Promise((_,r)=>reject=r);
 context.toast=()=>assert.fail('stale response showed a toast');
 run(`S.view='study'`);const failed=run(`showStudyReport('2026-10-17')`);
 run(`S.view='settings';S.detailsVersion++`);reject(Error('late failure'));await failed;
});
