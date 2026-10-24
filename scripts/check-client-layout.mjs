// Read-only UI regression checks against the running Docker portal.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(resolve('frontend/package.json'));
const {chromium, expect} = require('@playwright/test');
const accounts=JSON.parse(readFileSync('.client-test/accounts.json','utf8'));
const account=accounts.find(a=>a.email==='admin@enrollchain.test');
const base=process.env.CLIENT_TEST_URL || 'http://127.0.0.1:8080';
mkdirSync('.client-test/screenshots',{recursive:true});
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await page.goto(`${base}/login`);
 await page.getByLabel('Email',{exact:true}).fill(account.email);
 await page.getByLabel('Password',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL(/administration$/);
 for(const width of [320,390,768]) {
  await page.setViewportSize({width,height:844});
  await page.goto(`${base}/reports`);
  const profile=page.getByRole('button',{name:'Account menu',exact:true});
  await profile.click(); await expect(profile).toHaveAttribute('aria-expanded','true');
  await page.mouse.click(8,750); await expect(profile).toHaveAttribute('aria-expanded','false');
  const menu=page.getByRole('button',{name:'Open navigation'});
  await menu.click(); await expect(page.getByRole('dialog',{name:'Navigation'})).toBeVisible();
  await page.screenshot({path:`.client-test/screenshots/navigation-${width}.png`});
  await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
  await expect(page.getByRole('table')).toBeVisible();
  const box=await page.getByRole('table').boundingBox(); if(box.y>550)throw new Error('Report results pushed below controls');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile horizontal overflow');
  if(width < 640) {
    await page.getByRole('button',{name:'View report row 1',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Report Details'})).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.screenshot({path:`.client-test/screenshots/reports-${width}.png`});
  await page.goto(`${base}/blockchain`);
  const details=page.getByRole('button',{name:/^View .* details$/}).first();
  await details.click();await expect(page.getByRole('dialog',{name:'Verification Details'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(details).toBeFocused();
  await page.screenshot({path:`.client-test/screenshots/blockchain-${width}.png`});
 }
 await page.goto(`${base}/administration/configuration`);
 const add=page.getByRole('button',{name:'Add configuration',exact:true});await add.click();
 await expect(page.getByRole('dialog',{name:'Add Configuration'})).toBeVisible();await page.keyboard.press('Escape');await expect(add).toBeFocused();
 await page.goto(`${base}/sections`);
 const roster=page.getByRole('button',{name:'View roster',exact:true}).first();await roster.click();
 await expect(page.getByRole('dialog',{name:/Roster/})).toBeVisible();await page.keyboard.press('Escape');await expect(roster).toBeFocused();
 await page.goto(`${base}/security`);await expect(page.getByText('Two-Factor Authentication:',{exact:false})).toBeVisible();
 console.log('PASS: Docker account dismissal, navigation, mobile reports, blockchain details, configuration/roster dialogs and security label at 320/390/768px.');
} finally {await browser.close();}
