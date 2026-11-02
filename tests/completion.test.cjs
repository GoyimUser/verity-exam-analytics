const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const c=vm.createContext({Intl,Date,window:{},console});
for(const f of ['translations','workflows','study','ux'])vm.runInContext(fs.readFileSync('static/'+f+'.js','utf8'),c);
vm.runInContext(`const L=TRANSLATIONS,S={settings:{language:'en'},examDirty:true};function t(k){return L[S.settings.language][k]||k};function isFa(){return S.settings.language==='fa'};function n(v){return String(v)}`,c);
test('draft confirmation retains dirty state on cancellation and clears on consent',()=>{
 vm.runInContext('confirm=()=>false',c);assert.equal(vm.runInContext('allowExamDiscard()',c),false);assert.equal(vm.runInContext('S.examDirty',c),true);
 vm.runInContext('confirm=()=>true',c);assert.equal(vm.runInContext('allowExamDiscard()',c),true);assert.equal(vm.runInContext('S.examDirty',c),false);
});
test('duplicate category legend identities remain distinct in both locales',()=>{
 vm.runInContext(`ST.categories=[{id:1,name_en:'Video',name_fa:'ویدیو',study_group:'theoretical'},{id:2,name_en:'Video',name_fa:'ویدیو',study_group:'theoretical'}]`,c);
 for(const language of ['en','fa']){vm.runInContext(`S.settings.language='${language}'`,c);assert.notEqual(vm.runInContext('studyLegendName(ST.categories[0])',c),vm.runInContext('studyLegendName(ST.categories[1])',c))}
});
test('mixed-direction chart components are isolated individually',()=>{
 assert.equal(vm.runInContext("bidiText('4 Sept 2026')",c),'\u20684 Sept 2026\u2069');
 assert.equal(vm.runInContext("bidiText('فیزیک')",c),'\u2068فیزیک\u2069');
});
test('single translation resource has matching nonempty keys',()=>{
 const data=vm.runInContext('TRANSLATIONS',c);assert.deepEqual(Object.keys(data.en).sort(),Object.keys(data.fa).sort());
 for(const lang of ['en','fa'])for(const value of Object.values(data[lang]))assert.ok(value.length>0);
});
