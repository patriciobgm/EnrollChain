// Read-only acceptance of QR rendering and transaction reporting through Docker/Nginx.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(resolve('frontend/package.json'));
const { chromium } = require('@playwright/test');
const accounts = JSON.parse(readFileSync('.client-test/accounts.json', 'utf8'));
const account = accounts.find(row => row.email === 'registrar@enrollchain.test');
const base = process.env.CLIENT_TEST_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  await page.goto(`${base}/login`);
  await page.getByLabel('Email', {exact:true}).fill(account.email);
  await page.getByLabel('Password', {exact:true}).fill(account.password);
  await page.getByRole('button', {name:'Sign in', exact:true}).click();
  await page.waitForURL(/dashboard/);
  const id = await page.evaluate(async () => {
    const token = JSON.parse(sessionStorage.getItem('enrollchain-session')).access;
    const response = await fetch('/api/v1/documents/', {headers:{Authorization:`Bearer ${token}`}});
    if (!response.ok) throw new Error('Document list failed');
    const body = await response.json();
    const records = Array.isArray(body) ? body : body.results;
    return records.find(row => row.review_status === 'VERIFIED')?.id;
  });
  if (!id) throw new Error('No verified document available for QR acceptance');
  await page.goto(`${base}/verify-documents/${id}`);
  await page.getByRole('button', {name:'Show QR Code'}).click();
  const qr = page.getByRole('img', {name:/QR code linking/});
  await qr.waitFor();
  await page.waitForFunction(() => [...document.images].some(img => img.alt.startsWith('QR code') && img.naturalWidth > 0));
  await page.getByRole('button', {name:'Check stored PDF'}).click();
  await page.getByText('Compared with blockchain record', {exact:true}).waitFor();
  await page.getByText('File matches the record', {exact:true}).waitFor();
  if(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Verification page overflows mobile width');
  await page.screenshot({path:'.client-test/screenshots/verification-qr-mobile.png',fullPage:true});
  await page.goto(`${base}/reports`);
  await page.getByLabel('Report', {exact:true}).selectOption('blockchain-transactions');
  await page.getByRole('table').waitFor();
  await page.getByRole('button', {name:'View report row 1',exact:true}).click();
  await page.getByRole('dialog', {name:'Report Details',exact:true}).waitFor();
  await page.getByRole('dialog').getByText('Transaction', {exact:true}).waitFor();
  if(await page.getByRole('alert').count()) throw new Error('Report page has an error');
  console.log('PASS: Docker QR rendering, mobile layout, live blockchain comparison and transaction report.');
} finally { await browser.close(); }
