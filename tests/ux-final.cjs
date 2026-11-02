async page=>{
  if(new URL(page.url()).port!=='8002')throw Error('Use the isolated fixture server.');
  await page.request.patch('http://127.0.0.1:8002/api/settings',{data:{language:'fa',theme:'dark',application_mode:'advanced'}});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:8002/?ux-final');
  await page.locator('#app[aria-busy="false"] #menu-btn').waitFor();
  await page.keyboard.press('Tab');
  if(!await page.locator('.skip-link').evaluate(el=>el===document.activeElement))throw Error('Skip link is not keyboard reachable');
  await page.keyboard.press('Enter');
  if(!await page.locator('#main-content').evaluate(el=>el===document.activeElement))throw Error('Skip destination');
  await page.locator('#menu-btn').click();await page.locator('[data-view="analytics"]').click();
  await page.locator('#app[aria-busy="false"] #heatmap-chart').waitFor();
  const status=await page.evaluate(()=>({height:document.querySelector('#heatmap-chart').clientHeight,skip:getComputedStyle(document.querySelector('.skip-link')).clipPath,grid:S.charts['heatmap-chart'].getOption().grid[0].bottom}));
  if(status.height!==370||status.skip==='none'||status.grid!==100)throw Error(JSON.stringify(status));
  await page.screenshot({path:'output/playwright/ux-final-rtl-analytics.png',fullPage:true});
  await page.locator('#add-btn').click();
  await page.screenshot({path:'output/playwright/ux-final-rtl-dialog.png',fullPage:true});
  await page.keyboard.press('Escape');
  await page.route('**/api/exams?*',route=>route.abort());await page.reload();await page.locator('#retry-load').waitFor();
  if(await page.locator('html').getAttribute('dir')!=='rtl')throw Error('Failure direction');
  await page.screenshot({path:'output/playwright/ux-final-rtl-retry.png'});
  await page.unroute('**/api/exams?*');await page.locator('#retry-load').click();await page.locator('#app[aria-busy="false"] .chart').first().waitFor();
  return {passed:true,...status};
}
