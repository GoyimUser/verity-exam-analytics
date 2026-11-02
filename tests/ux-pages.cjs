// Additional browser checks; run only against tests.serve_ux on port 8002.
async (page)=>{
  if(new URL(page.url()).port!=='8002')throw Error('Use the isolated fixture server.');
  const assert=(ok,message)=>{if(!ok)throw Error(message)};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  let checked=0;
  for(const language of ['en','fa'])for(const theme of ['light','dark'])for(const width of [1440,900,390]){
    const label=`${language}-${theme}-${width}`;
    await page.request.patch('http://127.0.0.1:8002/api/settings',{data:{application_mode:'advanced',language,theme}});
    await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:8002/');
    await page.locator('#app[aria-busy="false"] #main-content').waitFor();
    const navigate=async view=>{
      if(width===390)await page.locator('#menu-btn').click();
      await page.locator(`[data-view="${view}"]`).click();
      await page.locator('#app[aria-busy="false"] #main-content').waitFor();
    };
    await navigate('history');
    const row=page.locator('.row-open').first();await row.focus();await page.keyboard.press('Enter');
    await page.locator('dialog:modal').waitFor();
    await page.locator('#detail-edit').click();await page.locator('#exam-modal:modal').waitFor();
    await page.keyboard.press('Shift+Tab');await page.keyboard.press('Shift+Tab');
    assert(await page.evaluate(()=>!!document.activeElement.closest('dialog')),label+' reverse tab containment');
    await page.keyboard.press('Escape');
    assert(await row.evaluate(el=>el===document.activeElement),label+' history focus restoration');
    await navigate('analytics');
    assert(await page.locator('.chart[role="img"]').count()===4,label+' analytics descriptions');
    const heat=page.locator('#heatmap-chart + .chart-data');await heat.locator('summary').click();await heat.locator('tbody tr').first().waitFor();
    await page.screenshot({path:`output/playwright/ux-analytics-${label}.png`,fullPage:true});
    await navigate('subjects');assert(await page.locator('#subject-chart[role="img"]').count()===1,label+' subject description');
    await navigate('reports');
    assert(await page.locator('#import-file').isVisible(),label+' focusable upload');
    await page.locator('#import-file').focus();assert(await page.locator('#import-file').evaluate(el=>el===document.activeElement),label+' upload focus');
    await navigate('settings');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' settings overflow');
    await page.screenshot({path:`output/playwright/ux-settings-${label}.png`,fullPage:true});
    if(language==='fa'){
      await page.evaluate(()=>document.fonts.load('14px Vazirmatn'));
      assert(await page.evaluate(()=>document.fonts.check('14px Vazirmatn')),label+' Persian font');
    }
    checked++;
  }
  // Deterministic request failure: recover without a blank screen.
  await page.route('**/api/exams?*',route=>route.abort());
  await page.goto('http://127.0.0.1:8002/');await page.locator('#retry-load').waitFor();
  assert(await page.locator('#app').getAttribute('aria-busy')==='false','busy state after failure');
  assert(await page.locator('#toast').getAttribute('role')==='status','live region');
  await page.unroute('**/api/exams?*');await page.locator('#retry-load').click();await page.locator('#app[aria-busy="false"] .chart').first().waitFor();
  assert(errors.length===0,errors.join('\n'));
  console.log(JSON.stringify({pageCombinations:checked,retry:'passed',pageErrors:errors}));
}
