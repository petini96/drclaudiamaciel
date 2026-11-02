/**
 * Troca rapidamente uma foto do site por uma das imagens da pasta assets/doutora/
 *
 * Exemplos de uso:
 *   node scripts/trocar-foto.mjs 14           -> troca o hero da home pela img0014
 *   node scripts/trocar-foto.mjs 22 sobre     -> troca a foto do sobre pela img0022
 *   node scripts/trocar-foto.mjs 5 bonito     -> troca a foto de Bonito pela img0005
 *   node scripts/trocar-foto.mjs 31 ponta     -> troca a foto de Ponta Porã pela img0031
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const TARGET_MAP = {
  hero: 'claudia-hero',
  home: 'claudia-hero',
  sobre: 'claudia-retrato',
  retrato: 'claudia-retrato',
  bonito: 'claudia-rosa',
  rosa: 'claudia-rosa',
  ponta: 'claudia-verde',
  'ponta-pora': 'claudia-verde',
  verde: 'claudia-verde',
  consultorio: 'consultorio',
};

async function getSharp() {
  // 1. Tenta import direto
  try {
    const s = await import('sharp');
    return s.default || s;
  } catch {}

  // 2. Tenta no cache do npm/npx
  try {
    const npxDir = join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
    const dirs = await readdir(npxDir);
    for (const d of dirs) {
      try {
        const p = join(npxDir, d, 'node_modules');
        const req = createRequire(join(p, 'dummy.js'));
        return req('sharp');
      } catch {}
    }
  } catch {}

  throw new Error('Sharp não encontrado. Execute: npm i -D sharp (ou npx --package=sharp)');
}

function parseImgNumber(arg) {
  if (!arg) return null;
  const digits = arg.toString().replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(4, '0');
}

async function main() {
  const [argImg, argTarget = 'hero'] = process.argv.slice(2);

  if (!argImg) {
    console.log(`
Uso:
  npm run foto <numero> [alvo]

Alvos disponíveis:
  hero       (padrão - foto principal da Home)
  sobre      (foto da seção Sobre a Dra. Claudia)
  bonito     (foto da página do consultório de Bonito)
  ponta      (foto da página de Ponta Porã)
  consultorio(foto da recepção / consultório)

Exemplos:
  npm run foto 14
  npm run foto 25 sobre
  npm run foto 8 bonito
`);
    process.exit(1);
  }

  const num = parseImgNumber(argImg);
  if (!num) {
    console.error(`Número de imagem inválido: "${argImg}"`);
    process.exit(1);
  }

  const targetKey = argTarget.toLowerCase();
  const targetBaseName = TARGET_MAP[targetKey] || targetKey;

  const srcPath = `assets/doutora/img${num}.jpeg`;
  const destPath = `assets/${targetBaseName}.webp`;

  try {
    await stat(srcPath);
  } catch {
    console.error(`Arquivo não encontrado: ${srcPath}`);
    process.exit(1);
  }

  console.log(`Convertendo ${srcPath} -> ${destPath}...`);
  const sharp = await getSharp();
  const info = await sharp(srcPath)
    .webp({ quality: 85, effort: 6 })
    .toFile(destPath);

  console.log(`Foto atualizada com sucesso (${info.width}x${info.height}, ${(info.size / 1024).toFixed(1)} KB)`);

  // Executa o build
  console.log('Rodando build.mjs...');
  const child = spawn(process.execPath, ['build.mjs'], { stdio: 'inherit' });
  child.on('close', (code) => {
    if (code === 0) {
      console.log(`\nConcluído! Se o "npm run dev" estiver rodando, basta dar F5 no navegador.`);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
