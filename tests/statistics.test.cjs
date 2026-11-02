const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const c=vm.createContext({Intl,Date,window:{}});
vm.runInContext(fs.readFileSync('static/statistics.js','utf8'),c);
vm.runInContext(fs.readFileSync('static/jalali.js','utf8'),c);
const months=(rows,language,native=true)=>JSON.parse(vm.runInContext(`JSON.stringify(calendarMonths(${JSON.stringify(rows)},${JSON.stringify(language)},${native}))`,c));

test('Jalali Nowruz and leap Esfand grouping keeps exact source averages',()=>{
  const rows=[{date:'2024-03-19',percentage:100/3},{date:'2024-03-20',percentage:2/3},
    {date:'2025-03-19',percentage:1/3},{date:'2025-03-20',percentage:2/3},{date:'2025-03-21',percentage:-125}];
  const m=months(rows,'fa');
  assert.deepEqual(m.map(r=>[r.month,r.count]),[['1402-12',1],['1403-01',1],['1403-12',2],['1404-01',1]]);
  assert.equal(m[2].average,.5);
  assert.equal(m[0].average,100/3);
  assert.match(m[2].label,/اسفند/);assert.match(m[3].label,/فروردین/);
  assert.match(m[3].label,/۱۴۰۴/);
  assert.match(months(rows,'fa',false)[3].label,/1404/);
});
test('Gregorian month boundaries use Gregorian labels and exact averages',()=>{
  const m=months([{date:'2024-02-29',percentage:13.33333333333},{date:'2024-03-01',percentage:40},{date:'2024-03-31',percentage:80}],'en');
  assert.deepEqual(m.map(r=>[r.month,r.count,r.average]),[['2024-02',1,13.33333333333],['2024-03',2,60]]);
  assert.equal(m[0].label,'February 2024');
});
test('Jalali input round trips across Nowruz and leap day',()=>{
  for(const [iso,jalali] of [['2024-03-19','1402/12/29'],['2024-03-20','1403/01/01'],['2025-03-20','1403/12/30'],['2025-03-21','1404/01/01']]){
    assert.equal(vm.runInContext(`window.Jalali.format('${iso}','latin')`,c),jalali);
    assert.equal(vm.runInContext(`window.Jalali.parse('${jalali}')`,c),iso);
  }
  assert.equal(vm.runInContext("window.Jalali.parse('1402/12/30')",c),null);
});
test('heatmap scale includes severe negative scores and empty input is stable',()=>{
  assert.equal(vm.runInContext('heatmapBounds([[0,0,-2500],[1,0,50]]).min',c),-2500);
  assert.equal(vm.runInContext('heatmapBounds([]).max',c),100);
});
test('all added analytical translation keys exist in both languages',()=>{
  vm.runInContext(fs.readFileSync('static/translations.js','utf8')+'\nconst L=TRANSLATIONS;',c);
  vm.runInContext(fs.readFileSync('static/intelligence.js','utf8'),c);

  assert.equal(vm.runInContext('JSON.stringify(Object.keys(L.en).sort())',c),vm.runInContext('JSON.stringify(Object.keys(L.fa).sort())',c));
  assert.equal(vm.runInContext("Object.values(L.fa).every(s=>(typeof s==='string'||Array.isArray(s))&&s.length>0)",c),true);
});
