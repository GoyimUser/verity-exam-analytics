// Run with playwright-cli run-code --filename tests/ux-browser.cjs after opening
// the isolated server from python -m tests.serve_ux. No personal DB is accessed.
async (page) => {
  if(new URL(page.url()).port!=='8002')throw Error('Use the isolated UI fixture server on port 8002.');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const assert=(value,message)=>{if(!value)throw Error(message)};
  const results=[];
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const mode of ['advanced','quick'])for(const language of ['en','fa'])for(const theme of ['dark','light'])for(const width of [1440,900,390]){
    const label=`${mode}-${language}-${theme}-${width}`;
    await page.request.patch('http://127.0.0.1:8002/api/settings',{data:{application_mode:mode,language,theme}});
    await page.setViewportSize({width,height:1000});
    await page.goto('http://127.0.0.1:8002/');
    await page.locator('#app[aria-busy="false"] .chart[role="img"]').first().waitFor();
    assert(await page.locator('html').getAttribute('dir')===(language==='fa'?'rtl':'ltr'),label+' direction');
    assert(await page.locator('html').getAttribute('data-theme')===theme,label+' theme');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' page overflow');
    assert(await page.locator('svg.ui-icon').count()>5,label+' icons');
    if(mode==='advanced'){
      assert(await page.locator('#filter-btn').isVisible(),label+' filter hidden');
      await page.locator('#filter-btn').click();
      assert(await page.locator('#filter-btn').getAttribute('aria-expanded')==='true',label+' filter expanded');
      assert(await page.locator('#subject-filter').isVisible(),label+' filter fields');
    }
    const chart=page.locator('.chart-data').first();await chart.locator('summary').click();
    await chart.locator('tbody tr').first().waitFor();
    assert(await chart.locator('tbody tr').count()>=18,label+' chart table');
    await chart.locator('summary').click();
    await page.locator('#add-btn').click();
    assert(await page.locator('dialog').evaluate(el=>el.matches(':modal')),label+' native modal');
    assert(await page.locator('dialog').getAttribute('aria-labelledby'),label+' dialog name');
    for(let index=0;index<20;index++){
      await page.keyboard.press('Tab');
      assert(await page.evaluate(()=>!!document.activeElement.closest('dialog')),label+' focus escaped');
    }
    await page.keyboard.press('Escape');
    assert(await page.locator('dialog').count()===0,label+' Escape close');
    assert(await page.locator('#add-btn').evaluate(el=>el===document.activeElement),label+' opener focus');
    if(width===390){
      assert(await page.locator('#sidebar').evaluate(el=>el.inert),label+' hidden nav focus');
      await page.locator('#menu-btn').click();
      assert(await page.locator('#menu-btn').getAttribute('aria-expanded')==='true',label+' menu expanded');
      await page.keyboard.press('Escape');
      assert(await page.locator('#menu-btn').evaluate(el=>el===document.activeElement),label+' menu focus');
    }
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:`output/playwright/ux-${label}.png`,fullPage:true});
    results.push(label);
  }
  assert(errors.length===0,errors.join('\n'));
  console.log(JSON.stringify({passed:results.length,combinations:results,pageErrors:errors}));
}
