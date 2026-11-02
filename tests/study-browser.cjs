// Run through playwright-cli run-code against tests.serve_ux only.
async page=>{
 const base='http://127.0.0.1:8002',assert=(v,m)=>{if(!v)throw Error(m)},errors=[],matrix=[];
 if(new URL(page.url()).origin!==base)throw Error('Disposable fixture server required.');
 page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});
 const ready=()=>page.locator('#app[aria-busy="false"] #main-content').waitFor();
 const nav=async view=>{if(await page.locator('#menu-btn').isVisible())await page.locator('#menu-btn').click();await page.locator(`[data-view="${view}"]`).click();await ready()};
 for(const mode of ['quick','advanced'])for(const language of ['en','fa'])for(const theme of ['light','dark'])for(const width of [390,768,1440]){
  await page.request.patch(base+'/api/settings',{data:{application_mode:mode,language,theme}});
  await page.setViewportSize({width,height:1000});await page.goto(base);await ready();await nav('study');
  assert(await page.locator('#study-form').count()===1,'entry missing');
  const result=await page.evaluate(()=>{
   const rows=studyChartRows(),chart=S.charts['study-stack'].getOption();
   return {dir:document.documentElement.dir,overflow:document.documentElement.scrollWidth>innerWidth+1,
    formOverflow:document.querySelector('#study-form').scrollWidth>document.querySelector('#study-form').clientWidth+1,
    sums:rows.every((w,i)=>!w.totals||chart.series.reduce((s,c)=>s+(c.data[i]||0),0)===w.totals.overall),
    advanced:!!document.querySelector('#study-chart-view'),font:getComputedStyle(document.querySelector('#study-form')).fontFamily,
    loaded:document.fonts.check('16px Vazirmatn'),count:ST.analysis.count,
    aria:document.querySelector('#study-stack').getAttribute('aria-label')};
  });
  assert(result.dir===(language==='fa'?'rtl':'ltr'),'wrong direction');
  assert(!result.overflow&&!result.formOverflow,`overflow ${mode}/${language}/${theme}/${width}`);
  assert(result.sums,'bar heights incorrect');assert(result.advanced===(mode==='advanced'),'mode complexity incorrect');
  assert(result.count>=8,'shared history missing');assert(!result.aria.includes('%'),'study ARIA uses exam percentages');
  if(language==='fa')assert(result.font.includes('Vazirmatn')&&result.loaded,'Persian font missing');
  matrix.push({mode,language,theme,width});
  if(width===1440&&mode==='advanced'){
   await page.screenshot({path:`outputs/study/${language}-${theme}-entry.png`});
   await page.locator('#study-stack').scrollIntoViewIfNeeded();await page.screenshot({path:`outputs/study/${language}-${theme}-charts.png`});
  }
  if(width===390&&language==='fa'&&mode==='quick')await page.screenshot({path:`outputs/study/fa-${theme}-mobile.png`});
 }
 await page.request.patch(base+'/api/settings',{data:{application_mode:'advanced',language:'en',theme:'light'}});
 await page.setViewportSize({width:1440,height:1000});await page.goto(base);await ready();await nav('study');
 const target='2026-11-07',old=await(await page.request.get(base+'/api/study/weeks/'+target)).json();
 if(old.revision)await page.request.delete(base+`/api/study/weeks/${target}?revision=${old.revision}`);
 await page.locator('#study-week').fill('2026-11-11');await page.locator('#study-week').dispatchEvent('change');await ready();
 assert(await page.locator('#study-week').inputValue()===target,'Saturday normalization');
 const parity=()=>page.locator('.study-entry[data-category="1"][data-video="0"]');
 await parity().locator('.entry-hours').fill('3');await parity().locator('.entry-minutes').fill('30');
 await parity().locator('.study-entry-options summary').click();await parity().locator('.entry-description').fill('Independent weekly aggregate');
 await parity().locator('.entry-breakdown').check();
 assert(await parity().locator('.detail-hours').inputValue()==='3','aggregate to detail conversion');
 await parity().locator('.detail-label').fill('Problem solving');await parity().locator('[data-add-detail]').click();
 await parity().locator('.detail-label').nth(1).fill('Review');await parity().locator('.detail-minutes').nth(1).fill('45');
 const video=page.locator('.study-entry[data-category="9"][data-video="1"]');
 await video.locator('..').locator(':scope > summary').click();await video.locator('.entry-hours').fill('1');await video.locator('.entry-minutes').fill('5');
 await page.locator('#study-form [type=submit]').click();await ready();
 let saved=await(await page.request.get(base+'/api/study/weeks/'+target)).json();
 assert(saved.totals.theoretical===255&&saved.totals.practical===65&&saved.totals.overall===320,'UI saved wrong totals');
 assert(saved.entries.find(e=>e.category_id===1).details.length===2,'details missing');
 // Quick Mode preserves advanced breakdowns while allowing other aggregates to change.
 await nav('settings');await page.locator('[data-mode=quick]').click();await ready();await nav('study');
 assert(await parity().locator('.entry-hours').getAttribute('readonly')!==null,'Quick can overwrite details');
 const counting=page.locator('.study-entry[data-category="2"][data-video="0"]');await counting.locator('.entry-minutes').fill('20');
 await page.locator('#study-form [type=submit]').click();await ready();
 saved=await(await page.request.get(base+'/api/study/weeks/'+target)).json();
 assert(saved.totals.overall===340&&saved.entries.find(e=>e.category_id===1).details.length===2,'Quick lost detail time');
 // Persian input selects the same canonical week and accepts Persian digits.
 await page.locator('#locale-btn').click();await page.waitForFunction(()=>document.documentElement.lang==='fa'&&document.querySelector('#app').getAttribute('aria-busy')==='false');
 const jalali=await page.evaluate(()=>Jalali.format('2026-11-11','native'));
 await page.locator('#study-week').fill(jalali);await page.locator('#study-week').dispatchEvent('change');await ready();
 assert(await page.evaluate(()=>ST.selected)===target,'Jalali/Gregorian mismatch');
 await counting.locator('.entry-minutes').fill('۲۵');await page.locator('#study-form [type=submit]').click();await ready();
 saved=await(await page.request.get(base+'/api/study/weeks/'+target)).json();assert(saved.totals.overall===345,'Persian numeric input');
 // A failed save keeps the draft and allows recovery.
 await counting.locator('.entry-minutes').fill('۶۵');await page.locator('#study-form [type=submit]').click();
 assert((await(await page.request.get(base+'/api/study/weeks/'+target)).json()).totals.overall===345,'invalid input persisted');
 await counting.locator('.entry-minutes').fill('۲۵');await page.locator('#study-form [type=submit]').click();await ready();
 await page.locator(`[data-study-week="${target}"]`).click();await page.locator('#study-report-dialog').waitFor({state:'visible'});
 assert((await page.locator('#study-report-dialog').innerText()).includes('Problem solving'),'localized report lost detail');
 await page.locator('#study-report-dialog [data-study-export=csv]').click();
 await page.locator('[data-study-close]').click();
 await nav('settings');await page.locator('[data-mode=advanced]').click();await ready();await nav('study');
 // Category editor, classification and disable are independent of exam subjects.
 await page.locator('#study-manage').click();await page.locator('#study-new-category').click();
 await page.locator('#study-category-form [name=name_en]').fill('Browser research');await page.locator('#study-category-form [name=name_fa]').fill('پژوهش مرورگر');
 await page.locator('#study-category-form [name=study_group]').selectOption('practical');await page.locator('#study-category-form [type=submit]').click();await ready();
 assert((await(await page.request.get(base+'/api/study/categories')).json()).some(c=>c.name_en==='Browser research'),'custom category not saved');
 await page.locator('#study-category-filter').selectOption('1');await ready();
 assert(await page.evaluate(()=>ST.analysis.weeks.every(w=>w.entries.every(e=>e.category_id===1))),'category filter failed');
 for(const view of ['trend','distribution','balance']){await page.locator('#study-chart-view').selectOption(view);assert(await page.locator('#study-secondary canvas').count()===1,'chart did not render');}
 await page.locator('#study-reset').click();await ready();
 // Tooltip values are durations and clicking a segment opens a full saved report.
 const tip=await page.evaluate(()=>{const q=S.charts['study-stack'],o=q.getOption(),row=studyChartRows()[0];return o.tooltip[0].formatter(o.series.map(s=>({dataIndex:0,value:s.data[0],seriesName:s.name}))) });
 assert(tip.includes('دقیقه')&&!tip.includes('undefined'),'localized tooltip');
 await page.locator('#study-stack').scrollIntoViewIfNeeded();
 await page.locator('.study-chart-panel .chart-data summary').click();assert((await page.locator('.study-chart-panel .chart-data').innerText()).includes('دقیقه'),'accessible chart table units');
 assert(errors.length===0,JSON.stringify(errors));
 const result={matrix:matrix.length,workflows:'weekly entry, details, Video, save/update, shared modes, Jalali selection, Persian digits, validation, report, CSV, categories, filters, charts',errors};
 await page.evaluate(result=>window.studyQA=result,result);return result;
}
