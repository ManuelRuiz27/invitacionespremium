import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adminGuide, salonGuide, usabilityTasks } from './content.mjs';
import { verifyImages } from './verify.mjs';
import { createCrops } from './crops.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = join(root, 'docs/guias-usuario/control-de-acceso');
const evidence = join(root, 'docs/05-implementacion/evidence/m02-b01-ux02');
const requireClient = createRequire(join(root, 'apps/client/package.json'));
const { PDFDocument } = requireClient('pdf-lib');
const inventory = await verifyImages(evidence);
await mkdir(output, { recursive: true });
const crops = await createCrops(inventory, evidence, join(output, 'imagenes'));
const esc = (value) =>
  String(value).replace(
    /[&<>"']/gu,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
const css = `
:root{color-scheme:light;--ink:#171717;--muted:#57594f;--line:#e5e0d8;--cream:#f5f2ec;--olive:#6d705e}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:17px/1.55 Arial,Helvetica,sans-serif}
.page{position:relative;width:min(100%,960px);margin:28px auto;background:white;padding:44px 48px 54px;box-shadow:0 4px 20px #17171708}
.brand{font-size:13px;letter-spacing:.12em;font-weight:700;padding-bottom:14px;border-bottom:1px solid var(--line)}
.eyebrow{color:var(--olive);font-size:13px;letter-spacing:.06em;text-transform:uppercase;margin:24px 0 12px}
h1,h2{font-family:Georgia,'Times New Roman',serif;font-weight:400;line-height:1.13}h1{font-size:46px;max-width:700px;margin:28px 0 24px}h2{font-size:31px;margin:12px 0 24px}
p{margin:12px 0}.lead{font-size:21px}.note{padding:18px 20px;background:var(--cream);border-left:3px solid #b8a58a;margin:26px 0;color:var(--muted);font-size:15px}
.toc{padding-left:22px;font-size:15px;columns:2;column-gap:36px}.toc li{margin-bottom:7px;break-inside:avoid}.toc a{color:inherit;text-decoration:none}
.step-label{font-size:13px;color:var(--olive);font-weight:700}.action{font-size:19px;line-height:1.5}.result{font-size:16px;border-left:3px solid #287a5b;padding-left:15px;margin-top:22px}.result b{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#287a5b}
.shot{position:relative;margin:26px 0 10px;border:1px solid var(--line);background:var(--cream);line-height:0}.shot img{display:block;width:100%;height:auto}.focus{position:absolute;border:2px solid #a76510;outline:2px solid white;border-radius:4px;pointer-events:none}.caption{color:var(--muted);font-size:11px;margin:6px 0 18px;line-height:1.4}
.mobile .shot{width:260px;margin:22px auto 10px}.mobile .caption{text-align:center}.login .shot,.portrait .shot{max-width:550px;margin-left:auto;margin-right:auto}.login .shot img,.portrait .shot img{min-width:0}.page[id] .note{padding:12px 16px;margin:16px 0;font-size:14px}.footer{font-size:11px;color:var(--muted);border-top:1px solid var(--line);margin-top:30px;padding-top:10px;display:flex;justify-content:space-between;gap:20px}
.task{border-top:1px solid var(--line);padding:15px 0 12px}.task h2{font:600 17px/1.4 Arial,sans-serif;margin:0 0 12px}.checks{font-size:12px;display:flex;gap:15px}.box{display:inline-block;width:11px;height:11px;border:1px solid var(--muted);margin-right:4px}.ruled{height:42px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);padding-top:8px}.participant{font-size:13px;border-bottom:1px solid var(--line);padding-bottom:14px}
@media(max-width:600px){.page{margin:0 0 16px;padding:26px 20px 34px;box-shadow:none}h1{font-size:35px}h2{font-size:27px}.toc{columns:1}.action{font-size:18px}.shot{overflow:auto}.shot img{min-width:650px}.mobile .shot img{min-width:0}.focus{display:none}.checks{flex-wrap:wrap;gap:8px}}
@page{size:letter;margin:0}
@media print{body{background:white;font-size:11pt}.page{margin:0;width:8.5in;height:11in;padding:.48in .55in .6in;box-shadow:none;break-after:page;overflow:visible}.page:last-child{break-after:auto}.brand{font-size:9pt}h1{font-size:36pt}h2{font-size:23pt;margin:10px 0 18px}.eyebrow{font-size:9pt;margin:20px 0 10px}.action{font-size:13pt}.result{font-size:11.5pt}.shot{margin-top:22px}.shot img{min-width:0}.focus{display:block}.caption{font-size:8pt}.login .shot{width:5.7in}.portrait .shot{width:5.4in}.mobile .shot{width:2.65in;margin-top:18px}.mobile h2{margin-bottom:12px}.mobile .action{font-size:12pt}.mobile .result{margin-top:12px;font-size:11pt}.footer{position:absolute;bottom:.32in;left:.55in;right:.55in;font-size:8pt}.toc{font-size:10pt}.note{font-size:11pt}.task{padding:8px 0 7px}.task .step-label{margin:4px 0;font-size:9pt}.task h2{font-size:12pt;margin-bottom:7px}.checks{font-size:9pt}.ruled{height:35px}}
`;

function wrap(title, body) {
  return `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>InvitacionesPremium — ${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>\n`;
}
function brand() {
  return '<header class="brand">INVITACIONESPREMIUM</header>';
}
function footer(number, total) {
  return `<footer class="footer"><span>Control de acceso · Guía de usuario</span><span>${number} / ${total}</span></footer>`;
}

function guideHtml(guide) {
  const steps = guide.sections.flatMap((section) => section.steps);
  const total = steps.length + 1;
  let index = 0;
  const contents = guide.sections
    .map(
      (section) =>
        `<p><b>${esc(section.title)}</b></p><ol class="toc" start="${index + 1}">${section.steps.map((step) => `<li><a href="#paso-${++index}">${esc(step.title)}</a></li>`).join('')}</ol>`
    )
    .join('');
  let html = `<section class="page">${brand()}<p class="eyebrow">${esc(guide.audience)}</p><h1>${esc(guide.title)}</h1><p class="lead">${esc(guide.intro)}</p><aside class="note">${esc(guide.note)}</aside>${contents}${footer(1, total)}</section>`;
  index = 0;
  for (const section of guide.sections)
    for (const step of section.steps) {
      index++;
      const image = crops.get(`${step.image}.png`);
      assert(image, `Missing guide image: ${step.image}`);
      let focus = '';
      const box = image.focus
        ? { ...image.focus, x: image.focus.x - image.crop.left, y: image.focus.y - image.crop.top }
        : null;
      if (
        box &&
        box.width < image.crop.width * 0.8 &&
        box.height < 100 &&
        box.y >= 0 &&
        box.y + box.height <= image.crop.height
      ) {
        focus = `<span aria-hidden="true" class="focus" style="left:${(box.x / image.crop.width) * 100}%;top:${(box.y / image.crop.height) * 100}%;width:${(box.width / image.crop.width) * 100}%;height:${(box.height / image.crop.height) * 100}%"></span>`;
      }
      html += `<section class="page ${image.file.includes('00-entrar') ? 'login' : image.width < 500 && image.crop.width / image.crop.height < 1 ? 'mobile' : image.crop.width / image.crop.height < 1 ? 'portrait' : ''}" id="paso-${index}">${brand()}<p class="eyebrow">${esc(section.title)}</p><span class="step-label">PASO ${index}</span><h2>${esc(step.title)}</h2><p class="action">${esc(step.action)}</p><figure class="shot"><img src="imagenes/${image.file}" alt="${esc(step.title)} — pantalla real de ${image.surface === 'admin' ? 'administración' : image.surface === 'scanner' ? 'recepción' : 'la cuenta del salón'}">${focus}</figure><p class="caption">${image.width < 500 ? 'Teléfono' : 'Escritorio'} · Ejemplo ficticio${image.masks.length ? ' · Datos privados ocultos con franjas oscuras' : ''}</p><p class="result"><b>Lo que debes ver</b>${esc(step.result)}</p>${index === steps.length && guide.closing ? `<aside class="note">${esc(guide.closing)}</aside>` : ''}${footer(index + 1, total)}</section>`;
    }
  return { html: wrap(guide.title, html), pages: total };
}

function usabilityHtml() {
  let body = '';
  for (let page = 0; page < 2; page++) {
    body += `<section class="page">${brand()}<p class="eyebrow">Prueba con personas que no conocen el sistema</p><h2>Prueba de usabilidad</h2><p class="participant">Participante: ____________________ &nbsp; Fecha: ______________<br>Evaluador: ____________________ &nbsp; Dispositivo: ______________</p>`;
    for (const [index, [context, task]] of usabilityTasks.slice(page * 5, page * 5 + 5).entries()) {
      body += `<article class="task"><p class="step-label">${esc(context)}</p><h2>${page * 5 + index + 1}. ${esc(task)}</h2><div class="checks"><span><i class="box"></i>Sin ayuda</span><span><i class="box"></i>Necesitó orientación</span><span><i class="box"></i>No pudo terminar</span></div><div class="ruled">¿Qué le confundió?</div></article>`;
    }
    body += footer(page + 1, 2) + '</section>';
  }
  return { html: wrap('Prueba de usabilidad', body), pages: 2 };
}

const browser = await chromium.launch();
try {
  for (const [file, document] of [
    ...[adminGuide, salonGuide].map((guide) => [guide.file, guideHtml(guide)]),
    ['03_PRUEBA_USABILIDAD', usabilityHtml()]
  ]) {
    const htmlPath = join(output, `${file}.html`);
    await writeFile(htmlPath, document.html);
    const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
    // Fully local assets only, including when rendering an editable source.
    await page.route(/^https?:/u, (route) => route.abort());
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts.ready);
    assert(
      await page
        .locator('img')
        .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)),
      'Missing image.'
    );
    await page.emulateMedia({ media: 'print' });
    const overflow = await page.locator('.page').evaluateAll((pages) =>
      pages.some((page) => {
        const box = page.getBoundingClientRect();
        const footer = page.querySelector('.footer');
        const contentBottom = footer.getBoundingClientRect().top - 10;
        return [...page.children].some((child) => {
          const r = child.getBoundingClientRect();
          return (child !== footer && r.bottom > contentBottom) || r.right > box.right;
        });
      })
    );
    assert(!overflow, `Print overflow in ${file}`);
    const pdf = await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true, tagged: true });
    const parsed = await PDFDocument.load(pdf);
    assert.equal(parsed.getPageCount(), document.pages, `Unexpected pagination in ${file}`);
    await writeFile(join(output, `${file}.pdf`), pdf);
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= 390),
      'Mobile document overflows horizontally.'
    );
    await page.close();
    process.stdout.write(`${file}: ${document.pages} Letter pages; images, print layout and mobile width verified.\n`);
  }
} finally {
  await browser.close();
}
const lines = inventory.captures.map(
  (image) =>
    `| [${image.file}](../../05-implementacion/evidence/m02-b01-ux02/${image.file}) | ${image.surface} | ${image.mode} | ${image.width} × ${image.height} | ${image.masks.length} |`
);
await writeFile(
  join(output, 'INDICE_CAPTURAS.md'),
  `# Índice de capturas UX02\n\n${inventory.captures.length} capturas nuevas del producto real. Datos ficticios; secretos y cámara enmascarados antes de escribir PNG. Fuente de código: ${inventory.sourceCommit ?? 'ver historial del repositorio'}. Mesas opcionales fuera de este escenario.\n\n| Captura | Superficie | Modalidad | Resolución | Máscaras |\n| --- | --- | --- | --- | --- |\n${lines.join('\n')}\n`
);
// Ensure editable sources are portable and carry neither private URLs nor external dependencies.
for (const guide of [adminGuide, salonGuide]) {
  const source = await readFile(join(output, `${guide.file}.html`), 'utf8');
  assert(!/https?:\/\//u.test(source));
}
