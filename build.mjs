import { mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const siteUrl = (process.env.SITE_URL || 'https://drclaudiamaciel.com.br').replace(/\/+$/, '');
const imageNames = ['claudia-hero', 'claudia-retrato', 'claudia-rosa', 'consultorio', 'claudia-verde'];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

const html = await readFile('site.html', 'utf8');
const css = `${await readFile('src/styles.css', 'utf8')}\n${await readFile('src/photos.css', 'utf8')}`;

let page = html.replace('/*__STYLES__*/', css);
for (const name of imageNames) {
  const bytes = await readFile(`assets/${name}.webp`);
  const token = `__${name.toUpperCase().replaceAll('-', '_')}__`;
  page = page.replaceAll(token, `data:image/webp;base64,${bytes.toString('base64')}`);
}

const leftovers = page.match(/__[A-Z_]+__|\/\*__STYLES__\*\//g);
if (leftovers) throw new Error(`Placeholders nao substituidos: ${[...new Set(leftovers)].join(', ')}`);

await writeFile('dist/index.html', page);
// Pre-comprime para o nginx servir via gzip_static (o HTML carrega as imagens em base64).
await writeFile('dist/index.html.gz', gzipSync(Buffer.from(page), { level: 9 }));

const lastmod = (await stat('site.html')).mtime.toISOString().slice(0, 10);
await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
await writeFile(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>\n</urlset>\n`,
);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`dist/index.html    ${kb(Buffer.byteLength(page))}`);
console.log(`dist/index.html.gz ${kb((await stat('dist/index.html.gz')).size)}`);
console.log(`site url           ${siteUrl}`);
