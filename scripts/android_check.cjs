// Run only against the separately installed Verity QA package after explicit device consent.
// adb forward tcp:9223 localabstract:webview_devtools_remote_<QA_PID>
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
async function main() {
  const pid = execFileSync('adb', ['shell', 'pidof', 'io.github.goyimuser.verity.qa'], {encoding:'utf8'}).trim();
  assert.match(pid, /^\d+$/, 'Start the isolated QA app first');
  execFileSync('adb', ['forward','tcp:9223',`localabstract:webview_devtools_remote_${pid}`]);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  try {
    const page = browser.contexts()[0].pages().find(p => /127\.0\.0\.1/.test(p.url()));
    assert.ok(page, 'QA app page is unavailable');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const ready = () => page.locator('#app[aria-busy=false]').waitFor();
    await ready();
    const result = await page.evaluate(async () => {
      const rows = await api('/api/exams');
      if (rows.some(r => r.title !== 'Android QA fixture')) throw Error('Refusing a non-fixture QA database');
      if (!rows.length) await api('/api/exams', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Android QA fixture',exam_date:'2026-11-01',total_questions:15,correct_answers:3,incorrect_answers:4})});
      const analytics = await api('/api/study/analytics');
      if (!analytics.total_minutes) await api('/api/study/weeks/2026-10-31', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:0,entries:[{category_id:1,minutes:210},{category_id:8,minutes:90}]})});
      return {exams:await api('/api/exams'),study:await api('/api/study/analytics')};
    });
    assert.equal(result.exams.length,1);
    assert.equal(result.exams[0].raw_score,8);
    assert.ok(Math.abs(result.exams[0].percentage - 100*8/60)<1e-9);
    assert.equal(result.study.total_minutes,300);
    fs.mkdirSync('output/android-validation',{recursive:true});
    for (const language of ['en','fa']) for (const mode of ['advanced','quick']) {
      await page.evaluate(() => {S.view='settings';return load()});
      await page.locator(`[data-language=${language}]`).click();
      await ready();
      await page.locator(`[data-mode=${mode}]`).click();
      await ready();
      assert.equal(await page.locator('html').getAttribute('dir'),language==='fa'?'rtl':'ltr');
      assert.equal(await page.locator(`[data-mode=${mode}]`).getAttribute('aria-pressed'),'true');
      await page.evaluate(() => {S.view='study';return load()});
      await ready();
      assert.equal(await page.locator('#study-stack canvas').count(),1);
      await page.screenshot({path:`output/android-validation/${language}-${mode}.png`});
      const report = await page.evaluate(async language => {
        const r=await fetch('/api/android/report?kind=study&language='+language);
        return {status:r.status,html:await r.text()};
      },language);
      assert.equal(report.status,200);
      assert.ok(report.html.includes(language==='fa'?'rtl':'ltr'));
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync('output/android-validation/result.json',JSON.stringify({ok:true,checks:['scoring','weekly totals','settings buttons','bilingual modes','study chart','report HTML'],errors},null,2));
    console.log('Android QA workflows passed. Run again after force-stop/restart to verify persistence.');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
