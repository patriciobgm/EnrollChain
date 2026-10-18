// Read-only checks against the client stack. No records are created.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(resolve('frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
const account = JSON.parse(readFileSync('.client-test/accounts.json', 'utf8')).find(a => a.email === 'admin@enrollchain.test');
const browser = await chromium.launch();
try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:8080/login');
 await page.getByLabel('Email',{exact:true}).fill(account.email);
 await page.getByLabel('Password',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL(/administration$/);
 await page.goto('http://127.0.0.1:8080/sections');
 await page.getByRole('button',{name:/^Create section$/i}).click();
 const dialog = page.getByRole('dialog',{name:'Create Section'});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('Section code')).toBeVisible();
 await page.screenshot({path:'.client-test/screenshots/create-section-dialog.png',fullPage:true});
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await page.goto('http://127.0.0.1:8080/administration/users');
 const sort = page.getByRole('columnheader').getByRole('button').first();
 await page.mouse.move(1400,900);
 await expect(sort.locator('svg')).toHaveCSS('opacity','0');
 await sort.hover();
 await expect(sort.locator('svg')).toHaveCSS('opacity','1');
 await page.mouse.move(1400,900);
 await page.keyboard.press('Tab');
 await sort.focus();
 await expect(sort.locator('svg')).toHaveCSS('opacity','1');
 const signout=page.getByRole('button',{name:/^Sign out$/i}).first();
 await expect(signout).toHaveCSS('cursor','pointer');
 await expect(page.getByRole('alert')).toHaveCount(0);
 console.log('PASS: Create Section dialog, Escape, sort hover/focus indicators, Sign Out pointer.');
} finally { await browser.close(); }
