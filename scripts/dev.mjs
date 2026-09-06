// Servidor de desenvolvimento, sem dependencias.
//
// Existe porque abrir dist/index.html direto no navegador (file://) nao cobre
// tudo: favicon e manifest usam caminho absoluto ("/favicon.svg"), e o 404 nao
// acontece. Aqui o comportamento espelha o deploy/nginx.conf — so "/" devolve o
// index, qualquer outra rota cai em 404 de verdade.
//
// Uso: npm run dev   (PORT=3000 npm run dev para trocar a porta)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';

const PORT = Number(process.env.PORT || 8091);
const ROOT = resolve('dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

// SITE_ENV=dev por padrao: o build local nunca gera um HTML indexavel. Para
// conferir exatamente o que vai para producao: SITE_ENV=prod npm run dev.
const env = { ...process.env, SITE_ENV: process.env.SITE_ENV || 'dev' };

function build() {
  return new Promise((done) => {
    spawn(process.execPath, ['build.mjs'], { stdio: 'inherit', env }).on('close', (code) => {
      if (code !== 0) console.error('\n  build falhou — corrija o erro acima e salve de novo.\n');
      done(code);
    });
  });
}

await build();

createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);

  // Espelha o deploy/nginx.conf: tudo que nao for o dominio de producao
  // responde com noindex. Aqui e so paridade — ninguem rastreia 127.0.0.1.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok\n');
    return;
  }

  // resolve + prefixo garantem que "/../.." nao escape de dist/.
  const file = resolve(join(ROOT, normalize(path === '/' ? '/index.html' : path)));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403).end();
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    // Mesmo comportamento do nginx: 404 real, nao o index com status 200.
    const notFound = await readFile(join(ROOT, '404.html')).catch(() => '404');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(notFound);
    console.log(`  404  ${path}`);
  }
}).listen(PORT, () => {
  console.log(`\n  http://127.0.0.1:${PORT}\n  observando site.html, src/ e assets/ — Ctrl+C para sair\n`);
});

// Rebuild ao salvar. O debounce agrupa a rajada de eventos que um editor gera
// por gravacao (arquivo temporario + rename costuma disparar 2 ou 3). O par
// building/pending garante que uma alteracao feita DURANTE um build ainda gere
// um rebuild depois — sem ele, essa gravacao seria descartada em silencio.
let timer;
let building = false;
let pending = false;

async function runBuild() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  console.log('\n  mudanca detectada, rebuildando...');
  await build();
  building = false;
  if (pending) {
    pending = false;
    runBuild();
  }
}

const rebuild = () => {
  clearTimeout(timer);
  timer = setTimeout(runBuild, 250);
};

for (const target of ['site.html', 'src', 'assets']) {
  try {
    watch(target, { recursive: true }, rebuild);
  } catch {
    watch(target, rebuild); // fallback: plataformas sem watch recursivo
  }
}
