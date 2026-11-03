import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
const results=[];
await mkdir('var/LAND-UX-20261102-02/crop-independent',{recursive:true});
try{
 for(const width of [360,1440]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:6176',{waitUntil:'networkidle'});
  const pictures=[
   ['mesas',2,'Plano de mesas de demostración del evento Boda Flyer — mesas asignadas'],
   ['distribucion',3,'Vista de demostración de invitaciones y accesos individuales del evento Boda Flyer']
  ];
  for(const [name,index,alt] of pictures){
   const scene=page.locator(`[data-scene="${index}"]`);
   await scene.scrollIntoViewIfNeeded();
   if(width>=900) await scene.getByRole('button',{name:'Ver pantalla'}).click();
   const image=page.getByRole('img',{name:alt,exact:true});
   await expect(image).toBeVisible();
   const picture=image.locator('..');
   const data=await picture.evaluate(p=>{
    const img=p.querySelector('img');const a=p.getBoundingClientRect(),b=img.getBoundingClientRect();
    return {naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,widthAttribute:img.width,heightAttribute:img.height,pictureWidth:a.width,pictureHeight:a.height,imageWidth:b.width,imageHeight:b.height,topCrop:(a.top-b.top)/b.height,leftCrop:(a.left-b.left)/b.width,overflow:getComputedStyle(p).overflow};
   });
   expect(data.naturalWidth).toBe(2160);expect(data.naturalHeight).toBe(1350);
   // Percentage sizing inside a 1px frame differs by <1% at 360px;
   // compare relative error so the border is not mistaken for image distortion.
   expect(Math.abs(data.imageWidth/data.imageHeight-1.6)/1.6).toBeLessThan(.01);
   expect(data.topCrop).toBeCloseTo(.28,2);expect(data.leftCrop).toBeCloseTo(.16,2);expect(data.overflow).toBe('hidden');
   await page.locator('header').evaluate(e=>e.style.visibility='hidden');
   await picture.screenshot({path:`var/LAND-UX-20261102-02/crop-independent/${width}-${name}.png`});
   await page.locator('header').evaluate(e=>e.style.visibility='');
   results.push({width,name,...data});
  }
  for(const id of ['planners','venues']){
   const picture=page.locator(`#${id} picture`).first();
   await picture.scrollIntoViewIfNeeded();
   const data=await picture.evaluate(p=>{const i=p.querySelector('img'),a=p.getBoundingClientRect(),b=i.getBoundingClientRect();return {naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,pictureWidth:a.width,pictureHeight:a.height,imageRatio:b.width/b.height,topCrop:(a.top-b.top)/b.height,leftCrop:(a.left-b.left)/b.width};});
   expect(data.naturalHeight).toBe(1350);expect(Math.abs(data.imageRatio-1.6)/1.6).toBeLessThan(.01);expect(data.topCrop).toBeCloseTo(.28,2);expect(data.leftCrop).toBeCloseTo(.16,2);
   await picture.screenshot({path:`var/LAND-UX-20261102-02/crop-independent/${width}-${id}.png`});
   results.push({width,name:id,...data});
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.close();
 }
 await writeFile('var/LAND-UX-20261102-02/qa-independent-crop.json',JSON.stringify({status:'PASS',results},null,2));
 console.log('PASS: natural2160x1350, CSS aspect1.6 within1% frame allowance, top28%/left16% clipping; all four surfaces at360/1440 without overflow.');
}finally{await browser.close();}
