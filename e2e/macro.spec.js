import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
test('macro research imports fictional inputs locally and separates the two return views',async({page},testInfo)=>{
 const file=testInfo.outputPath('fictional.json');execFileSync(process.execPath,['scripts/macro-example.mjs',file]);
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto('/macro');await expect(page.locator('#status')).toContainText('Load a release-aware');
 await page.locator('#file').setInputFiles({name:'fictional.json',mimeType:'application/json',buffer:readFileSync(file)});
 await expect(page.locator('#status')).toContainText('FICTIONAL TEST INPUTS',{timeout:30000});
 await expect(page.locator('#results tr')).toHaveCount(15);await expect(page.locator('#basis')).toContainText('cash ETF');
 await page.locator('#view').selectOption('tactical');await expect(page.locator('#results tr')).toHaveCount(10);await expect(page.locator('#basis')).toContainText('versus benchmark');
 await page.locator('#horizon').selectOption('3');await page.locator('#mode').selectOption('months');
 expect(requests.every(url=>url.startsWith('http://127.0.0.1:8787/'))).toBe(true);expect(requests.some(url=>url.includes('/api/'))).toBe(false);expect(errors).toEqual([]);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:testInfo.outputPath('macro-mobile.png'),fullPage:true});
});
