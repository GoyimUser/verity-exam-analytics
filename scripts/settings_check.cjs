/* Regression for the reported workspace-loading failure, including empty history. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),{spawn}=require('child_process'),fs=require('fs'),path=require('path');
const base='http://127.0.0.1:8014',output='output/playwright/settings';fs.mkdirSync(output,{recursive:true});
const server=spawn(process.env.VERITY_TEST_PYTHON||'python',['-m','tests.serve_ux'],{env:{...process.env,VERITY_TEST_PORT:'8014'},windowsHide:true});
const log=fs.createWriteStream(path.join(output,'server.log'));server.stdout.pipe(log);server.stderr.pipe(log);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(page){await page.locator('#app[aria-busy=false] #main-content').waitFor();assert.equal(await page.evaluate(()=>S.lastLoadError),null);assert.equal(await page.locator('#toast.error').count(),0)}
async function settings(page){if(await page.locator('#menu-btn').isVisible())await page.locator('#menu-btn').click();await page.locator('[data-view=settings]').click();await ready(page);assert.equal(await page.locator('[data-mode=quick]').evaluate(e=>typeof e.onclick),'function')}
(async()=>{
 let browser;const result={checks:[],errors:[]};
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/settings')).ok)break}catch{}await sleep(100)}
  browser=await chromium.launch(!fs.existsSync(chromium.executablePath())?{channel:'msedge'}:{});const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error'&&msg.text().includes('Workspace loading failed'))result.errors.push(msg.text())});
  for(const history of ['populated','empty']){
   if(history==='empty')for(const row of await(await page.request.get(base+'/api/exams')).json())await page.request.delete(base+'/api/exams/'+row.id);
   for(const language of ['en','fa'])for(const theme of ['light','dark'])for(const width of [390,1440]){
    await page.request.patch(base+'/api/settings',{data:{language,theme,application_mode:'advanced'}});await page.setViewportSize({width,height:950});await page.goto(base);await ready(page);
    await page.evaluate(async()=>{S.view='history';S.page=99;await load()});await ready(page);
    assert.equal(await page.evaluate(()=>S.page),0);assert.equal(await page.evaluate(()=>S.exams.length===Math.min(50,S.analytics.count)),true);
    const html=await(await page.request.get(base)).text();assert.match(html,/\/static\/app\.js\?v=[a-f0-9]{16}/);
    await settings(page);
    // Settings and Reports must stay usable even when an exam analytics request would fail.
    let unexpected=0;await page.route('**/api/analytics?*',route=>{unexpected++;return route.fulfill({status:500,body:'{"detail":"Injected analytics failure"}',contentType:'application/json'})});
    await page.locator(`[data-language=${language==='en'?'fa':'en'}]`).click();await ready(page);
    assert.equal(unexpected,0);await page.locator(`[data-language=${language}]`).click();await ready(page);assert.equal(unexpected,0);
    await page.unroute('**/api/analytics?*');
    for(let i=0;i<3;i++){
     await page.locator('[data-mode=quick]').click();await ready(page);await page.locator('#quick-form').waitFor();
     await settings(page);await page.locator('[data-mode=advanced]').click();await ready(page);await page.locator('#overview-content').waitFor();await settings(page);
    }
    await page.screenshot({path:path.join(output,`${history}-${language}-${theme}-${width}.png`)});
    result.checks.push(`${history}-${language}-${theme}-${width}`);
   }
  }
  assert.deepEqual(result.errors,[]);result.ok=true;
 }catch(e){result.ok=false;result.failure=String(e.stack);process.exitCode=1}
 finally{if(browser)await browser.close();server.kill();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
})();
