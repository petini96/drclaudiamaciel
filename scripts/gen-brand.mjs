/**
 * Gera os ativos de marca de assets/ a partir do logotipo original.
 *
 *   npx --yes -p sharp@0.34 node scripts/gen-brand.mjs
 *
 * NAO faz parte do `npm run build`, e por isso o `sharp` nao esta no
 * package.json. O site e um estatico sem dependencia nenhuma, e manter assim e
 * o que garante que ele continue construindo daqui a tres anos com um `node
 * build.mjs` e mais nada. Estes arquivos mudam quando o logotipo muda — o que
 * pode nunca acontecer —, entao o certo e gerar uma vez, commitar o resultado e
 * deixar este script como a receita de como ele saiu.
 *
 * A fonte e assets/brand/logo-original.webp (2382x2382), tambem commitada: sem
 * ela nao ha como regerar nada, e um favicon perdido significa refazer todos os
 * cortes a mao.
 */
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';

const SRC = 'assets/brand/logo-original.webp';
const OUT = 'assets';

// Fundo do proprio logotipo, medido nos quatro cantos do original.
const CREAM = { r: 0xf8, g: 0xf0, b: 0xe8 };
// Marrom escuro do letreiro "DRA CLAUDIA MACIEL". Usado so no favicon.ico —
// ver o comentario da secao 4.
const DARK = { r: 0x5b, g: 0x33, b: 0x22 };

// --- recorte do fundo -------------------------------------------------------
// O logotipo veio rasterizado sobre creme chapado. O monograma precisa de fundo
// transparente para entrar no rodape escuro (#241b1f) e no bloco de contato
// (vinho) — e mesmo no cabecalho, cujo creme e #fbf8f3 e nao #f8f0e8: um
// retangulo quase-igual-mas-nao-igual atras da marca e o tipo de detalhe que
// ninguem sabe nomear e todo mundo percebe.
//
// Modelo: P = C*a + fundo*(1-a). Nos pixels internos a=1 e P=C; so a borda
// antisserrilhada tem alfa fracionario. Entao o alfa sai da distancia de
// luminancia ate o fundo, e a cor real da tinta se recupera desfazendo a
// composicao. A zona morta engole o ruido do papel do original (medido em +-10
// de luminancia); sem ela a area vazia sairia com uma neblina de ~15% de
// opacidade, invisivel sobre creme e escancarada sobre o rodape.
const DEAD = 16; // ruido do fundo a ignorar, em luminancia
const RAMP = 26; // largura da rampa da borda

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: CH } = info;
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const bgL = lum(CREAM.r, CREAM.g, CREAM.b);

const rgba = Buffer.alloc(W * H * 4);
for (let i = 0, j = 0; i < data.length; i += CH, j += 4) {
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
  const a = Math.max(0, Math.min(1, (bgL - lum(r, g, b) - DEAD) / RAMP));
  if (a <= 0) continue; // permanece 0,0,0,0
  const un = (v, bgv) => Math.max(0, Math.min(255, Math.round((v - bgv * (1 - a)) / a)));
  rgba[j] = un(r, CREAM.r);
  rgba[j + 1] = un(g, CREAM.g);
  rgba[j + 2] = un(b, CREAM.b);
  rgba[j + 3] = Math.round(a * 255);
}
const cut = () => sharp(rgba, { raw: { width: W, height: H, channels: 4 } });

