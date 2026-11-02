const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const c=vm.createContext({window:{},Intl,Date,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync('static/jalali.js','utf8'),c);vm.runInContext('const Jalali=window.Jalali;',c);
vm.runInContext(fs.readFileSync('static/locale.js','utf8'),c);
test('localized numbers support Persian/Arabic digits and strict grouping',()=>{
  for(const [input,want] of [['۱٬۲۳۴٫۵',1234.5],['١٢٫٥',12.5],['1,234.50',1234.5],['−۲',-2],['۰',0]])assert.equal(vm.runInContext(`localizedNumber(${JSON.stringify(input)})`,c),want);
  for(const input of ['', '۱,۲','1e5','Infinity','1.2.3'])assert.ok(Number.isNaN(vm.runInContext(`localizedNumber(${JSON.stringify(input)})`,c)));
});
test('Jalali range is explicit and valid dates round trip across all supported years',()=>{
  for(let year=1200;year<=1600;year++)for(const month of [1,6,7,12]){
    const iso=vm.runInContext(`Jalali.parse('${year}/${month}/29')`,c);assert.ok(iso);
    assert.equal(vm.runInContext(`Jalali.format('${iso}','latin')`,c),`${year}/${String(month).padStart(2,'0')}/29`);
  }
  for(const value of ['1199/12/29','1601/1/1','1403/7/31','1403/13/1','1403/0/1'])assert.equal(vm.runInContext(`Jalali.parse('${value}')`,c),null);
});
test('today uses the browser local day across midnight and timezone boundaries',()=>{
  const code=`const vm=require('node:vm'),fs=require('node:fs');vm.runInThisContext(fs.readFileSync('static/locale.js','utf8'));process.stdout.write(localToday(new Date('2026-10-30T21:00:00Z')));`;
  for(const [tz,want] of [['Asia/Tehran','2026-10-31'],['America/Los_Angeles','2026-10-30'],['UTC','2026-10-30']])assert.equal(execFileSync(process.execPath,['-e',code],{env:{...process.env,TZ:tz},encoding:'utf8'}),want);
});
test('central locale resources cover both languages and errors avoid object coercion',()=>{
  vm.runInContext(fs.readFileSync('static/translations.js','utf8'),c);
  vm.runInContext('const L=TRANSLATIONS;function isFa(){return true}function t(k){return L.fa[k]}',c);
  assert.equal(vm.runInContext('JSON.stringify(Object.keys(L.en))',c),vm.runInContext('JSON.stringify(Object.keys(L.fa))',c));
  for(const message of ['Correct answers must be a non-negative integer.','Failed to fetch','Backup integrity check failed.','Request body is too large.'])assert.match(vm.runInContext(`errorText(${JSON.stringify(message)})`,c),/[\u0600-\u06ff]/);
});
