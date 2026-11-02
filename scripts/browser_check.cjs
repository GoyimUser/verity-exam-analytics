// Isolated, repeatable browser and accessibility acceptance checks for CI/local use.
const { chromium,firefox,webkit }=require('playwright');
const AxeBuilder=require('@axe-core/playwright').default;
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{spawn}=require('child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output/playwright/completion');fs.mkdirSync(output,{recursive:true});
const port=process.env.VERITY_TEST_PORT||'8013',base=`http://127.0.0.1:${port}`;
const python=process.env.VERITY_TEST_PYTHON||'python';
const server=spawn(python,['-m','tests.serve_ux'],{cwd:root,env:{...process.env,VERITY_TEST_PORT:port},windowsHide:true});
const log=fs.createWriteStream(path.join(output,'server.log'));server.stdout.pipe(log);server.stderr.pipe(log);
const result={configurations:[],workflows:[],accessibility:[],errors:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){for(let i=0;i<100;i++){try{if((await fetch(base+'/api/settings')).ok)return}catch{}await sleep(100)}throw Error('Fixture server failed')}
const ready=page=>page.locator('#app[aria-busy=false] #main-content').waitFor();
async function nav(page,view){if(await page.locator('#menu-btn').isVisible())await page.locator('#menu-btn').click();await page.locator(`[data-view=${view}]`).click();await ready(page)}
async function audit(page,label){
 const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 result.accessibility.push({label,violations:audit.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
 assert.equal(audit.violations.length,0,label+': '+audit.violations.map(v=>v.id+':'+v.nodes.map(n=>n.target).join(',')).join(';'));
}
async function workflows(page){
 await page.request.patch(base+'/api/settings',{data:{application_mode:'advanced',language:'en',theme:'light'}});await page.goto(base);await ready(page);
 await nav(page,'history');await page.locator('.row-open').first().click();await page.locator('#details-modal:modal').waitFor();
 assert.equal(await page.locator('.record-metadata dt').count(),14);
 const id=await page.evaluate(()=>S.selected.id);await page.locator('#detail-edit').click();await page.locator('#exam-form [name=title]').fill('Unsaved retained');
 page.once('dialog',d=>d.dismiss());await page.locator('#modal-close').click();assert.equal(await page.locator('#exam-form [name=title]').inputValue(),'Unsaved retained');
 await page.request.patch(base+'/api/exams/'+id,{data:{notes:'Changed elsewhere'}});
 await page.locator('#exam-form .primary-btn').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('changed elsewhere'));
 assert.equal(await page.locator('#exam-form [name=title]').inputValue(),'Unsaved retained');
 page.once('dialog',d=>d.accept());await page.locator('#modal-close').click();
 result.workflows.push('draft cancel and stale-edit preservation');
 await page.locator('#exam-table tbody input').nth(0).check();await page.locator('#exam-table tbody input').nth(1).check();await page.locator('#compare-exams').click();await page.locator('#compare-dialog:modal').waitFor();
 assert.equal(await page.locator('#compare-dialog thead th').count(),3);await audit(page,'comparison dialog');await page.keyboard.press('Escape');
 result.workflows.push('selected examination comparison and complete metadata');
 await nav(page,'settings');await page.locator('#manage-metadata').click();await page.locator('#metadata-dialog:modal').waitFor();
 const row=page.locator('.metadata-row[data-kind=subjects]').first();await row.locator('input').fill('Renamed in browser');await row.locator('button').first().click();
 await page.waitForFunction(()=>document.querySelector('.metadata-row input')?.value==='Renamed in browser'&&!document.querySelector('.metadata-row button')?.disabled);await page.keyboard.press('Escape');result.workflows.push('subject management');
 await nav(page,'reports');
 for(const [button,ext] of [['#print-report','pdf'],['#excel-report','xlsx']]){
  const download=page.waitForEvent('download');await page.locator(button).click();const file=await download;assert.equal(await file.failure(),null);await file.saveAs(path.join(output,'exams-en.'+ext));
 }
 result.workflows.push('examination PDF and Excel downloads');
 await nav(page,'settings');await page.locator('[data-mode=quick]').click();await page.locator('#quick-form').waitFor();
 await page.locator('#quick-form [name=title]').fill('Protected Quick draft');page.once('dialog',d=>d.dismiss());
 if(await page.locator('#menu-btn').isVisible())await page.locator('#menu-btn').click();await page.locator('#theme-btn').click();
 assert.equal(await page.locator('#quick-form [name=title]').inputValue(),'Protected Quick draft');
 page.once('dialog',d=>d.accept());await page.reload();await ready(page);result.workflows.push('Quick dirty navigation and reload guard');
 await page.request.patch(base+'/api/settings',{data:{application_mode:'advanced',language:'en',unanswered_weight:-2}});await page.goto(base);await ready(page);
 await page.locator('#add-btn').click();await page.locator('#exam-form [name=title]').fill('Timing and weight');await page.locator('#exam-form [name=correct_answers]').fill('3');await page.locator('#exam-form [name=incorrect_answers]').fill('4');
 await page.locator('#exam-form [name=start_time]').fill('23:45');await page.locator('#exam-form [name=end_time]').fill('00:30');await page.locator('#exam-form .primary-btn').click();await page.locator('#exam-modal').waitFor({state:'detached'});
 const saved=await(await page.request.get(base+'/api/exams?search=Timing')).json();assert.equal(saved[0].duration_minutes,45);assert.equal(saved[0].unanswered_weight,-2);assert.equal(saved[0].raw_score,-8);result.workflows.push('timing derivation and saved unanswered weight');
 await page.request.patch(base+'/api/settings',{data:{unanswered_weight:0}});
 const categories=[];for(let i=0;i<2;i++)categories.push(await(await page.request.post(base+'/api/study/categories',{data:{name_en:'Twin',name_fa:'هم‌نام',study_group:'theoretical',color:i?'#9250aa':'#286880'}})).json());
 const week='2026-10-31',old=await(await page.request.get(base+'/api/study/weeks/'+week)).json();await page.request.put(base+'/api/study/weeks/'+week,{data:{revision:old.revision,entries:categories.map((c,i)=>({category_id:c.id,minutes:60*(i+1)}))}});
 for(const language of ['en','fa']){
  await page.request.patch(base+'/api/settings',{data:{language}});await page.goto(base);await ready(page);await nav(page,'study');
  const independent=await page.evaluate(ids=>{const c=S.charts['study-stack'],series=c.getOption().series.filter(s=>ids.includes(Number(s.id)));c.dispatchAction({type:'legendUnSelect',name:series[0].name});const selected=c.getOption().legend[0].selected;return series[0].name!==series[1].name&&selected[series[0].name]===false&&selected[series[1].name]!==false},categories.map(c=>c.id));assert.ok(independent);
 }
 result.workflows.push('independent duplicate category legends in English/Persian');
}
(async()=>{
 const browsers=[];
 try{
  await start();
  for(const [name,type] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
   let browser;
   try {browser=await type.launch(name==='chromium'&&!fs.existsSync(type.executablePath())?{channel:'msedge',headless:true}:{headless:true})}
   catch(error){
    // Some Windows profiles cannot resolve Firefox private SxS assemblies in
    // AppData. An unchanged workspace copy avoids changing machine settings.
    if(name!=='firefox'||process.platform!=='win32'||!String(error).includes('spawn UNKNOWN'))throw error;
    const source=path.dirname(type.executablePath()),target=path.join(root,'output/browser-cache',path.basename(path.dirname(source)));
    fs.cpSync(source,target,{recursive:true,force:true});
    browser=await type.launch({headless:true,executablePath:path.join(target,'firefox.exe')});
    result.firefoxWorkspaceCopy=true;
   }
   browsers.push(browser);
   const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>result.errors.push(name+': '+e.message));await page.emulateMedia({reducedMotion:'reduce'});
   if(name==='chromium')await workflows(page);
   for(const language of ['en','fa'])for(const theme of ['light','dark'])for(const mode of ['quick','advanced'])for(const width of [390,1440]){
    const label=`${name}-${language}-${theme}-${mode}-${width}`;
    await page.request.patch(base+'/api/settings',{data:{language,theme,application_mode:mode}});await page.setViewportSize({width,height:1000});await page.goto(base);await ready(page);
    assert.equal(await page.locator('html').getAttribute('dir'),language==='fa'?'rtl':'ltr');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' overflow');
    await audit(page,label+' dashboard');
    await nav(page,'settings');assert.equal(await page.locator(`[data-mode=${mode}]`).getAttribute('aria-pressed'),'true');await audit(page,label+' settings');
    await nav(page,'study');assert.equal(await page.locator('#study-stack canvas').count(),1);await audit(page,label+' study');
    if(name==='chromium')await page.screenshot({path:path.join(output,label+'.png'),fullPage:false});
    const tree=await page.locator('#main-content').ariaSnapshot();assert.ok(tree.includes('heading'));assert.ok(tree.includes('button'));assert.ok(tree.includes('textbox')||tree.includes('spinbutton'));
    if(name==='chromium'&&width===390)fs.writeFileSync(path.join(output,label+'-accessibility.txt'),tree);
    result.configurations.push(label);
   }
   await browser.close();
  }
  assert.deepEqual(result.errors,[]);result.ok=true;
 }catch(e){result.ok=false;result.failure=String(e.stack);process.exitCode=1}
 finally{for(const b of browsers)await b.close().catch(()=>{});server.kill();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:result.ok,configurations:result.configurations.length,workflows:result.workflows,failure:result.failure}));}
})();
