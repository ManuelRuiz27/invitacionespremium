import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:360,height:900},reducedMotion:'reduce'});
try {
 const response=await page.request.get('http://127.0.0.1:6176/api/v1/public/pricing'); expect(response.ok()).toBe(true);const prices=await response.json();
 let release;let count=0;let mode='error';
 const gate=new Promise(r=>release=r);
 await page.route('**/api/v1/public/pricing',async route=>{
   count++;
   if(mode==='error'){await gate;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'TEMPORARY',message:'Unavailable'})});}
   else await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(mode==='incomplete'?prices.slice(0,-1):prices)});
 });
 await page.goto('http://127.0.0.1:6176',{waitUntil:'domcontentloaded'});
 const pricing=page.locator('#precios');
 await expect(pricing.getByRole('progressbar')).toBeVisible();
 await expect(pricing.getByText('Precio pendiente de consulta')).toBeVisible();
 expect(await pricing.innerText()).not.toMatch(/\$[\d,]+/);
 release();
 await expect(pricing.getByText('No pudimos consultar los precios en este momento.')).toBeVisible();
 expect(await pricing.innerText()).not.toMatch(/\$[\d,]+/);const initialRequests=count;mode='incomplete';
 await pricing.getByRole('button',{name:'Reintentar',exact:true}).click();
 await expect(pricing.getByText('Los precios públicos están temporalmente no disponibles.')).toBeVisible();
 expect(await pricing.innerText()).not.toMatch(/\$[\d,]+/);expect(count).toBe(initialRequests+1);mode='ready';
 await pricing.getByRole('button',{name:'Reintentar',exact:true}).click();
 const p=prices.find(p=>p.serviceCode==='PHYSICAL_QR'&&p.capacityMax===50);
 const amount=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(p.amountMxnCents/100);
 await expect(pricing.getByText(`${amount} MXN antes de IVA`)).toBeVisible();expect(count).toBe(initialRequests+2);
 await writeFile('var/LAND-UX-20261102-02/qa-independent-pricing-states.json',JSON.stringify({loading:'PASS',error503:'PASS',incomplete:'PASS',explicitRetry:'PASS',noInventedPrice:true,oracle:'live public API',networkRequests:count,unavailable:'Existing use-public-pricing.test.tsx and LandingCommercialFlow.test.tsx reviewed; undefined configured client produces unavailable with no request.'},null,2));
 console.log('PASS: loading → HTTP503 → explicit retry → incomplete → explicit retry → live PVP; no invented price.');
} finally {await browser.close();}
