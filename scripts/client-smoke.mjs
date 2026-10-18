// Read-only browser acceptance checks against the Docker web entry point.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(resolve('frontend/package.json'));
const { chromium } = require('@playwright/test');
const axe = require('axe-core');
const accounts = JSON.parse(readFileSync('.client-test/accounts.json','utf8'));
const base = process.env.CLIENT_TEST_URL || 'http://127.0.0.1:8080';
mkdirSync('.client-test/screenshots',{recursive:true});
const browser = await chromium.launch();
const results = [];
try {
  for (const account of accounts) {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    await page.goto(`${base}/login`);
    if (await page.getByLabel('Authentication or recovery code').count()) throw new Error('MFA code shown before password authentication');
    await page.getByLabel('Email',{exact:true}).fill(account.email);
    await page.getByLabel('Password',{exact:true}).fill(account.password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.waitForURL(/\/(dashboard|administration)$/);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button',{name:/Notifications/}).first().click();
    const notices=page.getByRole('dialog',{name:'Notifications'});
    await notices.waitFor();
    await page.waitForLoadState('networkidle');
    if(await notices.getByRole('alert').count()) throw new Error(`${account.role}: notification request failed`);
    await page.keyboard.press('Escape');
    const destinations=await page.locator('nav[aria-label="Main navigation"] a').evaluateAll(links=>links.map(a=>({href:a.getAttribute('href'),label:a.textContent.trim()})));
    for(const {href,label} of destinations){
      await page.goto(`${base}${href}`);await page.waitForLoadState('networkidle');
      if(await page.locator('h1').count()!==1)throw new Error(`${account.role}: ${href} has duplicate or missing main heading`);
      if(await page.getByRole('alert').count())throw new Error(`${account.role} ${href}: ${await page.getByRole('alert').allTextContents()}`);
      await page.evaluate(axe.source);
      const violations=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>`${v.id}: ${v.nodes.map(n=>n.target).join(', ')}`));
      if(violations.length)throw new Error(`${account.role} ${href}: ${violations.join('; ')}`);
      results.push({role:account.superuser?'SUPERADMINISTRATOR':account.role,page:label,result:'PASS'});
    }
    await page.goto(`${base}/${account.role==='ADMINISTRATOR'?'administration':'dashboard'}`);await page.waitForLoadState('networkidle');
    await page.screenshot({path:`.client-test/screenshots/${account.email.split('@')[0]}-desktop.png`,fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:`.client-test/screenshots/${account.email.split('@')[0]}-mobile.png`,fullPage:true});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw new Error(`${account.role}: mobile horizontal overflow`);
    if(errors.length)throw new Error(errors.join('; '));
    await context.close();
  }
  const page=await browser.newPage();await page.goto(base);await page.waitForLoadState('networkidle');await page.screenshot({path:'.client-test/screenshots/home.png',fullPage:true});
  console.log(`PASS: ${results.length} role/page checks; desktop/mobile screenshots saved privately.`);
  writeFileSync('.client-test/browser-checks.json',JSON.stringify(results,null,2));
} finally {await browser.close();}