/** Caixa dos pixels com tinta, opcionalmente limitada a uma faixa de linhas. */
function box(yEnd = H - 1, minAlpha = 40) {
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y <= yEnd; y++) {
    for (let x = 0; x < W; x++) {
      if (rgba[(y * W + x) * 4 + 3] < minAlpha) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

// O monograma e o letreiro sao separados por uma faixa de ~30 linhas em branco;
// 1430 cai dentro dela. Aparar por linha e mais confiavel do que por coordenada
// fixa: se o logotipo for reexportado com outra margem, os numeros se ajustam.
const markBox = box(1430);
const fullBox = box();

/** Centraliza um recorte num quadrado transparente com `padRatio` de respiro. */
async function squared(buf, cropBox, padRatio) {
  const side = Math.round(Math.max(cropBox.width, cropBox.height) * (1 + padRatio * 2));
  const dx = Math.round((side - cropBox.width) / 2);
  const dy = Math.round((side - cropBox.height) / 2);
  return sharp(buf)
    .extend({
      top: dy,
      bottom: side - cropBox.height - dy,
      left: dx,
      right: side - cropBox.width - dx,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

const markRaw = await cut().extract(markBox).png().toBuffer();
const fullRaw = await cut().extract(fullBox).png().toBuffer();
const markSq = await squared(markRaw, markBox, 0.06);

// --- 1. monograma transparente (cabecalho, rodape, bloco de contato) --------
// 256px, e nao 512: o maior uso na pagina e o selo do bloco de contato, a 88px
// de lado. 256 cobre tela de 3x com folga e custa um terco do peso.
await sharp(markSq)
  .resize(256, 256, { kernel: 'lanczos3' })
  .webp({ quality: 92, alphaQuality: 100, effort: 6 })
  .toFile(`${OUT}/logo-mark.webp`);

// --- 2. logotipo completo, quadrado, sobre creme ----------------------------
// E o que vai no `logo` do JSON-LD. Fundo chapado de proposito: o Google exibe
// o logo da entidade sobre fundos que este site nao controla, e a versao
// transparente sumiria sobre claro.
const logoW = 1000;
const logoH = Math.round((fullBox.height / fullBox.width) * logoW);
await sharp({ create: { width: 1200, height: 1200, channels: 3, background: CREAM } })
  .composite([
    {
      input: await sharp(fullRaw).resize(logoW, logoH, { kernel: 'lanczos3' }).png().toBuffer(),
      left: Math.round((1200 - logoW) / 2),
      top: Math.round((1200 - logoH) / 2),
    },
  ])
  .webp({ quality: 90, effort: 6 })
  .toFile(`${OUT}/logo.webp`);

// --- 3. cartao de compartilhamento (og:image) -------------------------------
// 1200x630 e a proporcao que Facebook, LinkedIn e WhatsApp usam na previa
// grande; centralizado, o logotipo tambem sobrevive ao corte quadrado da previa
// pequena do WhatsApp.
//
// JPEG, e nao WebP como o resto do site: a previa de link do WhatsApp — o canal
// por onde este site vai ser compartilhado de verdade — nao renderiza WebP de
// forma confiavel. 4:4:4 sem subamostragem porque o letreiro tem serifa fina, e
// o borrao de croma do 4:2:0 aparece justamente nela.
const ogH = 470;
const ogW = Math.round((fullBox.width / fullBox.height) * ogH);
await sharp({ create: { width: 1200, height: 630, channels: 3, background: CREAM } })
  .composite([
    {
      input: await sharp(fullRaw).resize(ogW, ogH, { kernel: 'lanczos3' }).png().toBuffer(),
      left: Math.round((1200 - ogW) / 2),
      top: Math.round((630 - ogH) / 2),
    },
  ])
  .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
  .toFile(`${OUT}/og-image.jpg`);

// --- 4. icones --------------------------------------------------------------
// Sobre creme, nunca transparente: o iOS pinta de preto o fundo transparente do
// apple-touch-icon, e o Google so exibe o icone no resultado de busca mobile se
// o favicon for quadrado e opaco.
async function icon(size, padRatio, mark = markSq) {
  const inner = Math.round(size * (1 - padRatio * 2));
  return sharp({ create: { width: size, height: size, channels: 3, background: CREAM } })
    .composite([
      {
        input: await sharp(mark).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer(),
        left: Math.round((size - inner) / 2),
        top: Math.round((size - inner) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

await writeFile(`${OUT}/apple-touch-icon.png`, await icon(180, 0.1));
await writeFile(`${OUT}/icon-192.png`, await icon(192, 0.12));
await writeFile(`${OUT}/icon-512.png`, await icon(512, 0.12));

// Nos tamanhos do favicon o degrade bronze do monograma perde para o fundo: a
// 16px o desenho vira uma mancha clara que nao se distingue de aba vazia. Aqui
// — e SO aqui — a marca e achatada no marrom escuro do letreiro, que e uma cor
// do proprio logotipo. Testado contra as alternativas (bronze original, bronze
// engrossado, creme sobre vinho); esta foi a unica legivel a 16px sem inventar
// uma cor que nao existe na marca.
const markFlat = await (async () => {
  const { data: m, info: mi } = await sharp(markSq).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buf = Buffer.alloc(m.length);
  for (let i = 0; i < m.length; i += 4) {
    buf[i] = DARK.r;
    buf[i + 1] = DARK.g;
    buf[i + 2] = DARK.b;
    buf[i + 3] = m[i + 3]; // so a cor muda; o recorte continua o mesmo
  }
  return sharp(buf, { raw: { width: mi.width, height: mi.height, channels: 4 } }).png().toBuffer();
})();

// ICO com PNG embutido — aceito por todos os navegadores desde o IE9, e o unico
// jeito de ter 48px num .ico sem inflar o arquivo com bitmaps crus.
const icoPngs = [];
for (const [size, pad] of [[16, 0.02], [32, 0.04], [48, 0.06]]) {
  icoPngs.push({ size, buf: await icon(size, pad, markFlat) });
}
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reservado
header.writeUInt16LE(1, 2); // tipo 1 = icone
header.writeUInt16LE(icoPngs.length, 4);
let offset = 6 + icoPngs.length * 16;
const dir = [];
for (const { size, buf } of icoPngs) {
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0); // largura (0 significaria 256)
  e.writeUInt8(size, 1); // altura
  e.writeUInt8(0, 2); // cores da paleta (0 = sem paleta)
  e.writeUInt8(0, 3); // reservado
  e.writeUInt16LE(1, 4); // planos de cor
  e.writeUInt16LE(32, 6); // bits por pixel
  e.writeUInt32LE(buf.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += buf.length;
  dir.push(e);
}
await writeFile(`${OUT}/favicon.ico`, Buffer.concat([header, ...dir, ...icoPngs.map((p) => p.buf)]));

// --- resumo -----------------------------------------------------------------
const { stat } = await import('node:fs/promises');
console.log(`origem     ${SRC} (${W}x${H})`);
console.log(`monograma  ${markBox.width}x${markBox.height} em (${markBox.left},${markBox.top})`);
console.log(`completo   ${fullBox.width}x${fullBox.height} em (${fullBox.left},${fullBox.top})\n`);
for (const f of ['logo-mark.webp', 'logo.webp', 'og-image.jpg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'favicon.ico']) {
  const { size } = await stat(`${OUT}/${f}`);
  const m = f.endsWith('.ico') ? null : await sharp(`${OUT}/${f}`).metadata();
  console.log(`  ${f.padEnd(22)} ${(m ? `${m.width}x${m.height}` : '16/32/48').padEnd(11)} ${(size / 1024).toFixed(1)} KB`);
}
