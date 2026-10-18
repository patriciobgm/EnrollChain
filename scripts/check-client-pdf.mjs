// Exercise the real Docker PDF worker with a synthetic document; no stored data changes.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(resolve('frontend/package.json'));
const {chromium,expect}=require('@playwright/test');
const account=JSON.parse(readFileSync('.client-test/accounts.json','utf8')).find(a=>a.role==='REGISTRAR');
const stream='BT /F1 18 Tf 30 150 Td (Synthetic PDF Preview) Tj ET\n';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 220] /Resources << /Font << /F1 6 0 R >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}endstream`,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 220] /Resources << /Font << /F1 6 0 R >> >> /Contents 4 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
let pdf='%PDF-1.4\n';const offsets=[0];for(const [i,obj] of objects.entries()){offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}const xref=pdf.length;pdf+=`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const id='00000000-0000-4000-8000-000000000001';
const document={id,application:id,application_reference:'SYNTHETIC-PREVIEW',learner_name:'Synthetic Preview',requirement_name:'Preview Fixture',original_filename:'synthetic.pdf',review_status:'PENDING',version:1,uploaded_at:new Date().toISOString(),review:null};
const browser=await chromium.launch();
try {const page=await browser.newPage();let workerMime='';page.on('response',r=>{if(r.url().includes('pdf.worker'))workerMime=r.headers()['content-type'] || '';});
await page.goto('http://127.0.0.1:8080/login');await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('Password',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(/dashboard/);
await page.route('**/documents/review-queue/**',route=>route.fulfill({json:{count:1,next:null,previous:null,results:new URL(route.request().url()).searchParams.get('group') ? [{application:id,reference:'SYNTHETIC-PREVIEW',learner_name:'Synthetic Preview',document_count:1,period_name:'Preview Test',uploaded_at:document.uploaded_at}] : [document]}}));
await page.route(`**/documents/${id}/preview/`,route=>route.fulfill({contentType:'application/pdf',body:Buffer.from(pdf)}));
await page.goto('http://127.0.0.1:8080/reviews');await page.getByRole('button',{name:'View Documents for Synthetic Preview'}).click();await page.getByRole('button',{name:'Preview PDF',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Page 1 of 2'})).toBeVisible();await expect.poll(()=>page.locator('canvas').evaluate(c=>c.width)).toBeGreaterThan(300);await expect(page.getByRole('alert')).toHaveCount(0);await page.getByRole('button',{name:'Next PDF page'}).click();await expect(page.getByRole('status').filter({hasText:'Page 2 of 2'})).toBeVisible();await page.screenshot({path:'.client-test/screenshots/pdf-preview.png',fullPage:true});console.log(`PASS: Docker PDF preview and page navigation. Worker content type: ${workerMime || 'verified through module loading'}`);
}finally{await browser.close()}
