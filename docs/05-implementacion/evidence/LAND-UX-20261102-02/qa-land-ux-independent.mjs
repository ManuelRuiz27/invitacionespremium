import { chromium, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const results=[];
const errors=[];
try {
  for (const width of [320,360,390,768,1024,1440]) {
    const context=await browser.newContext({viewport:{width,height:900}, reducedMotion:'reduce'});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    await page.goto('http://127.0.0.1:6176',{waitUntil:'networkidle'});
    const checkCustomerLanguage=async()=>{
      const copy=await page.evaluate(()=>[document.body.innerText,document.title,document.querySelector('meta[name="description"]')?.content,...[...document.querySelectorAll('[alt],[aria-label]')].map(e=>[e.getAttribute('alt'),e.getAttribute('aria-label')].join(' '))].join('\n'));
      expect(copy).not.toMatch(/\b(?:SKU|bracket|lead|DTO|API|Provider|M-1|RSVP|Scanner|Staff|Venue|PVP)\b/i);
    };
    await checkCustomerLanguage();
    await expect(page.getByRole('heading',{level:1})).toHaveText('Menos listas dispersas. Más control de tu evento.');
    const pricing=page.locator('#precios');
    await expect(page.locator('input[type=radio]:checked')).toHaveCount(0);
    await pricing.getByRole('button',{name:'Elegir cómo contratar'}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('radio',{name:'Organizo mi evento'})).toBeFocused();
    await page.keyboard.press('Space');
    await pricing.getByLabel('Servicio',{exact:true}).selectOption('FLYER');
    await pricing.getByLabel('Capacidad del evento').selectOption('100');
    const price=await pricing.getByRole('status').innerText();
    await expect(pricing.getByRole('button',{name:'Conocer cómo funciona'})).toBeVisible();
    await pricing.getByRole('button',{name:'Conocer cómo funciona'}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (const label of ['Soy Planner/agencia','Tengo salón o jardín']) {
      await page.getByRole('radio',{name:label}).check();
      await expect(pricing.getByLabel('Servicio',{exact:true})).toHaveValue('FLYER');
      await expect(pricing.getByLabel('Capacidad del evento')).toHaveValue('100');
      expect(await pricing.getByRole('status').innerText()).toBe(price);
    }
    await expect(page.locator('video')).toHaveCount(0);
    const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth, intentTargets:[...document.querySelectorAll('#como-contratar label')].map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))}));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(width);
    const trigger=pricing.getByRole('button',{name:'Solicitar propuesta para mi salón'});
    await trigger.focus(); await page.keyboard.press('Enter');
    const dialog=page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await checkCustomerLanguage();
    await expect(dialog.getByLabel('Servicio',{exact:true})).toHaveValue('FLYER');
    await dialog.getByLabel('Servicio',{exact:true}).selectOption('PHYSICAL_QR');
    await dialog.getByLabel('Capacidad del evento').selectOption('50');
    const modalDimensions=await dialog.evaluate(e=>({w:e.getBoundingClientRect().width,scroll:e.scrollWidth,client:e.clientWidth}));
    expect(modalDimensions.scroll).toBeLessThanOrEqual(modalDimensions.client);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
    results.push({width,dimensions,modalDimensions,journeys:'PASS',editorialSection2_1:'PASS'});
    await context.close();
  }
  // Isolated UI transport simulations: no lead is posted to the backend.
  const context=await browser.newContext({viewport:{width:360,height:900}});
  const page=await context.newPage();
  let posts=[]; let responseStatus=409;
  await page.route('**/api/v1/public/commercial-leads',async route=>{
    posts.push(route.request().postDataJSON());
    await route.fulfill({status:responseStatus,contentType:'application/json',body:JSON.stringify(responseStatus===201?{accepted:true}:{code:'TEST_FAILURE',message:'test',operationId:'qa-independent'})});
  });
  await page.goto('http://127.0.0.1:6176',{waitUntil:'networkidle'});
  await page.getByRole('radio',{name:'Soy Planner/agencia'}).check();
  await page.locator('#precios').getByRole('button',{name:'Consultar condiciones para planners'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Nombre de contacto').fill('QA Ficticio');
  await dialog.getByLabel('Empresa / salón / jardín / agencia').fill('Simulación independiente');
  await dialog.getByLabel('Correo electrónico').fill('qa@example.invalid');
  await dialog.getByRole('checkbox').check();
  await dialog.getByLabel('Mensaje (opcional)').fill('Texto libre: "sku":"FLIPBOOK"\n<script>simulación</script>');
  await dialog.getByRole('button',{name:'Enviar solicitud'}).click();
  await expect(dialog.getByText(/solicitud cambió/)).toBeVisible();
  await expect(dialog.getByLabel('Nombre de contacto')).toHaveValue('QA Ficticio');
  responseStatus=429;
  await dialog.getByRole('button',{name:'Reintentar envío'}).click();
  await expect(dialog.getByText(/varias solicitudes/)).toBeVisible();
  await expect(dialog.getByLabel('Correo electrónico')).toHaveValue('qa@example.invalid');
  responseStatus=201;
  await dialog.getByRole('button',{name:'Reintentar envío'}).click();
  await expect(dialog.getByText(/Recibimos tu solicitud/)).toBeVisible();
  expect(posts).toHaveLength(3); expect(posts[1]).toEqual(posts[0]); expect(posts[2]).toEqual(posts[0]);
  expect(JSON.parse(posts[0].notes).contextoPrecioPublico).toEqual({sku:'PHYSICAL_QR',capacidad:'1–50 personas'});
  expect(Object.keys(posts[0]).sort()).toEqual(['submissionId','opportunityType','contactName','businessName','email','phone','estimatedEventsPerMonth','notes','privacyAccepted','website'].sort());
  results.push({transportSimulations:'409/429/201 PASS',sameSubmissionId:true,notesOnlyContext:true,postsReachedBackend:false});
  await context.close();
} finally { await browser.close(); }
await mkdir('var/LAND-UX-20261102-02',{recursive:true});
await writeFile('var/LAND-UX-20261102-02/qa-independent-results.json',JSON.stringify({results,errors},null,2));
expect(errors).toEqual([]);
console.log(JSON.stringify({results,errors},null,2));
