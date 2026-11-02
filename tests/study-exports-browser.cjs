// Real chart hit testing, all export buttons, conflicts and confirmed deletion.
async page=>{
 const base='http://127.0.0.1:8002';if(new URL(page.url()).origin!==base)throw Error('Fixture server required');
 const assert=(x,m)=>{if(!x)throw Error(m)},errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.request.patch(base+'/api/settings',{data:{language:'en',application_mode:'advanced',theme:'light'}});
 await page.setViewportSize({width:1440,height:1000});await page.goto(base);
 const ready=()=>page.locator('#app[aria-busy=false] #main-content').waitFor();await ready();
 await page.locator('[data-view=study]').click();await page.locator('#study-stack canvas').waitFor();
 await page.locator('#study-stack').scrollIntoViewIfNeeded();await page.waitForTimeout(400);
 const point=await page.evaluate(()=>{const chart=S.charts['study-stack'],o=chart.getOption(),p=chart.convertToPixel({xAxisIndex:0,yAxisIndex:0},[0,o.series[0].data[0]/2]),r=document.querySelector('#study-stack').getBoundingClientRect();return{x:r.x+p[0],y:r.y+p[1]}});
 await page.mouse.click(point.x,point.y);await page.locator('#study-report-dialog:modal').waitFor();
 for(const format of ['csv','xlsx','pdf']){
  const download=page.waitForEvent('download');await page.locator(`#study-report-dialog [data-study-export=${format}]`).click();
  const file=await download;assert(file.suggestedFilename().endsWith('.'+format),'export extension');assert(!(await file.failure()),'download failure');
 }
 // Clipboard success or the accessible selectable-text fallback must be observable.
 await page.locator('#study-report-dialog [data-study-export=text]').click();
 await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('copied')||document.querySelector('#study-copy-dialog:modal'));
 if(await page.locator('#study-copy-dialog').count())await page.locator('#study-copy-close').click();else await page.locator('[data-study-close]').click();
 const when='2026-12-05',old=await(await page.request.get(base+'/api/study/weeks/'+when)).json();
 if(old.revision)await page.request.delete(base+`/api/study/weeks/${when}?revision=${old.revision}`);
 const created=await(await page.request.put(base+'/api/study/weeks/'+when,{data:{revision:0,entries:[{category_id:1,minutes:30}]}})).json();
 await page.locator('#study-week').fill(when);await page.locator('#study-week').dispatchEvent('change');await ready();
 await page.request.put(base+'/api/study/weeks/'+when,{data:{revision:created.revision,entries:[{category_id:1,minutes:45}]}});
 await page.locator('.study-entry[data-category="1"][data-video="0"] .entry-minutes').fill('50');
 await page.locator('#study-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('changed elsewhere'));
 assert(await page.locator('.study-entry[data-category="1"][data-video="0"] .entry-minutes').inputValue()==='50','conflict discarded draft');
 assert((await(await page.request.get(base+'/api/study/weeks/'+when)).json()).totals.overall===45,'stale write replaced saved facts');
 // Native dialogs are intentionally handled by Playwright CLI's dialog-accept command.
 await page.locator('#study-reload').click();await ready();
 await page.locator(`[data-study-week="${when}"]`).click();await page.locator('#study-report-dialog:modal').waitFor();
 await page.locator('#study-delete').click();
 await page.waitForFunction(()=>!document.querySelector('#study-report-dialog')&&document.querySelector('#app').getAttribute('aria-busy')==='false');
 assert((await(await page.request.get(base+'/api/study/weeks/'+when)).json()).revision===0,'confirmed delete failed');
 assert(errors.length===0,JSON.stringify(errors));const result={chartClick:true,exports:4,conflictDraftPreserved:true,delete:true,errors};await page.evaluate(r=>window.studyExportQA=r,result);return result;
}
