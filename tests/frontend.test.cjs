const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function runtime(){
  const modal={innerHTML:'open'};
  const context=vm.createContext({window:{addEventListener(){}}, document:{querySelector:()=>modal},
    Intl, console, WeakSet, setTimeout, clearTimeout, FormData:class{constructor(form){return form.values}},
    confirm:()=>true, Jalali:{toLatin:String}});
  const source=fs.readFileSync('static/app.js','utf8').replace(/load\(\);\s*$/, '');
  vm.runInContext(fs.readFileSync('static/intelligence.js','utf8'),context);
  vm.runInContext(fs.readFileSync('static/locale.js','utf8'),context);
  vm.runInContext(fs.readFileSync('static/study.js','utf8'),context);
  vm.runInContext(fs.readFileSync('static/translations.js','utf8'),context);
  vm.runInContext(fs.readFileSync('static/workflows.js','utf8'),context);
  vm.runInContext(source,context);
  vm.runInContext("S.settings={language:'en',correct_weight:4,incorrect_weight:1};toast=()=>{};load=async()=>{}",context);
  return context;
}

test('Settings binds every mode and language button, not a single element',async()=>{
 const c=runtime();
 await vm.runInContext(`(async()=>{
  const modes=[{dataset:{mode:'quick'}},{dataset:{mode:'advanced'}}],languages=[{dataset:{language:'en'}},{dataset:{language:'fa'}}];
  document.querySelectorAll=s=>s==='[data-mode]'?modes:s==='[data-language]'?languages:[];
  document.querySelector=s=>s==='[data-mode]'?modes[0]:{addEventListener(){}};
  S.view='settings';S.settings.application_mode='advanced';globalThis.changes=[];saveSettings=x=>changes.push(x);
  wire();for(const button of [...modes,...languages]){if(typeof button.onclick!=='function')throw Error('Control not bound');button.onclick()}
 })()`,c);
 assert.equal(c.changes.length,4);
});

test('failed exam deletion is guarded, reported and retains the dialog',async()=>{
 const c=runtime();
 await vm.runInContext(`(async()=>{
  let reject;globalThis.deleteCalls=0;globalThis.failures=[];fetch=()=>{deleteCalls++;return new Promise((_,r)=>reject=r)};
  toast=message=>failures.push(message);closeDialog=()=>{throw Error('Failure closed the dialog')};
  const button={disabled:false,closest:()=>({isConnected:true})};
  const pending=deleteExam(4,button);await deleteExam(4,button);reject(Error('offline'));await pending;
  if(button.disabled)throw Error('Button remained disabled');
 })()`,c);
 assert.equal(c.deleteCalls,1);assert.equal(c.failures[0],'offline');
});

test('timeline tooltip works when only the moving-average series is visible',()=>{
 const c=runtime();
 vm.runInContext(`getComputedStyle=()=>({getPropertyValue:()=>''});chart=(id,options)=>{globalThis.options=options};
 trendChart('trend',{count:1,timeline:[{title:'Test',date:'2026-10-31',percentage:0,moving_average:0}]});
 globalThis.tooltip=options.tooltip.formatter([{dataIndex:0,data:0,value:0,seriesName:'Average'}]);`,c);
 assert.match(c.tooltip,/31 Oct 2026/);assert.match(c.tooltip,/Average: 0%/);
});

test('duplicate edit retries PATCH to the same record and handles failure',async()=>{
  const c=runtime();
  await vm.runInContext(`(async()=>{
    const calls=[];globalThis.calls=calls;S.selected={id:42,correct_weight:5,incorrect_weight:2};
    globalThis.fetch=async(path,opts)=>{calls.push([path,opts.method,JSON.parse(opts.body)]);throw Error(calls.length===1?'matching record':'network failure')};
    await saveFormRequest({preventDefault(){},currentTarget:{values:[['title','Exam'],['exam_date','2026-10-30'],['total_questions','15'],['correct_answers','3'],['incorrect_answers','4']]}});
  })()`,c);
  assert.equal(c.calls.length,2);
  assert.equal(c.calls[1][0],'/api/exams/42');
  assert.equal(c.calls[1][1],'PATCH');
  assert.equal(c.calls[1][2].allow_duplicate,true);
});

test('concurrent submit is ignored and buttons recover after failure',async()=>{
  const c=runtime();
  await vm.runInContext(`(async()=>{
    let release;let count=0;const button={disabled:false};const form={querySelectorAll:()=>[button]};const event={preventDefault(){},currentTarget:form};
    const first=guardedSubmit(event,async()=>{count++;await new Promise(r=>release=r);throw Error('offline')});
    if(!button.disabled)throw Error('not disabled');
    await guardedSubmit(event,async()=>{count++});release();await first;
    if(count!==1||button.disabled)throw Error('guard failed');
  })()`,c);
});

test('restore cancellation makes no upload request in either language',async()=>{
  for(const language of ['en','fa']){
    const c=runtime();
    c.language=language;
    await vm.runInContext(`(async()=>{S.settings.language=language;confirm=message=>{if(!message||message==='restoreConfirm')throw Error('missing translation');return false};globalThis.fetch=async()=>{throw Error('must not send')};await upload({},'/api/restore','done')})()`,c);
  }
});
