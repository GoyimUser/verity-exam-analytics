// Repeatable P1 browser regression against the isolated tests.serve_ux fixture only.
async page=>{
  if(new URL(page.url()).port!=='8002')throw Error('Use tests.serve_ux on port 8002.');
  const assert=(ok,message)=>{if(!ok)throw Error(message)},base='http://127.0.0.1:8002';
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  const leftovers=await (await page.request.get(base+'/api/exams?search=P1%20extreme%20negative')).json();
  for(const r of leftovers)if(r.title==='P1 extreme negative')await page.request.delete(base+'/api/exams/'+r.id);
  const extreme=await (await page.request.post(base+'/api/exams',{data:{title:'P1 extreme negative',exam_date:'2026-09-01',correct_answers:0,incorrect_answers:15,incorrect_weight:100,subject:'Mathematics'}})).json();
  let combinations=0;
  for(const language of ['en','fa'])for(const theme of ['light','dark'])for(const width of [1440,900,390]){
    const label=`${language}-${theme}-${width}`;
    await page.request.patch(base+'/api/settings',{data:{application_mode:'advanced',language,theme}});
    await page.setViewportSize({width,height:1000});await page.goto(base);
    await page.locator('#app[aria-busy="false"] #main-content').waitFor();
    const nav=async view=>{if(width===390)await page.locator('#menu-btn').click();await page.locator(`[data-view="${view}"]`).click();await page.locator('#app[aria-busy="false"] #main-content').waitFor()};
    await nav('analytics');
    assert(await page.locator('#analysis-modules #scenario-form').count()===1,label+' modules');
    assert(await page.locator('.chart[role="img"]').count()===4,label+' charts');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' document overflow');
    assert(await page.evaluate(()=>document.documentElement.dir)===(language==='fa'?'rtl':'ltr'),label+' direction');
    // Inspect actual chart configuration, not a duplicate calculation.
    const heat=await page.locator('#heatmap-chart').evaluate(el=>{const opt=echarts.getInstanceByDom(el).getOption();return {min:opt.visualMap[0].min,dimension:opt.visualMap[0].dimension,values:opt.series[0].data}});
    assert(heat.min<-1000,label+' heatmap negative range');
    assert(heat.dimension===2,label+' heatmap colors must encode percentage, not sample count');
    assert(heat.values.some(v=>v[3]===2),label+' aggregated cell count');
    await page.locator('#heatmap-chart + .chart-data summary').click();
    await page.locator('#heatmap-chart + .chart-data tbody tr').first().waitFor();
    assert(await page.locator('#heatmap-chart + .chart-data tbody tr').count()>0,label+' heat data table');
    await page.locator('#scenario-form input').fill(language==='fa'?'۵۰':'50');
    await page.locator('#scenario-form button').click();
    await page.locator('#scenario-result .analysis-metric').first().waitFor();
    assert(await page.locator('#scenario-result .analysis-metric').count()===2,label+' simulation');
    const ranges=language==='fa'?['1405/06/10','1405/06/24','1405/06/25','1405/07/30']:['2026-09-01','2026-09-15','2026-09-16','2026-10-22'];
    for(const [i,key] of ['first_from','first_to','second_from','second_to'].entries())await page.locator(`#period-comparison [name="${key}"]`).fill(ranges[i]);
    await page.locator('#period-comparison button').click();await page.locator('#period-result .analysis-metric').first().waitFor();
    assert(await page.locator('#period-result .analysis-metric').count()===5,label+' comparison');
    await page.locator('#period-result .analysis-evidence summary').first().click();
    await page.locator('#period-result [data-evidence-id]').first().click();await page.locator('#details-modal:modal').waitFor();await page.keyboard.press('Escape');
    if(width!==900){
      await page.locator('#scenario-form').scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/p1-controls-${label}.png`});
      await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/p1-charts-${label}.png`});
    }
    combinations++;
  }
  // Preview errors, deliberate duplicate choice, and actual save in both locales.
  for(const language of ['en','fa']){
    await page.request.patch(base+'/api/settings',{data:{language}});await page.setViewportSize({width:1440,height:1000});await page.goto(base);
    await page.locator('#app[aria-busy="false"] #main-content').waitFor();await page.locator('[data-view="reports"]').click();await page.locator('#import-file').waitFor();
    const before=await (await page.request.get(base+'/api/exams')).json();
    const file=exams=>({name:'p1-import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({exams}))});
    await page.locator('#import-file').setInputFiles(file([before[0],{title:'Invalid',exam_date:'2026-10-20',correct_answers:-1,incorrect_answers:0}]));
    await page.locator('#import-results tbody tr').first().waitFor();
    assert(await page.locator('#import-commit').isDisabled(),language+' invalid import disabled');
    assert((await (await page.request.get(base+'/api/exams')).json()).length===before.length,'preview changed records');
    await page.screenshot({path:`output/playwright/p1-import-${language}.png`});await page.keyboard.press('Escape');
    await page.locator('#import-file').setInputFiles(file([before[0]]));await page.locator('#import-results tbody tr').waitFor();
    assert(await page.locator('#import-commit').isDisabled(),'duplicate not skipped');
    await page.locator('#allow-import-duplicates').check();
    await page.waitForFunction(()=>!document.querySelector('#import-commit').disabled);
    await page.locator('#import-commit').click();await page.locator('#import-dialog').waitFor({state:'detached'});await page.locator('#app[aria-busy="false"] #main-content').waitFor();
    const after=await (await page.request.get(base+'/api/exams')).json();assert(after.length===before.length+1,'deliberate duplicate not saved');
    const created=after.find(r=>!before.some(b=>b.id===r.id));await page.request.delete(base+'/api/exams/'+created.id);
  }
  await page.request.delete(base+'/api/exams/'+extreme.id);
  assert(errors.length===0,errors.join('\n'));
  return {combinations,imports:2,pageErrors:errors};
}
