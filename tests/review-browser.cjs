// Whole-project review checks. Must use the isolated fixture server.
async page=>{
 const base='http://127.0.0.1:8002';if(new URL(page.url()).origin!==base)throw Error('Fixture server required');
 const assert=(x,m)=>{if(!x)throw Error(m)},errors=[],matrix=[];page.on('pageerror',e=>errors.push(e.message));
 await page.emulateMedia({reducedMotion:'reduce'});
 const category=await(await page.request.post(base+'/api/study/categories',{data:{name_en:'W'.repeat(100),name_fa:'آ'.repeat(100),study_group:'theoretical',color:'#123456'}})).json();
 const week='2027-01-02',prior=await(await page.request.get(base+'/api/study/weeks/'+week)).json();
 const saved=await page.request.put(base+'/api/study/weeks/'+week,{data:{revision:prior.revision,entries:[{category_id:category.id,minutes:10000}]}});assert(saved.ok(),'long-label report fixture');
 const ready=()=>page.locator('#app[aria-busy=false] #main-content').waitFor();
 const nav=async view=>{if(await page.locator('#menu-btn').isVisible())await page.locator('#menu-btn').click();await page.locator(`[data-view=${view}]`).click();await ready()};
 for(const language of ['en','fa'])for(const theme of ['light','dark'])for(const width of [390,768,1440]){
  const label=`${language}-${theme}-${width}`;
  await page.request.patch(base+'/api/settings',{data:{application_mode:'advanced',language,theme}});
  await page.setViewportSize({width,height:1000});await page.goto(base);await ready();
  assert(await page.locator('#overview-content .kpi').count()===5,label+' overview');
  await nav('settings');
  assert(await page.locator('[data-mode=quick]').evaluate(e=>typeof e.onclick==='function'),label+' mode binding');
  assert(await page.locator('[data-language=fa]').evaluate(e=>typeof e.onclick==='function'),label+' language binding');
  assert(await page.locator('[data-mode=advanced]').getAttribute('aria-pressed')==='true',label+' selected state');
  assert(!(await page.locator('#toast').innerText()).includes(language==='fa'?'بارگذاری فضای کار انجام نشد':'Unable to load'),label+' swallowed settings error');
  await nav('history');await page.locator('.row-open').first().click();await page.locator('#details-modal:modal').waitFor();
  assert(await page.locator('#detail-close svg').count()===1,label+' consistent close icon');await page.keyboard.press('Escape');
  await nav('analytics');assert(await page.locator('.chart[role=img]').count()===4,label+' analytics charts');
  await nav('subjects');assert(await page.locator('#subject-chart canvas').count()===1,label+' subject chart');
  await nav('history');await page.locator('#search').fill('Practice 1');
  await page.waitForFunction(()=>S.filters.search==='Practice 1'&&S.analytics.count===S.exams.length&&document.querySelector('#app').getAttribute('aria-busy')==='false');
  await nav('reports');
  const href=await page.locator('a[href^="/api/export/json"]').getAttribute('href');
  const exported=await(await page.request.get(base+href.replaceAll('&amp;','&'))).json();
  assert(exported.exams.length===await page.evaluate(()=>S.exams.length),label+' scoped export');
  assert(exported.exams.every(r=>r.title.includes('Practice 1')),label+' extra exported records');
  await nav('study');await page.locator(`[data-study-week="${week}"]`).click();await page.locator('#study-report-dialog:modal').waitFor();
  assert(await page.locator('#study-report-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),label+' long report overflow');
  await page.keyboard.press('Escape');await page.locator('#study-manage').click();
  const longRow=page.locator(`.study-entry[data-category="${category.id}"][data-video="0"]`);
  await longRow.scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' long label overflow');
  if(width===390||width===1440)await page.screenshot({path:`outputs/review-2026-11-01/study-long-after-${label}.png`});
  await nav('settings');await page.locator('[data-mode=quick]').click();
  await page.locator('#quick-form').waitFor();await ready();
  assert(await page.evaluate(()=>S.settings.application_mode)==='quick',label+' real Quick switch');
  await nav('study');assert(await page.locator('#study-chart-view').count()===0,label+' Quick complexity');
  assert(await page.locator('#study-form').count()===1,label+' Quick study');
  await nav('settings');await page.locator('[data-mode=advanced]').click();await page.locator('#overview-content').waitFor();await ready();
  matrix.push(label);
 }
 // Test the Settings language control itself, beyond API-configured matrix states.
 await page.setViewportSize({width:1440,height:1000});await nav('settings');await page.locator('[data-language=en]').click();
 await page.waitForFunction(()=>document.documentElement.lang==='en'&&document.querySelector('#app').getAttribute('aria-busy')==='false');
 await page.locator('[data-language=fa]').click();
 await page.waitForFunction(()=>document.documentElement.lang==='fa'&&document.querySelector('#app').getAttribute('aria-busy')==='false');
 assert(errors.length===0,errors.join('\n'));
 const result={advancedPageConfigurations:matrix.length,quickStudyConfigurations:matrix.length,settingsControls:true,scopedExports:true,longNames:true,errors};
 await page.evaluate(r=>window.reviewQA=r,result);return result;
}
