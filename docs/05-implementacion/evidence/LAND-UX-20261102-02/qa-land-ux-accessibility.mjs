import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:360,height:900}});
const report={};
try {
 await page.goto('http://127.0.0.1:6176',{waitUntil:'networkidle'});
 await expect(page.locator('video').first()).toBeVisible();
 report.normalVideo=await page.locator('video').first().evaluate(v=>({controls:v.controls,muted:v.muted,autoplay:v.autoplay,poster:!!v.poster}));
 expect(report.normalVideo.controls).toBe(true); expect(report.normalVideo.muted).toBe(true); expect(report.normalVideo.poster).toBe(true);
 await page.locator('video').first().evaluate(v=>v.dispatchEvent(new Event('error')));
 await expect(page.locator('img[alt*="vista estática de demostración"]').first()).toBeVisible(); report.videoErrorFallback='PASS';
 await page.getByRole('button',{name:'Abrir menú de navegación'}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Elegir cómo contratar'}).click();
 await expect(page.getByRole('radio',{name:'Organizo mi evento'})).toBeFocused();
 await expect(page.locator('input[type=radio]:checked')).toHaveCount(0); report.mobileGenericCta='PASS';
 const contrast=()=>page.evaluate(()=>{
   const rgba=s=>{const m=s.match(/[\d.]+/g)?.map(Number); return m?.length>=3?[m[0],m[1],m[2],m[3]??1]:[0,0,0,0];};
   const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);
   const output=[];
   for(const e of document.querySelectorAll('#como-contratar h2,#como-contratar p,#como-contratar label,#precios h2,#precios h3,#precios p,#precios li,#precios label,#precios select,#precios button,[role=dialog] h2,[role=dialog] h3,[role=dialog] p,[role=dialog] label,[role=dialog] button')){
     if(!e.checkVisibility()||!e.textContent.trim()||e.closest('[aria-hidden=true]'))continue;
     const cs=getComputedStyle(e), fg=rgba(cs.color); let bg=[245,242,236,1];
     for(let p=e;p;p=p.parentElement){const b=rgba(getComputedStyle(p).backgroundColor);if(b[3]===1){bg=b;break;}}
     const c=fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));const a=lum(c),b=lum(bg.slice(0,3)),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
     const size=parseFloat(cs.fontSize),large=size>=24||(size>=18.66&&Number(cs.fontWeight)>=700);
     output.push({text:e.textContent.trim().slice(0,75),ratio:Number(ratio.toFixed(2)),min:large?3:4.5});
   } return output;
 });
 report.pageContrast=await contrast();
 await page.getByRole('radio',{name:'Soy Planner/agencia'}).check();
 await page.locator('#precios').getByRole('button',{name:'Consultar condiciones para planners'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 expect(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement))).toBe(true);
 report.modalContrast=await contrast();
 for(let i=0;i<24;i++){
   await page.keyboard.press('Tab');
   expect(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement))).toBe(true);
   expect(await page.evaluate(()=>document.activeElement?.getAttribute('name'))).not.toBe('website');
 }
 await page.keyboard.press('Shift+Tab');
 expect(await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement))).toBe(true);
 report.tabTrap='PASS: 24 Tab and Shift+Tab remain inside Dialog; honeypot skipped';
 report.targets=await page.getByRole('dialog').getByRole('button').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label')??e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
 report.failures=[...report.pageContrast,...report.modalContrast].filter(x=>x.ratio<x.min);
 await writeFile('var/LAND-UX-20261102-02/qa-independent-accessibility.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 expect(report.failures).toEqual([]);
} finally {await browser.close();}
