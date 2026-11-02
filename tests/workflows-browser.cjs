// Regression suite against disposable tests.serve_ux fixtures only.
async page=>{
  if(new URL(page.url()).port!=='8002')throw Error('Use the isolated fixture server.');
  const base='http://127.0.0.1:8002',assert=(v,m)=>{if(!v)throw Error(m)},errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==base){external.push(route.request().url());return route.abort()}return route.continue()});
  const ready=()=>page.locator('#app[aria-busy="false"] #main-content').waitFor();
  const old=await (await page.request.get(base+'/api/exams?search=Workflow%20duplicate')).json();
  for(const row of old)if(row.title.startsWith('Workflow duplicate '))await page.request.delete(base+'/api/exams/'+row.id);
  const nav=async view=>{if(await page.locator('#menu-btn').isVisible())await page.locator('#menu-btn').click();await page.locator(`[data-view="${view}"]`).click();await ready()};
  for(const language of ['en','fa']){
    await page.request.patch(base+'/api/settings',{data:{language,application_mode:'advanced',correct_weight:4,incorrect_weight:1}});
    await page.setViewportSize({width:1440,height:1000});await page.goto(base);await ready();
    await nav('history');await page.locator('#search').fill('Practice 1');
    await page.waitForFunction(()=>S.analytics.count===S.exams.length&&S.filters.search==='Practice 1'&&document.querySelector('#app').getAttribute('aria-busy')==='false');
    await page.waitForTimeout(350);
    assert(await page.locator('#search').evaluate(el=>el===document.activeElement&&el.selectionStart===10),'search focus/caret');
    assert(await page.locator('.scope-bar').isVisible(),'active scope');
    await page.locator('#sort').selectOption('percentage');await ready();assert(await page.locator('#sort').inputValue()==='percentage','sort state');
    // Complete an older request after a newer search; only newer scope may render.
    let release,seen;const entered=new Promise(r=>seen=r),gate=new Promise(r=>release=r);
    await page.route('**/api/analytics?*',async route=>{if(new URL(route.request().url()).searchParams.get('search')==='Practice 2'){seen();await gate}await route.continue()});
    await page.locator('#search').fill('Practice 2');await entered;
    await page.locator('#search').fill('Practice 3');await page.waitForFunction(()=>S.filters.search==='Practice 3'&&S.exams.every(r=>r.title.includes('Practice 3')));release();await page.waitForTimeout(250);
    assert(await page.locator('#search').inputValue()==='Practice 3','stale result won');await page.unroute('**/api/analytics?*');
    await page.locator('[data-reset-scope]').click();await ready();await nav('overview');
    await page.locator('#filter-btn').click();
    const from=language==='fa'?'۱۴۰۵/۰۶/۱۰':'2026-09-01';await page.locator('#from-date').fill(from);await page.locator('#from-date').dispatchEvent('change');await ready();
    assert(await page.locator('#filters').isVisible(),'filters collapsed');
    assert(await page.locator('#from-date').inputValue()===from,'date value reset');
    for(const view of ['analytics','overview','subjects','history','analytics']){
      await page.evaluate(()=>window.previousCharts=Object.values(S.charts));await nav(view);
      assert(await page.evaluate(()=>window.previousCharts.every(c=>c.isDisposed())),'chart leak');
      assert(await page.evaluate(()=>Object.keys(S.charts).length<=4),'too many retained charts');
    }
    if(language==='fa'){
      await page.locator('#add-btn').click();await page.locator('#exam-modal .calendar-launch').click();
      await page.locator('.calendar-dialog [data-year]').fill('۱۴۰۳');await page.locator('.calendar-dialog [data-year]').dispatchEvent('change');
      await page.locator('.calendar-dialog [data-date]').first().click();
      assert(await page.locator('#exam-form [name=exam_date]').inputValue().then(v=>v.startsWith('۱۴۰۳')),'calendar selection');
      await page.locator('#exam-modal .calendar-launch').click();await page.keyboard.press('Escape');
      assert(await page.locator('#exam-modal:modal').count()===1,'nested calendar closed parent');
      await page.screenshot({path:'output/playwright/workflows-fa-dialog.png'});await page.keyboard.press('Escape');
    }
    await page.evaluate(()=>document.fonts.load('700 14px '+(document.documentElement.lang==='fa'?'Vazirmatn':'Manrope')));
    assert(await page.evaluate(()=>document.fonts.check('700 14px '+(document.documentElement.lang==='fa'?'Vazirmatn':'Manrope'))),'local font');
    // Quick duplicate cancel / retry / failed retry retain the current input.
    await page.request.patch(base+'/api/settings',{data:{application_mode:'quick',correct_weight:5,incorrect_weight:0}});
    await page.goto(base);await ready();
    const title='Workflow duplicate '+language;
    const fill=async()=>{await page.locator('#quick-form [name=title]').fill(title);await page.locator('#quick-form [name=correct_answers]').fill(language==='fa'?'۳':'3');await page.locator('#quick-form [name=incorrect_answers]').fill(language==='fa'?'۴':'4');await page.locator('#quick-score strong').waitFor()};
    await fill();assert(await page.locator('#quick-score').innerText().then(s=>s.includes(language==='fa'?'۲۰':'20')),'zero penalty preview');
    await page.locator('#quick-form > button').click();await ready();await page.waitForFunction(()=>document.querySelector('#quick-form [name=title]').value==='');
    await fill();page.once('dialog',d=>d.dismiss());await page.locator('#quick-form > button').click();await page.waitForTimeout(200);assert(await page.locator('#quick-form [name=title]').inputValue()===title,'cancel lost draft');
    page.once('dialog',d=>d.accept());await page.locator('#quick-form > button').click();await page.waitForFunction(()=>document.querySelector('#quick-form [name=title]').value==='');
    await fill();await page.route('**/api/exams',route=>{if(route.request().method()==='POST'&&route.request().postDataJSON().allow_duplicate)return route.abort();return route.continue()});
    page.once('dialog',d=>d.accept());await page.locator('#quick-form > button').click();await page.locator('#toast.error').waitFor();
    assert(await page.locator('#quick-form [name=title]').inputValue()===title,'failed retry lost draft');assert(await page.locator('#quick-form > button').isEnabled(),'failed retry left disabled');await page.unroute('**/api/exams');
    const rows=await (await page.request.get(base+'/api/exams?search='+encodeURIComponent(title))).json();assert(rows.length===2,'duplicate policy');for(const row of rows)await page.request.delete(base+'/api/exams/'+row.id);
    for(const theme of ['light','dark'])for(const width of [390,900]){
      await page.request.patch(base+'/api/settings',{data:{theme}});await page.setViewportSize({width,height:1000});await page.goto(base);await ready();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'responsive overflow');
      if(language==='fa'){await page.locator('#quick-form .calendar-launch').click();await page.screenshot({path:`output/playwright/calendar-${theme}-${width}.png`});await page.keyboard.press('Escape')}
    }
  }
  assert(errors.length===0,errors.join('\n'));assert(external.length===0,'External asset dependency: '+external.join(','));
  const result={languages:2,duplicatePaths:6,calendarAndFonts:'passed',racesAndChartDisposal:'passed',externalRequests:external,pageErrors:errors};
  await page.evaluate(result=>window.workflowResult=result,result);return result;
}
