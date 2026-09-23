import { mkdir, readFile, writeFile, stat, rm, copyFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { site } from './src/site-data.js';

const siteUrl = (process.env.SITE_URL || site.url).replace(/\/+$/, '');
site.url = siteUrl;

// --- ambiente ---------------------------------------------------------------
// prod = drclaudiamaciel.com.br, indexavel pelo Google.
// hom  = hom.drclaudiamaciel.com.br, bloqueado para buscadores (ver README).
// dev  = npm run dev; o scripts/dev.mjs define este valor sozinho.
const ENVS = ['prod', 'hom', 'dev'];
const siteEnv = (process.env.SITE_ENV || 'prod').trim();
if (!ENVS.includes(siteEnv)) throw new Error(`SITE_ENV invalido: "${siteEnv}" (use ${ENVS.join(' | ')})`);
const isProd = siteEnv === 'prod';

// Trava de seguranca. "Build indexavel apontando para a URL de homologacao" e
// exatamente o acidente que faz o Google indexar hom.* como duplicata do site
// real — e desindexar depois custa semanas. Falhar o build aqui e mais barato.
if (isProd && /^https?:\/\/hom\./i.test(siteUrl)) {
  throw new Error(`SITE_ENV=prod com SITE_URL de homologacao (${siteUrl}). Use SITE_ENV=hom.`);
}
if (siteEnv === 'hom' && !/^https?:\/\/hom\./i.test(siteUrl)) {
  console.warn(`AVISO: SITE_ENV=hom com SITE_URL "${siteUrl}" — esperado um host comecando com "hom.".`);
}

// Vazio = nenhum Google Analytics na pagina. Producao e homologacao usam
// propriedades diferentes do GA4, entao o ID nunca fica no codigo.
const gaId = (process.env.GA_MEASUREMENT_ID || '').trim();
if (gaId && !/^G-[A-Z0-9]{4,}$/.test(gaId)) {
  throw new Error(`GA_MEASUREMENT_ID invalido: "${gaId}" (formato esperado: G-XXXXXXXXXX)`);
}

const imageNames = ['claudia-hero', 'claudia-retrato', 'claudia-rosa', 'consultorio', 'claudia-verde'];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Le largura/altura direto do header WebP: evita CLS sem depender de libs. */
function webpSize(buf) {
  const fmt = buf.toString('ascii', 12, 16);
  if (fmt === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (fmt === 'VP8L') {
    const [b0, b1, b2, b3] = [buf[21], buf[22], buf[23], buf[24]];
    return { w: (((b1 & 0x3f) << 8) | b0) + 1, h: (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) + 1 };
  }
  throw new Error(`Formato WebP nao reconhecido: ${fmt}`);
}

/** Idem para o JPEG do cartao de compartilhamento: le o primeiro SOF. */
function jpegSize(buf) {
  let i = 2; // pula o SOI
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) throw new Error('JPEG malformado: marcador esperado');
    const marker = buf[i + 1];
    // SOF0..SOF15 carregam as dimensoes; C4 (Huffman), C8 (extensao) e CC (aritmetico)
    // caem na mesma faixa numerica mas nao sao "start of frame".
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('JPEG sem SOF');
}

// IMPORTANTE: nada e escrito em dist/ ate a validacao de placeholders passar
// (mais abaixo). Se o `rm` viesse antes, um build quebrado apagaria o site e
// deixaria dist/ vazio — o que, com o servidor de dev rodando, derruba a
// pagina inteira ate o erro ser corrigido.

// --- imagens como arquivos reais -------------------------------------------
// Ficam fora do HTML (em vez de base64) por tres motivos de SEO: o Google
// Images so indexa URLs reais, og:image/Twitter exigem URL absoluta, e o HTML
// cai de ~240 KB para ~40 KB, o que adianta o First Contentful Paint.
// `path` sai ABSOLUTO (/assets/...), e nao relativo. Com a home sozinha o
// relativo funcionava e ainda permitia abrir o dist/index.html direto no
// navegador; com /bonito e /ponta-pora, um `assets/foto.webp` relativo viraria
// `/bonito/assets/foto.webp` e daria 404 em todas as fotos das paginas de
// cidade — inclusive na do preload, que e a LCP.
const images = {};
for (const name of imageNames) {
  const bytes = await readFile(`assets/${name}.webp`);
  const { w, h } = webpSize(bytes);
  images[name] = { path: `/assets/${name}.webp`, url: `${siteUrl}/assets/${name}.webp`, w, h };
}

// --- ativos de marca --------------------------------------------------------
// Ficam fora de `imageNames` porque nao sao fotografia: nao entram no sitemap
// de imagens (o Google Images nao tem o que fazer com um logotipo) e cada um
// tem um formato escolhido pelo destino, nao pelo peso. Quem os gera, a partir
// de assets/brand/logo-original.webp, e o scripts/gen-brand.mjs — e la que
// estao as razoes de cada corte.
//
//   logo-mark  monograma recortado, fundo transparente. Cabecalho, rodape e o
//              selo do bloco de contato.
//   logo       logotipo completo sobre creme. Vai no `logo` do JSON-LD.
//   og-image   cartao 1200x630 da previa de link. JPEG de proposito: a previa
//              do WhatsApp nao renderiza WebP de forma confiavel, e o WhatsApp
//              e por onde este site vai ser compartilhado de verdade.
const brand = {};
for (const file of ['logo-mark.webp', 'logo.webp', 'og-image.jpg']) {
  const bytes = await readFile(`assets/${file}`);
  const { w, h } = file.endsWith('.jpg') ? jpegSize(bytes) : webpSize(bytes);
  brand[file.replace(/\.\w+$/, '')] = { path: `assets/${file}`, url: `${siteUrl}/assets/${file}`, w, h };
}

// Icones que vao para a RAIZ de dist/, e nao para /assets: o navegador pede
// /favicon.ico e o iOS pede /apple-touch-icon.png por conta propria, sem nem
// olhar o HTML. Um caminho com hash ou dentro de /assets quebraria isso.
const iconFiles = ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];

const og = brand['og-image'];

// --- blocos de conteudo gerados a partir do site-data ----------------------
const serviceCards = site.services
  .map(
    (s, i) =>
      `<article class="card" data-reveal><span class="num">${String(i + 1).padStart(2, '0')}</span>` +
      `<div class="icon" aria-hidden="true">${s.icon}</div>` +
      `<h3>${esc(s.name)}</h3><p>${esc(s.description)}</p>` +
      `<a href="#contato">Agendar consulta <span aria-hidden="true">&rarr;</span></a></article>`,
  )
  .join('');

const faqList = site.faq
  .map(
    (f, i) =>
      `<details class="faqItem"${i === 0 ? ' open' : ''}><summary><span>${esc(f.q)}</span>` +
      `<b aria-hidden="true"></b></summary><p>${esc(f.a)}</p></details>`,
  )
  .join('');

// --- consultorios -----------------------------------------------------------
const { phone } = site.practice;
const hero = images[site.seo.heroImage];

// Horario legivel, derivado do MESMO array que alimenta o
// openingHoursSpecification — o Google compara os dois e penaliza divergencia.
const DAY_PT = { Monday: 'segunda', Tuesday: 'terça', Wednesday: 'quarta', Thursday: 'quinta', Friday: 'sexta', Saturday: 'sábado', Sunday: 'domingo' };
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const hhmm = (t) => (t.endsWith(':00') ? `${Number(t.slice(0, 2))}h` : `${Number(t.slice(0, 2))}h${t.slice(3)}`);

function humanHours(spec) {
  if (!spec.length) return '';
  const groups = new Map();
  for (const h of spec) {
    const key = h.days.join(',');
    if (!groups.has(key)) groups.set(key, { days: h.days, ranges: [] });
    groups.get(key).ranges.push(`${hhmm(h.opens)}–${hhmm(h.closes)}`);
  }
  return [...groups.values()]
    .map(({ days, ranges }) => {
      const label =
        days.length === 5 && WEEKDAYS.every((d) => days.includes(d))
          ? 'Segunda a sexta'
          : days.map((d) => DAY_PT[d]).join(', ').replace(/^./, (c) => c.toUpperCase());
      return `${label}, ${ranges.join(' e ')}`;
    })
    .join('; ');
}

/**
 * Enriquece cada consultorio do site-data com o que o build precisa repetir em
 * varios lugares: URL da pagina, endereco por extenso, horario legivel e os
 * quatro destinos de mapa.
 *
 * Tudo derivado, nada escrito a mao: endereco e horario aparecem no texto da
 * pagina, no cartao do mapa, no rodape, no FAQ e no JSON-LD. Copiar qualquer um
 * deles a mao e o caminho mais curto para o NAP divergir entre o site e o
 * Google Business Profile — que e justamente o par que o Google compara em
 * busca local.
 */
const locations = site.locations.map((loc) => {
  const a = loc.address;
  const full = `${a.street} — ${a.district}, ${a.city}-${a.stateCode}`;
  // O endereco como TEXTO DE BUSCA alimenta os quatro destinos de mapa. Sai
  // daqui de proposito: e o endereco, e nao a coordenada, que o Google
  // geocodifica com precisao — `geo` ainda esta marcado [CONFERIR] nos dois
  // consultorios, e um mapa com o pino no lugar errado e pior do que mapa
  // nenhum numa pagina de consultorio.
  const query = `${a.street}, ${a.district}, ${a.city}, ${a.stateCode}`;
  const q = encodeURIComponent(query);
  return {
    ...loc,
    path: `/${loc.slug}`,
    url: `${siteUrl}/${loc.slug}`,
    id: `${siteUrl}/#${loc.slug}`,
    fullAddress: full,
    shortAddress: `${a.street}, ${a.district} — ${a.city}-${a.stateCode}`,
    hoursText: humanHours(loc.openingHours),
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${q}`,
    mapDirections: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    wazeUrl: `https://waze.com/ul?q=${q}&navigate=yes`,
    // `output=embed` e a forma de embutir o Google Maps sem chave de API. O
    // iframe NAO vai no HTML entregue: ele so e criado quando a visitante clica
    // no mapa (ver a secao do mapa em location.html). Motivo: um iframe do
    // Google no HTML inicial faria uma requisicao a terceiro — com cookies —
    // antes de qualquer consentimento, o que contradiz o modelo do resto do
    // site (ver o bloco do Consent Mode mais abaixo) e a propria politica de
    // privacidade. De quebra, evita ~700 KB de JS de terceiro concorrendo com o
    // carregamento da pagina.
    mapEmbed: `https://www.google.com/maps?q=${q}&z=17&hl=pt-BR&output=embed`,
  };
});

if (!locations.length) throw new Error('src/site-data.js: `locations` esta vazio — o site precisa de pelo menos um consultorio.');
const slugs = locations.map((l) => l.slug);
if (new Set(slugs).size !== slugs.length) throw new Error(`src/site-data.js: slug repetido em \`locations\` (${slugs.join(', ')}).`);
// O slug vira rota. Se colidir com uma rota que o build ja gera, a pagina da
// cidade sobrescreveria a outra em dist/ — em silencio.
const reserved = ['privacidade', 'assets', 'index', '404'];
for (const l of locations) {
  if (reserved.includes(l.slug)) throw new Error(`src/site-data.js: slug "${l.slug}" colide com uma rota reservada (${reserved.join(', ')}).`);
  if (!/^[a-z0-9-]+$/.test(l.slug)) throw new Error(`src/site-data.js: slug "${l.slug}" invalido (use so minusculas, numeros e hifen).`);
}

// O nginx precisa de um `location =` por rota (o porque esta no proprio
// nginx.conf). Acrescentar um consultorio no site-data e esquecer a linha la
// nao quebra nada de forma visivel: a URL passa a responder 301 para /<slug>/,
// enquanto o canonical e o sitemap continuam apontando para a versao sem barra.
// O Google entao rastreia uma URL e encontra outra — o tipo de erro que so
// aparece semanas depois, no Search Console. Falhar aqui e barato.
const nginxConf = await readFile('deploy/nginx.conf', 'utf8');
for (const l of locations) {
  if (!new RegExp(`location\\s*=\\s*${l.path}\\s*\\{`).test(nginxConf)) {
    throw new Error(
      `deploy/nginx.conf: falta o bloco da rota ${l.path}. Acrescente, junto dos outros:\n` +
        `    location = ${l.path} {\n        try_files ${l.path}/index.html =404;\n    }`,
    );
  }
}

// Lista das cidades por extenso, para os textos que falam dos dois consultorios
// sem precisar saber quantos sao: "Bonito e Ponta Porã", "A, B e C".
const cityList = (items) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
const citiesText = cityList(locations.map((l) => l.city));
const citiesLabel = cityList(locations.map((l) => l.label));

// --- interpolacao de texto --------------------------------------------------
// Marcadores usados no site-data.js ({crm}, {endereco}...). Existem para que
// nenhum texto editorial repita um dado de negocio a mao — mesmo motivo do
// bloco acima.
//
// `{endereco}`, `{cidade}` e `{horario}` dependem de QUAL consultorio: numa
// pagina de cidade eles valem os dados daquela unidade. Por isso `fillText`
// recebe o consultorio como contexto; sem ele, os marcadores de unidade nao
// existem e um texto que os use falha na validacao de placeholders no fim do
// build, em vez de sair pela metade na pagina.
const baseVars = {
  '{telefone}': esc(phone.display),
  '{site}': esc(siteUrl.replace(/^https?:\/\//, '')),
  '{crm}': esc(site.doctor.crm),
  '{rqe}': esc(site.doctor.rqe),
  '{cidades}': esc(citiesText),
  '{enderecos}': esc(locations.map((l) => l.shortAddress).join('; ')),
};

/** Escapa o texto e resolve os marcadores. `loc` liga os marcadores de unidade. */
const fillText = (s, loc) => {
  const vars = loc
    ? {
        ...baseVars,
        '{endereco}': esc(loc.fullAddress),
        '{cidade}': esc(loc.label),
        // Sem horario confirmado o texto continua verdadeiro em vez de sair
        // vazio — ver o comentario de `openingHours` no site-data. Minusculo
        // porque o marcador entra no meio da frase ("o atendimento e sexta...").
        '{horario}': esc((loc.hoursText || 'confirmado pelo WhatsApp').toLowerCase()),
      }
    : baseVars;
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(k).join(v), esc(s));
};

// --- manchete "escrita" -----------------------------------------------------
/**
 * Envolve cada palavra de <span class="typed"> num <span> proprio, para o CSS
 * poder revelar uma por vez (src/motion.css, secao "manchete escrita").
 *
 * Por que no build e nao a mao no site.html: quem for reescrever a manchete
 * depois nao deveria ter que contar palavras nem numerar spans.
 *
 * Por que nao em JS no navegador: escrever o H1 letra por letra com script
 * deixaria a manchete — o elemento mais importante da pagina para o Google —
 * dependente de JS para existir. Aqui o texto completo esta no HTML entregue; o
 * CSS so controla QUANDO cada palavra fica visivel, e apenas quando a classe
 * `motion` autoriza (ver motionHead).
 *
 * Os tempos saem como custom properties inline (--t = quando a palavra aparece,
 * --c = quanto o cursor fica parado nela) de proposito: e o que faz o ritmo
 * acompanhar qualquer manchete. Uma regra :nth-child por palavra quebraria
 * calada no dia em que o texto mudasse de tamanho.
 */
// O RITMO e o que separa "escrita" de "maquina de escrever". A primeira versao
// revelava uma palavra a cada 68 ms fixos, e ficava mecanica: gente nao escreve
// em cadencia constante. Estes numeros modelam o que uma pessoa faz — palavra
// longa demora mais, e depois de virgula ou ponto ela hesita.
const CHAR_MS = 28; // tempo de tracar cada letra
const WORD_MS = 60; // o espaco entre duas palavras
const PAUSE = { ',': 220, ';': 220, ':': 220, '.': 300, '!': 300, '?': 300, '—': 260 };
const LEAD_MS = 140; // respiro antes da primeira palavra (a pessoa pega a caneta)

/**
 * Desvio de +-14% no tempo de cada palavra, para dois intervalos nunca saírem
 * exatamente iguais — sem isso o tempo fica proporcional ao tamanho da palavra,
 * o que ainda soa calculado.
 *
 * Deterministico por exigencia, nao por capricho: e derivado das letras da
 * propria palavra, entao o mesmo site.html sempre gera os mesmos bytes. Um
 * Math.random() aqui faria cada build produzir um dist/ diferente (e um .gz
 * diferente), o que estraga qualquer comparacao de deploy.
 */
function jitter(word) {
  let h = 7;
  for (const ch of word) h = (h * 31 + ch.codePointAt(0)) % 9973;
  return 0.86 + (h % 29) / 100;
}

// Preenchido por typeWords, usado no resumo no fim do build: e o numero que
// precisa ficar de olho no orcamento de LCP se a foto um dia sair do hero
// (ver docs/SEO.md, §7.2).
let typedTotalMs = 0;

function typeWords(tpl) {
  // Ancorado em </span></h1>: o trecho e o ultimo filho do H1, entao isto casa
  // exatamente o bloco certo mesmo que um dia haja outro <span> dentro dele.
  const re = /<span class="typed">([\s\S]*?)<\/span><\/h1>/;
  const found = tpl.match(re);
  if (!found) throw new Error('site.html: <span class="typed"> nao encontrado no fim do <h1>');

  // Separa tags de texto, para o "<em>" nao ser envolvido como se fosse palavra.
  const parts = found[1].split(/(<[^>]+>)/);
  const isTag = (p) => p.startsWith('<');

  // 1a passada: quanto cada palavra custa para ser escrita (escrita + hesitacao).
  const words = parts.flatMap((p) => (isTag(p) ? [] : p.match(/\S+/g) || []));
  const cost = words.map((w) => {
    const chars = [...w];
    return Math.round((WORD_MS + chars.length * CHAR_MS) * jitter(w)) + (PAUSE[chars.at(-1)] || 0);
  });

  // 2a passada: cada palavra aparece quando as anteriores terminaram, e o cursor
  // fica parado nela pelo tempo que a proxima leva para ser escrita — e por isso
  // que ele hesita depois da virgula, sem nenhuma regra especial para virgula.
  let i = 0;
  const out = parts
    .map((part) =>
      isTag(part)
        ? part
        : part.replace(/\S+/g, (w) => {
            const start = LEAD_MS + cost.slice(0, i).reduce((a, b) => a + b, 0);
            // Na ultima palavra o cursor fica piscando para sempre, como o de um
            // texto ainda aberto — entao ela nao leva --c (nao ha janela para
            // fechar): `data-last` troca a animacao no CSS.
            const last = i === words.length - 1;
            i++;
            return last
              ? `<span style="--t:${start}ms" data-last>${w}</span>`
              : `<span style="--t:${start}ms;--c:${cost[i - 1]}ms">${w}</span>`;
          }),
    )
    .join('');

  // O instante em que a ultima palavra COMECA a aparecer. O fade dela (0,22s,
  // em motion.css) vem depois; o numero de orcamento e este, e ele fica no
  // resumo do build de proposito — ver docs/SEO.md, §7.2.
  typedTotalMs = LEAD_MS + cost.slice(0, -1).reduce((a, b) => a + b, 0);
  return tpl.replace(re, () => `<span class="typed">${out}</span></h1>`);
}

// --- cartoes de formacao e atuacao ------------------------------------------
const credentialCards = site.credentials
  .map(
    (cr) =>
      `<li data-reveal><span class="credIcon" aria-hidden="true">${cr.icon}</span>` +
      `<span class="credLabel">${esc(cr.label)}</span>` +
      `<strong>${fillText(cr.value)}</strong><p>${fillText(cr.text)}</p></li>`,
  )
  .join('');

// --- depoimentos ------------------------------------------------------------
// TRAVA DE SEGURANCA, no mesmo espirito da que impede um build indexavel com a
// URL de homologacao (topo do arquivo). Depoimento ficticio no site de uma
// medica e publicidade enganosa (CDC, art. 37) e risco etico perante o CRM;
// o custo de descobrir isso DEPOIS de publicar nao se compara ao de um build
// que falha aqui. O contexto completo esta em site-data.js -> testimonials.
const tst = site.testimonials;
if (isProd && tst.enabled && tst.placeholder) {
  throw new Error(
    'SITE_ENV=prod com depoimentos marcados como placeholder (ficticios).\n' +
      '  Resolva de uma destas formas em src/site-data.js -> testimonials:\n' +
      '  1) troque os itens por depoimentos reais, autorizados por escrito, e ponha placeholder: false;\n' +
      '  2) desligue a secao com enabled: false ate ter os textos reais.\n' +
      '  Leia o comentario da chave antes: ha restricao do CFM ao uso de depoimento em publicidade medica.',
  );
}

// Sem estrela e sem nota, de proposito: nota media no proprio site e review de
// LocalBusiness auto-declarado, contra as diretrizes do Google (README > SEO).
// Nada daqui entra no JSON-LD pelo mesmo motivo.
const testimonialCards = tst.items
  .map(
    (t) =>
      `<li data-reveal><figure><blockquote><p>${esc(t.text)}</p></blockquote>` +
      `<figcaption><b>${esc(t.name)}</b><span>${esc(t.meta)}</span></figcaption></figure></li>`,
  )
  .join('');

const doctorIds = [];
if (site.doctor.crm) doctorIds.push({ '@type': 'PropertyValue', name: 'CRM', value: site.doctor.crm });
if (site.doctor.rqe) doctorIds.push({ '@type': 'PropertyValue', name: 'RQE', value: site.doctor.rqe });

// `identifier` (acima) diz ao Google QUAL e o numero; `hasCredential` diz o que
// ele significa e QUEM o reconhece. Num site de saude (YMYL) e esse segundo
// sinal que sustenta a autoridade da entidade — e o que a secao #formacao
// mostra na tela, para o dado estruturado e o visivel nunca divergirem.
const doctorCredentials = [];
if (site.doctor.crm) {
  doctorCredentials.push({
    '@type': 'EducationalOccupationalCredential',
    name: site.doctor.crm,
    credentialCategory: 'Registro profissional',
    recognizedBy: {
      '@type': 'GovernmentOrganization',
      name: `Conselho Regional de Medicina do estado de ${locations[0].address.state} (CRM-${locations[0].address.stateCode})`,
    },
  });
}
if (site.doctor.rqe) {
  doctorCredentials.push({
    '@type': 'EducationalOccupationalCredential',
    name: `${site.doctor.rqe} — Ginecologia e Obstetrícia`,
    credentialCategory: 'Título de especialista',
    recognizedBy: { '@type': 'GovernmentOrganization', name: 'Conselho Federal de Medicina (CFM)' },
  });
}

/** PostalAddress de um consultorio. `postalCode` vazio e omitido, nao vazio. */
const postalAddress = (a) => ({
  '@type': 'PostalAddress',
  streetAddress: a.street,
  addressLocality: a.city,
  addressRegion: a.stateCode,
  ...(a.postalCode ? { postalCode: a.postalCode } : {}),
  addressCountry: a.country,
});

const whatsappUrl = `https://wa.me/${phone.e164.replace('+', '')}`;

// --- nos do grafo -----------------------------------------------------------
// Sao funcoes, e nao constantes, porque o MESMO no precisa aparecer em varias
// paginas: a home declara os dois consultorios, e cada pagina de cidade declara
// o seu. Repetir o no em cada pagina e o correto — o Google le uma pagina por
// vez, e um `@id` apontando para um no que so existe em outra URL nao resolve.

/** A clinica no nivel da marca: sem endereco, porque ela tem dois. */
const practiceNode = () => ({
  '@type': ['MedicalOrganization', 'Organization'],
  '@id': `${siteUrl}/#practice`,
  name: site.practice.name,
  alternateName: [site.practice.shortName, site.doctor.legalName],
  url: `${siteUrl}/`,
  description: site.seo.description,
  // `image` e a foto da medica (o que ilustra a entidade); `logo` e o logotipo.
  // Sao campos diferentes de proposito: o Google usa o `logo` para representar
  // a marca no Knowledge Panel, e uma fotografia ali sai cortada e sem leitura.
  logo: brand.logo.url,
  image: { '@id': `${siteUrl}/#primaryimage` },
  telephone: phone.e164,
  medicalSpecialty: ['Obstetric', 'Gynecologic'],
  knowsLanguage: site.locale,
  sameAs: site.doctor.profiles,
  // E o que diz ao Google que as duas unidades sao a MESMA clinica, e nao dois
  // negocios homonimos disputando a mesma marca.
  department: locations.map((l) => ({ '@id': l.id })),
  employee: { '@id': `${siteUrl}/#physician` },
});

/**
 * Um consultorio. `Physician` + `MedicalClinic` + `LocalBusiness` e a mesma
 * combinacao que a versao de uma cidade so usava: `Physician` descreve o tipo
 * de servico, `LocalBusiness` e o que habilita os resultados de mapa.
 */
const locationNode = (loc) => ({
  '@type': ['Physician', 'MedicalClinic', 'LocalBusiness'],
  '@id': loc.id,
  name: `${site.practice.name} — ${loc.city}`,
  alternateName: `${site.practice.shortName} em ${loc.label}`,
  url: loc.url,
  description: fillText(loc.page.description, loc),
  branchOf: { '@id': `${siteUrl}/#practice` },
  parentOrganization: { '@id': `${siteUrl}/#practice` },
  logo: brand.logo.url,
  image: { '@id': `${siteUrl}/#primaryimage` },
  telephone: phone.e164,
  address: postalAddress(loc.address),
  ...(loc.geo ? { geo: { '@type': 'GeoCoordinates', latitude: loc.geo.lat, longitude: loc.geo.lng } } : {}),
  hasMap: loc.mapUrl,
  medicalSpecialty: ['Obstetric', 'Gynecologic'],
  knowsLanguage: site.locale,
  areaServed: loc.areaServed.map((c) => ({
    '@type': 'City',
    name: c,
    address: { '@type': 'PostalAddress', addressRegion: loc.address.stateCode, addressCountry: loc.address.country },
  })),
  availableService: site.services.map((s) => ({
    '@type': 'MedicalProcedure',
    name: s.name,
    description: s.description,
  })),
  // Sem horario confirmado o campo SOME, em vez de sair vazio ou inventado:
  // horario divergente do Google Business Profile prejudica a unidade na busca
  // local mais do que a ausencia dele (ver `openingHours` no site-data).
  ...(loc.openingHours.length
    ? {
        openingHoursSpecification: loc.openingHours.map((h) => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: h.days,
          opens: h.opens,
          closes: h.closes,
        })),
      }
    : {}),
  employee: { '@id': `${siteUrl}/#physician` },
  potentialAction: {
    '@type': 'ReserveAction',
    name: `Agendar consulta em ${loc.city}`,
    target: {
      '@type': 'EntryPoint',
      urlTemplate: whatsappUrl,
      inLanguage: site.locale,
      actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'],
    },
  },
});

const physicianNode = () => ({
  '@type': 'Person',
  '@id': `${siteUrl}/#physician`,
  name: site.doctor.fullName,
  // O nome de registro aparece nos diretorios medicos; declara-lo aqui liga
  // este site aos perfis do Doctoralia/agenda.app.br na mesma entidade.
  alternateName: site.doctor.legalName,
  givenName: site.doctor.name.split(' ')[0],
  honorificPrefix: site.doctor.honorificPrefix,
  jobTitle: site.doctor.jobTitle,
  url: `${siteUrl}/#sobre`,
  image: images['claudia-retrato'].url,
  worksFor: { '@id': `${siteUrl}/#practice` },
  // As DUAS unidades. E o que sustenta "a mesma medica atende nas duas
  // cidades" no grafo, em vez de deixar o Google deduzir.
  workLocation: locations.map((l) => ({ '@id': l.id })),
  telephone: phone.e164,
  sameAs: site.doctor.profiles,
  knowsAbout: site.services.map((s) => s.name),
  ...(doctorIds.length ? { identifier: doctorIds } : {}),
  ...(doctorCredentials.length ? { hasCredential: doctorCredentials } : {}),
});

const websiteNode = () => ({
  '@type': 'WebSite',
  '@id': `${siteUrl}/#website`,
  url: `${siteUrl}/`,
  name: site.practice.name,
  inLanguage: site.locale,
  publisher: { '@id': `${siteUrl}/#practice` },
});

const primaryImageNode = () => ({
  '@type': 'ImageObject',
  '@id': `${siteUrl}/#primaryimage`,
  url: hero.url,
  contentUrl: hero.url,
  width: hero.w,
  height: hero.h,
  caption: `${site.doctor.fullName}, ${site.doctor.jobTitle.toLowerCase()} em ${citiesLabel}`,
});

/** FAQPage de uma pagina. Cada URL tem as SUAS perguntas — repetir as mesmas em
 *  paginas diferentes e conteudo duplicado, e o Google escolhe uma so. */
const faqNode = (pageId, items) => ({
  '@type': 'FAQPage',
  '@id': `${pageId}#faq`,
  inLanguage: site.locale,
  isPartOf: { '@id': `${pageId}#webpage` },
  mainEntity: items.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
});

const breadcrumbNode = (pageId, trail) => ({
  '@type': 'BreadcrumbList',
  '@id': `${pageId}#breadcrumb`,
  itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: t.url })),
});

// --- grafo da home ----------------------------------------------------------
// A home declara os DOIS consultorios. E o que faz o Google entender que a
// entidade "Dra. Claudia Maciel" tem duas unidades, mesmo que a visitante nunca
// chegue a abrir /bonito ou /ponta-pora.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    websiteNode(),
    practiceNode(),
    ...locations.map(locationNode),
    physicianNode(),
    primaryImageNode(),
    {
      '@type': 'WebPage',
      '@id': `${siteUrl}/#webpage`,
      url: `${siteUrl}/`,
      name: site.seo.title,
      description: site.seo.description,
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#practice` },
      primaryImageOfPage: { '@id': `${siteUrl}/#primaryimage` },
      inLanguage: site.locale,
      breadcrumb: { '@id': `${siteUrl}/#breadcrumb` },
    },
    breadcrumbNode(`${siteUrl}/`, [{ name: 'Início', url: `${siteUrl}/` }]),
    faqNode(`${siteUrl}/`, site.faq),
  ],
};

// --- <head> -----------------------------------------------------------------
const fontsHref =
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600&display=swap';

/**
 * Monta o <head> de uma pagina. Sai como funcao (e nao como constante) porque o
 * site tem duas rotas — a home e /privacidade — e as duas precisam do mesmo
 * cabecalho tecnico, mas com title, canonical e JSON-LD proprios. Duplicar isso
 * seria a maneira mais facil de a politica sair com o canonical da home, que
 * apagaria a pagina do indice do Google.
 *
 * `local` = so a home publica sinais de geolocalizacao, keywords e o preload do
 * hero; numa pagina juridica eles nao ajudam e o preload atrasaria a LCP dela.
 */
// Limites praticos do resultado de busca. Nao sao regra do Google (ele mede em
// pixels, nao em caracteres), mas passar disso e escrever uma frase que a
// paciente vai ler cortada no meio. Avisa em vez de falhar: e questao de texto,
// nao de dado quebrado.
const SERP = { title: 60, description: 160 };
function warnLength(route, title, description) {
  if (title.length > SERP.title) console.warn(`AVISO: ${route} — title com ${title.length} caracteres (o Google corta perto de ${SERP.title}).`);
  if (description.length > SERP.description) console.warn(`AVISO: ${route} — description com ${description.length} caracteres (o Google corta perto de ${SERP.description}).`);
}

function buildHead({ title, description, canonical, jsonLd, local = false, keywords = site.seo.keywords, places = locations, preload = hero.path }) {
  warnLength(canonical.replace(siteUrl, '') || '/', title, description);
  // Sinais de geolocalizacao. Na home saem os dois consultorios (`geo.placename`
  // aceita lista); numa pagina de cidade, so o daquela cidade — e o que evita
  // dizer ao Google que /ponta-pora tambem e sobre Bonito.
  const geoTags = places.filter((p) => p.geo);
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${canonical}">`,
    // Fora de producao a diretiva e invertida. Esta e a 2a das 4 camadas que
    // impedem a indexacao de homologacao (as outras: Basic Auth no Traefik,
    // X-Robots-Tag no nginx e o robots.txt logo abaixo).
    isProd
      ? `<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">`
      : `<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">`,
    isProd
      ? `<meta name="googlebot" content="index,follow,max-snippet:-1,max-image-preview:large">`
      : `<meta name="googlebot" content="noindex,nofollow,noarchive,nosnippet">`,
    local ? `<meta name="keywords" content="${esc(keywords.join(', '))}">` : '',
    `<meta name="author" content="${esc(site.doctor.fullName)}">`,
    `<meta name="theme-color" content="${site.themeColor}">`,
    `<meta name="color-scheme" content="light">`,
    `<meta name="format-detection" content="telephone=no">`,
    // Sinais de geolocalizacao para busca local. `geo.position` e `ICBM` levam
    // UMA coordenada por definicao: numa pagina de cidade e a dela; na home,
    // a da primeira unidade, ja que os dois consultorios estao no JSON-LD com
    // coordenada propria — e e de la que o Google tira o dado que importa.
    local && geoTags.length ? `<meta name="geo.region" content="${places[0].address.country}-${places[0].address.stateCode}">` : '',
    local ? `<meta name="geo.placename" content="${esc(places.map((p) => p.city).join(', '))}">` : '',
    local && geoTags.length ? `<meta name="geo.position" content="${geoTags[0].geo.lat};${geoTags[0].geo.lng}">` : '',
    local && geoTags.length ? `<meta name="ICBM" content="${geoTags[0].geo.lat}, ${geoTags[0].geo.lng}">` : '',
    // Open Graph.
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(site.practice.name)}">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    // O cartao de marca, nao a foto do hero: quem recebe o link no WhatsApp
    // precisa reconhecer de quem e o site antes de ler o titulo.
    `<meta property="og:image" content="${og.url}">`,
    `<meta property="og:image:type" content="image/jpeg">`,
    `<meta property="og:image:width" content="${og.w}">`,
    `<meta property="og:image:height" content="${og.h}">`,
    `<meta property="og:image:alt" content="Logotipo de ${esc(site.practice.name)}">`,
    // Twitter/X.
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${og.url}">`,
    // Icones + manifest (o Google exige favicon para exibir o icone na SERP mobile).
    // O .ico carrega 16/32/48 no mesmo arquivo; o `sizes` declara o tamanho que
    // o navegador deve assumir sem precisar baixa-lo para descobrir.
    `<link rel="icon" href="/favicon.ico" sizes="32x32">`,
    `<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/site.webmanifest">`,
    // LCP: a imagem do topo comeca a baixar junto com o HTML. Cada pagina de
    // cidade tem a sua foto, entao o preload nao pode ser fixo no hero da home.
    local ? `<link rel="preload" as="image" href="${preload}" fetchpriority="high">` : '',
    // Fontes sem bloquear a renderizacao.
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link rel="preload" as="style" href="${fontsHref}">`,
    `<link rel="stylesheet" href="${fontsHref}" media="print" onload="this.media='all'">`,
    `<noscript><link rel="stylesheet" href="${fontsHref}"></noscript>`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].join('');
}

const headSeo = buildHead({
  title: site.seo.title,
  description: site.seo.description,
  canonical: `${siteUrl}/`,
  jsonLd,
  local: true,
});

// --- selo de ambiente -------------------------------------------------------
// Existe para que ninguem aprove/reporte bug olhando para o ambiente errado.
const envBadge = isProd
  ? ''
  : `<div class="envBadge">${siteEnv === 'hom' ? 'Homologação &middot; não indexado' : 'Ambiente local'}</div>`;
// O selo e position:fixed, entao o aviso de cookies precisa saber que ele
// existe para nao se sobrepor a ele nas telas estreitas.
const bodyAttr = isProd ? '' : ' class="hasEnvBadge"';

// --- Google Analytics 4 + Consent Mode v2 (LGPD) ----------------------------
// Modo "basico": os sinais de consentimento sao declarados como `denied` antes
// de qualquer tag, e o gtag.js so e BAIXADO depois do aceite. Assim, quem nao
// consente nao gera nenhuma requisicao ao Google — nem os pings sem cookie do
// modo avancado. Para uma pagina de medica no Brasil e a leitura mais segura da
// LGPD, e de quebra nao custa um request de terceiro no carregamento inicial.
// (Como trocar para o modo avancado: docs/ANALYTICS.md.)
const analyticsHead = gaId
  ? `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}` +
    `gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',` +
    `analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted'});` +
    `window.__ga={id:${JSON.stringify(gaId)},debug:${!isProd}};</script>`
  : '';

const c = site.analytics.consent;

const consentBanner = gaId
  ? `<aside class="consent" id="consent" role="region" aria-label="Aviso de cookies" hidden>` +
    `<p>${esc(c.text)} <a href="${site.privacy.path}">${esc(c.more)}</a>.</p>` +
    `<div class="consentActions">` +
    `<button type="button" data-consent="denied">${esc(c.reject)}</button>` +
    `<button type="button" data-consent="granted">${esc(c.accept)}</button>` +
    `</div></aside>` +
    `<script>(function(){var K='cm-consent',box=document.getElementById('consent');` +
    // O localStorage lanca excecao em modo restrito/iframe de terceiro; sem o
    // try o script inteiro morre e a pagina fica sem menu e sem FAQ.
    `function get(){try{return localStorage.getItem(K)}catch(e){return null}}` +
    `function set(v){try{localStorage.setItem(K,v)}catch(e){}}` +
    `function load(){if(window.__gaLoaded)return;window.__gaLoaded=1;` +
    `gtag('consent','update',{analytics_storage:'granted'});` +
    `var s=document.createElement('script');s.async=1;` +
    `s.src='https://www.googletagmanager.com/gtag/js?id='+window.__ga.id;document.head.appendChild(s);` +
    `gtag('js',new Date());gtag('config',window.__ga.id,{anonymize_ip:true,debug_mode:window.__ga.debug});}` +
    `function choose(v){set(v);box.hidden=true;if(v==='granted')load()}` +
    `box.querySelectorAll('button').forEach(function(b){b.onclick=function(){choose(b.dataset.consent)}});` +
    `var saved=get();if(saved==='granted')load();else if(saved!=='denied')box.hidden=false;` +
    // Revogar precisa ser tao facil quanto consentir (LGPD, art. 8o, §5o).
    `var r=document.getElementById('consentReset');if(r)r.onclick=function(){` +
    `try{localStorage.removeItem(K)}catch(e){}box.hidden=false;` +
    `box.scrollIntoView({block:'nearest'})};` +
    // Conversao do site: so existem dois caminhos de contato, WhatsApp e telefone.
    `document.addEventListener('click',function(e){` +
    `var a=e.target.closest?e.target.closest('a[href^="https://wa.me/"],a[href^="tel:"]'):null;` +
    `if(!a||!window.__gaLoaded)return;` +
    `gtag('event','generate_lead',{method:a.getAttribute('href').indexOf('tel:')===0?'telefone':'whatsapp'})});` +
    `})();</script>`
  : '';

// --- movimento --------------------------------------------------------------
// O CSS das animacoes esta em src/motion.css; o cabecalho daquele arquivo
// explica as tres regras que governam o conjunto. Aqui ficam so as duas pecas
// de JS, e a ordem entre elas e o ponto importante.
//
// `motionHead` roda no <head>, ANTES do primeiro paint, e nao faz nada alem de
// marcar <html class="motion">. E essa classe que autoriza o CSS a esconder o
// que sera revelado no scroll. A consequencia e deliberada: sem JS, com JS
// quebrado, ou com "reduzir movimento" ligado no sistema, a classe nunca
// aparece e a pagina renderiza inteira e visivel — que e o estado que o
// Googlebot precisa ver. Se o estado inicial (opacity:0) morasse direto no CSS,
// todo o conteudo abaixo da dobra chegaria ao rastreador invisivel.
//
// Precisa ser INLINE e no <head>: um arquivo externo, ou o mesmo script no fim
// do <body>, aplicaria a classe depois do primeiro paint — o conteudo apareceria
// e sumiria em seguida, um flash pior do que nao ter animacao nenhuma.
const motionHead =
  `<script>try{if(window.matchMedia&&!matchMedia('(prefers-reduced-motion:reduce)').matches` +
  `&&'IntersectionObserver' in window)document.documentElement.classList.add('motion')}catch(e){}</script>`;

// `motionBody` roda no fim do <body>, com o DOM pronto, e revela conforme o
// scroll. Sai antes do aviso de cookies de proposito: se o consentimento
// aparecer, ele nao depende deste script para nada.
const motionBody =
  `<script>(function(){if(!document.documentElement.classList.contains('motion'))return;` +
  // rootMargin negativo embaixo: o elemento so conta como "visto" quando entra
  // de verdade na tela. Sem isso ele termina a animacao ainda fora do campo de
  // visao e a pessoa chega numa secao que ja aconteceu.
  // unobserve depois de revelar: a animacao e de entrada, nao de ida e volta —
  // reanimar no scroll para cima e o efeito que deixa uma pagina cansativa.
  `var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;` +
  `e.target.classList.add('isIn');io.unobserve(e.target)})},{rootMargin:'0px 0px -10% 0px'});` +
  `document.querySelectorAll('[data-reveal]').forEach(function(el){io.observe(el)});` +
  // Sombra do header. O sentinela .navTop (1px no topo do documento) troca a
  // classe quando sai da tela — assim o site nao precisa de listener de scroll,
  // que roda a cada frame e e a forma mais facil de tornar o scroll travado.
  `var s=document.querySelector('.navTop'),nav=document.querySelector('.nav');` +
  `if(s&&nav)new IntersectionObserver(function(e){` +
  `nav.classList.toggle('isStuck',!e[0].isIntersecting)}).observe(s);` +
  `})();</script>`;

// --- politica de privacidade ------------------------------------------------
// Um banner de consentimento sem politica acessivel nao cumpre a LGPD. Ela vive
// em /privacidade, pagina propria, linkada do rodape (presente em todas as
// paginas) e de dentro do proprio aviso de cookies, ANTES do aceite. E o que os
// arts. 6o, VI e 9o pedem: acesso facilitado e ostensivo — nada na lei exige o
// texto embutido na home.
//
// Por que nao ficou na home: o documento tem ~1.265 palavras contra ~1.017 de
// conteudo editorial. Embutido, ele era 55% do texto da pagina que disputa
// "ginecologista em Bonito-MS" — diluicao de relevancia num site de saude, onde
// o Google e mais rigoroso. Uma URL estavel tambem e exigida por Meta Ads e
// Google Ads para aprovar campanha.
//
// A pagina e montada em duas camadas, como recomenda o Guia de Cookies da
// ANPD: resumo (lead + cartoes) no topo, documento completo abaixo.
const pv = site.privacy;
const pvDate = pv.updated.split('-').reverse().join('/');

// Sem GA nao existe cookie de analise nenhum — documentar cookies que a pagina
// nao grava seria informacao falsa, entao a secao marcada some do HTML.
const pvSections = pv.sections
  .filter((s) => gaId || !s.requiresAnalytics)
  .map((s, i) => ({
    ...s,
    n: String(i + 1).padStart(2, '0'),
    id: `pv-${s.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`,
  }));

const pvTable = (t) =>
  `<div class="privacyTableWrap"><table class="privacyTable"><thead><tr>` +
  t.head.map((h) => `<th scope="col">${esc(h)}</th>`).join('') +
  `</tr></thead><tbody>` +
  t.rows
    .map(
      (r) =>
        `<tr><th scope="row"><code>${esc(r[0])}</code></th>` +
        r.slice(1).map((cell) => `<td>${fillText(cell)}</td>`).join('') +
        `</tr>`,
    )
    .join('') +
  `</tbody></table></div>`;

const pvArticles = pvSections
  .map(
    (s) =>
      `<article class="privacyArticle" id="${s.id}">` +
      `<h2><span class="privacyNum" aria-hidden="true">${s.n}</span>${esc(s.title)}</h2>` +
      s.paragraphs.map((p) => `<p>${fillText(p)}</p>`).join('') +
      (s.list ? `<ul class="privacyList">${s.list.map((li) => `<li>${fillText(li)}</li>`).join('')}</ul>` : '') +
      (s.table ? pvTable(s.table) : '') +
      (s.link
        ? `<a class="privacyLink" href="${esc(s.link.href)}" target="_blank" rel="noopener">` +
          `${esc(s.link.label)} <span aria-hidden="true">&#8599;</span></a>`
        : '') +
      `</article>`,
  )
  .join('');

const pvIndex =
  `<nav class="privacyIndex" aria-label="Índice da política de privacidade">` +
  `<p class="privacyIndexTitle">${esc(pv.indexTitle)}</p><ol>` +
  pvSections.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('') +
  `</ol></nav>`;

const pvContact =
  `<aside class="privacyContact"><h2>${esc(pv.contact.title)}</h2>` +
  `<p>${fillText(pv.contact.text)}</p>` +
  // Revogar precisa ser tao facil quanto consentir (LGPD, art. 8o, §5o) — por
  // isso o botao fica aqui, no fim da leitura, e nao escondido no navegador.
  (gaId
    ? `<button type="button" id="consentReset" class="consentReset">` +
      `<span aria-hidden="true">↺</span> ${esc(pv.contact.cookiesLabel)}</button>`
    : '') +
  `</aside>`;

const privacyMain =
  `<main class="privacyPage" id="politica" tabindex="-1">` +
  `<header class="privacyHero">` +
  `<nav class="privacyBreadcrumb" aria-label="Trilha de navegação">` +
  `<a href="/">Início</a><span aria-hidden="true">/</span>${esc(pv.title)}</nav>` +
  `<p class="eyebrow">${esc(pv.eyebrow)}</p>` +
  `<h1>${esc(pv.title)}</h1>` +
  `<p class="privacyLead">${fillText(pv.summary)}</p>` +
  `<p class="privacyMeta"><span>Última atualização: ${pvDate}</span><span>${esc(pv.legalNote)}</span></p>` +
  `</header>` +
  // Os cartoes de resumo sao o unico bloco animado da politica: o corpo do
  // documento entra estatico de proposito — animar paragrafo de texto juridico
  // atrasa a leitura de quem foi ali buscar uma informacao especifica.
  `<ul class="privacyHighlights stagger">` +
  pv.highlights
    .map(
      (h) =>
        `<li data-reveal><span class="privacyIcon" aria-hidden="true">${h.icon}</span>` +
        `<strong>${esc(h.title)}</strong><span>${fillText(h.text)}</span></li>`,
    )
    .join('') +
  `</ul>` +
  `<div class="privacyPaper">${pvIndex}` +
  `<div class="privacyBody">${pvArticles}${pvContact}</div>` +
  `</div></main>`;

// JSON-LD proprio da pagina: sem ele o Google trata /privacidade como orfa do
// grafo do site. O breadcrumb tambem e o que rende a trilha "Início > Política
// de Privacidade" no resultado de busca, em vez da URL crua.
const privacyJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${siteUrl}${pv.path}#webpage`,
      url: `${siteUrl}${pv.path}`,
      name: pv.metaTitle,
      description: pv.metaDescription,
      inLanguage: site.locale,
      isPartOf: { '@id': `${siteUrl}/#website` },
      about: { '@id': `${siteUrl}/#practice` },
      publisher: { '@id': `${siteUrl}/#practice` },
      dateModified: pv.updated,
      breadcrumb: { '@id': `${siteUrl}${pv.path}#breadcrumb` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${siteUrl}${pv.path}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${siteUrl}/` },
        { '@type': 'ListItem', position: 2, name: pv.title, item: `${siteUrl}${pv.path}` },
      ],
    },
  ],
};

// --- montagem do HTML -------------------------------------------------------
const html = await readFile('site.html', 'utf8');

// Dois bundles em vez de um: a home nao carrega o CSS da politica, e a politica
// nao carrega o das fotos nem o da secao de formacao. styles.css entra nas duas
// porque e la que vivem o header, o rodape e a tipografia; motion.css tambem,
// porque metade das micro-interacoes esta no header e no rodape.
//
// motion.css e SEMPRE o ultimo: ele sobrescreve declaracoes de styles.css (o
// "+/-" do FAQ, a transicao dos cartoes) e depende de vencer no cascade.
// Comentario de CSS e documentacao para quem edita o arquivo, nao informacao
// para o navegador — e todos eles viajavam dentro do <style> de cada pagina. Os
// arquivos deste projeto sao comentados de proposito e com fartura, entao isso
// ja passava de 4 KB por pagina, no bloco que bloqueia a renderizacao. Sai aqui:
// a fonte continua comentada, o HTML fica enxuto e o FCP agradece.
//
// O comentario e trocado por um ESPACO, nao por vazio: em CSS o comentario e um
// separador de tokens valido, e concatenar os dois lados poderia grudar um `}`
// num seletor.
function stripCssComments(css, file) {
  const out = css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/[ \t]*\n[ \t\n]*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // Comentario de CSS mal fechado e o erro mais silencioso que existe neste
  // projeto: o navegador engole a proxima regra inteira e o bloco simplesmente
  // nao aplica — sem erro no console, sem nada. Ja custou uma secao publicada
  // sem padding e sem fundo. Se depois de remover todos os pares /* */ ainda
  // sobrou um delimitador solto, o arquivo esta quebrado: falhar aqui e barato.
  const loose = out.match(/\/\*|\*\//);
  if (loose) {
    const at = out.slice(Math.max(0, out.indexOf(loose[0]) - 60), out.indexOf(loose[0]) + 20).replace(/\n/g, ' ');
    throw new Error(`${file}: comentario de CSS mal fechado ("${loose[0]}" solto) perto de: ...${at}`);
  }
  return out;
}

const readCss = async (files) =>
  (await Promise.all(files.map(async (f) => stripCssComments(await readFile(f, 'utf8'), f)))).join('\n');
// A home nao carrega mais o location.css: o mapa saiu dela e passou a viver nas
// paginas de cidade (a secao "Onde atende" que ficou no lugar dele e estilizada
// no styles.css, junto do rodape).
const css = await readCss([
  'src/styles.css',
  'src/photos.css',
  'src/credentials.css',
  'src/testimonials.css',
  'src/env-ui.css',
  'src/motion.css',
]);
const privacyCss = await readCss(['src/styles.css', 'src/env-ui.css', 'src/privacy.css', 'src/motion.css']);
const cityCss = await readCss([
  'src/styles.css',
  'src/photos.css',
  'src/location.css',
  'src/city.css',
  'src/env-ui.css',
  'src/motion.css',
]);

/**
 * Header, rodape e o script do menu sao os mesmos nas duas paginas. Em vez de
 * duplicar a marcacao num segundo template (que dia desses sairia do lugar sem
 * ninguem notar), o build recorta esses blocos do proprio site.html pelos
 * marcadores <!--#shell:nome-->.
 */
function shell(name) {
  const m = html.match(new RegExp(`<!--#shell:${name}-->([\\s\\S]*?)<!--/#shell:${name}-->`));
  if (!m) throw new Error(`Bloco <!--#shell:${name}--> nao encontrado em site.html`);
  return m[1];
}

/**
 * Blocos que podem nao existir na pagina: <!--#opt:nome--> ... <!--/#opt:nome-->.
 * `keep` true mantem o conteudo e descarta so os marcadores; false apaga o
 * bloco inteiro.
 *
 * Existe para a secao de depoimentos poder ser desligada (site-data.js ->
 * testimonials.enabled) sem deixar marcacao morta no HTML e sem que a alternativa
 * fosse trazer a marcacao dela para dentro do build — o site.html e a fonte da
 * verdade do layout, e uma secao inteira montada em template string aqui seria a
 * primeira a sair do padrao do resto.
 *
 * Falha alto quando o marcador nao existe: um <!--#opt:--> escrito errado seria
 * apagado em silencio pela limpeza de comentarios do fill(), e a secao sumiria
 * da pagina sem nenhum aviso.
 */
function optionalBlocks(tpl, flags) {
  return Object.entries(flags).reduce((acc, [name, keep]) => {
    const re = new RegExp(`<!--#opt:${name}-->([\\s\\S]*?)<!--/#opt:${name}-->`);
    if (!re.test(acc)) throw new Error(`Bloco <!--#opt:${name}--> nao encontrado em site.html`);
    return acc.replace(re, (_, inner) => (keep ? inner : ''));
  }, tpl);
}

// Fora da home, as ancoras do menu (#sobre, #cuidados...) precisam voltar para
// a raiz — senao viram links mortos para secoes que nao existem em /privacidade.
const toHomeAnchors = (s) => s.replaceAll('href="#', 'href="/#');

// O separador precisa ficar fora do esc(), senao o "&" de &middot; e escapado
// e a entidade aparece literal na pagina. O separador da esquerda tambem entra
// aqui para nao sobrar solto quando o CRM estiver vazio.
const crmLine = site.doctor.crm
  ? ` &middot; <span class="crm">${[site.doctor.crm, site.doctor.rqe].filter(Boolean).map(esc).join(' &middot; ')}</span>`
  : '';

// --- rodape: os dois consultorios -------------------------------------------
// O rodape aparece em TODAS as paginas, entao esta e a linha que da a cada URL
// do site o NAP completo das duas unidades — e os dois links internos que
// levam as paginas de cidade de qualquer lugar do site.
const footerLocations = locations
  .map(
    (l) =>
      `<a href="${l.path}"><b>${esc(l.label)}</b> ${esc(l.address.street)} — ${esc(l.address.district)}</a>`,
  )
  .join('');

// --- home: a secao "Onde atende" --------------------------------------------
// Cada cartao e o resumo de um consultorio e o link interno para a pagina dele.
// E daqui que a home passa autoridade para /bonito e /ponta-pora — sem esse
// link, as duas paginas de cidade ficariam penduradas so no rodape.
const placeCards = locations
  .map(
    (l) =>
      `<li data-reveal><article>` +
      `<h3>${esc(l.city)}<span>${esc(l.address.stateCode)}</span></h3>` +
      `<p class="placeAddr">${esc(l.address.street)}<br>${esc(l.address.district)}, ${esc(l.address.city)}-${esc(l.address.stateCode)}</p>` +
      `<p class="placeHours"><b>Horário:</b> ${esc(l.hoursText || 'consulte pelo WhatsApp')}</p>` +
      `<p class="placeArea">${esc(l.areaServed.slice(0, 4).join(' · '))}${l.areaServed.length > 4 ? ' e região' : ''}</p>` +
      `<a class="placeGo" href="${l.path}">Ver o consultório em ${esc(l.city)} <span aria-hidden="true">&rarr;</span></a>` +
      `</article></li>`,
  )
  .join('');

// Uma linha de endereco por consultorio no bloco de contato da home.
const contactPlaces = locations
  .map(
    (l) =>
      `<a href="${l.mapUrl}" target="_blank" rel="noopener"><b>Consultório em ${esc(l.city)}:</b> ` +
      `${esc(l.address.street)} — ${esc(l.address.district)}, ${esc(l.address.city)}-${esc(l.address.stateCode)} ` +
      `<span aria-hidden="true">&#8599;</span></a>`,
  )
  .join('');

// Uniao das regioes atendidas, sem repetir cidade que aparece nas duas listas.
const areaServedAll = [...new Set(locations.flatMap((l) => l.areaServed))];

// O CRM sem o separador da esquerda — `crmLine` traz um " &middot; " na frente
// porque emenda no telefone do rodape, e numa linha propria ele sobraria.
const crmPlain = [site.doctor.crm, site.doctor.rqe].filter(Boolean).map(esc).join(' &middot; ');

/**
 * Substituicoes comuns a todas as paginas (NAP, links, imagens).
 *
 * `loc` liga os marcadores de UNIDADE (__ADDRESS_*__, __MAP_*__, __HOURS_*__):
 * numa pagina de cidade eles valem os dados daquele consultorio. Fora dela,
 * esses marcadores nao sao substituidos — e a validacao no fim do build falha
 * alto, em vez de deixar um endereco pela metade escapar para a home.
 */
function fill(tpl, loc) {
  let out = tpl
    .replaceAll('__ANALYTICS_HEAD__', analyticsHead)
    .replaceAll('__MOTION_HEAD__', motionHead)
    .replaceAll('__MOTION_BODY__', motionBody)
    .replaceAll('__ENV_BADGE__', envBadge)
    .replaceAll('__BODY_ATTR__', bodyAttr)
    .replaceAll('__CONSENT_BANNER__', consentBanner)
    .replaceAll('__PRIVACY_PATH__', pv.path)
    .replaceAll('__PRIVACY_LABEL__', esc(pv.linkLabel))
    // Caminho ABSOLUTO, ao contrario das fotos: o monograma esta no cabecalho e
    // no rodape, blocos que /privacidade tambem usa. Um `assets/...` relativo
    // viraria `/privacidade/assets/...` e daria 404 na segunda rota do site.
    .replaceAll(
      '__LOGO_MARK__',
      `src="/${brand['logo-mark'].path}" width="${brand['logo-mark'].w}" height="${brand['logo-mark'].h}"`,
    )
    .replaceAll('__CRM__', crmLine)
    .replaceAll('__PHONE_DISPLAY__', esc(phone.display))
    .replaceAll('__PHONE_E164__', phone.e164)
    .replaceAll('__WHATSAPP_URL__', `${whatsappUrl}?text=${encodeURIComponent(site.practice.whatsappText)}`)
    .replaceAll('__CITIES__', esc(citiesText))
    .replaceAll('__CITIES_LABEL__', esc(citiesLabel))
    .replaceAll('__FOOTER_LOCATIONS__', footerLocations)
    .replaceAll('__CRM_PLAIN__', crmPlain)
    // Comentario de HTML tambem nao e informacao para o navegador. Este replace
    // cobre os marcadores <!--#shell:nome--> (que ja foram consumidos pelo
    // shell(), sobre o `html` cru, antes de chegar aqui) e, de quebra, libera o
    // site.html para ser comentado como todo o resto do projeto — sem os
    // comentarios pesarem no HTML de cada visita.
    .replace(/<!--[\s\S]*?-->/g, '');

  if (loc) {
    out = out
      .replaceAll('__LOC_CITY__', esc(loc.city))
      .replaceAll('__LOC_LABEL__', esc(loc.label))
      .replaceAll('__LOC_PATH__', loc.path)
      .replaceAll('__ADDRESS_FULL__', esc(loc.fullAddress))
      .replaceAll('__ADDRESS_STREET__', esc(loc.address.street))
      .replaceAll('__ADDRESS_CITY__', esc(`${loc.address.district}, ${loc.address.city}-${loc.address.stateCode}`))
      .replaceAll('__MAP_URL__', esc(loc.mapUrl))
      .replaceAll('__MAP_DIRECTIONS__', esc(loc.mapDirections))
      .replaceAll('__MAP_EMBED__', esc(loc.mapEmbed))
      .replaceAll('__WAZE_URL__', esc(loc.wazeUrl))
      // O rotulo do cartao e fixo, entao o texto nao pode sair vazio quando
      // `openingHours` estiver vazio — dai o fallback, que continua verdadeiro
      // seja qual for o horario (ver `openingHours` no site-data).
      .replaceAll('__HOURS_TEXT__', esc(loc.hoursText || 'Consulte os horários pelo WhatsApp'))
      .replaceAll('__AREA_SERVED__', loc.areaServed.map((c) => `<li>${esc(c)}</li>`).join(''));
  }

  for (const [name, img] of Object.entries(images)) {
    const token = `__${name.toUpperCase().replaceAll('-', '_')}__`;
    out = out.replaceAll(token, `src="${img.path}" width="${img.w}" height="${img.h}"`);
  }
  return out;
}

const page = fill(
  optionalBlocks(typeWords(html), { depoimentos: tst.enabled })
    .replace('/*__STYLES__*/', css)
    .replaceAll('__HEAD_SEO__', headSeo)
    .replaceAll('__SERVICE_CARDS__', serviceCards)
    .replaceAll('__CREDENTIAL_ITEMS__', credentialCards)
    .replaceAll('__TESTIMONIAL_CARDS__', testimonialCards)
    .replaceAll('__FAQ_LIST__', faqList)
    .replaceAll('__PLACE_CARDS__', placeCards)
    .replaceAll('__CONTACT_PLACES__', contactPlaces)
    .replaceAll('__AREA_SERVED_ALL__', areaServedAll.map((c) => `<li>${esc(c)}</li>`).join('')),
);

// --- paginas de cidade ------------------------------------------------------
// Uma rota por consultorio. O <main> vem de location.html; o cabecalho, o
// rodape e os scripts de menu e FAQ sao os mesmos blocos da home, recortados do
// site.html — e por isso que mexer no menu continua sendo uma edicao so.
const cityTemplate = await readFile('location.html', 'utf8');

const cityPages = locations.map((loc) => {
  // Link para a(s) outra(s) unidade(s). Fecha o triangulo home -> cidade ->
  // cidade: quem caiu na pagina errada tem para onde ir, e as duas paginas
  // ficam ligadas entre si, nao so penduradas na home.
  const others = locations.filter((o) => o.slug !== loc.slug);
  const otherBlock =
    `<p class="cityOtherLabel">A Dra. Claudia também atende em</p>` +
    others
      .map(
        (o) =>
          `<a href="${o.path}"><b>${esc(o.city)}</b>` +
          `<span>${esc(o.address.street)} — ${esc(o.address.district)}, ${esc(o.address.city)}-${esc(o.address.stateCode)}</span></a>`,
      )
      .join('');

  // Lista compacta, e nao os cartoes inteiros da home: as descricoes completas
  // de cada servico ja vivem em /#cuidados, e repeti-las em tres URLs seria
  // conteudo duplicado disputando com a propria home. Os itens linkam para la.
  const serviceChips = site.services
    .map((s) => `<li><a href="/#cuidados">${esc(s.name)}</a></li>`)
    .join('');

  const locFaq = loc.page.faq
    .map(
      (f, i) =>
        `<details class="faqItem"${i === 0 ? ' open' : ''}><summary><span>${fillText(f.q, loc)}</span>` +
        `<b aria-hidden="true"></b></summary><p>${fillText(f.a, loc)}</p></details>`,
    )
    .join('');

  const pageId = loc.url;
  const cityJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      websiteNode(),
      practiceNode(),
      // O consultorio DESTA pagina primeiro; o outro entra so como referencia
      // pelo `department` do #practice. Declarar os dois por extenso aqui
      // faria a pagina de Ponta Pora falar tanto de Bonito quanto de si mesma.
      locationNode(loc),
      physicianNode(),
      primaryImageNode(),
      {
        '@type': 'WebPage',
        '@id': `${pageId}#webpage`,
        url: pageId,
        name: loc.page.title,
        description: fillText(loc.page.description, loc),
        isPartOf: { '@id': `${siteUrl}/#website` },
        about: { '@id': loc.id },
        primaryImageOfPage: { '@id': `${siteUrl}/#primaryimage` },
        inLanguage: site.locale,
        breadcrumb: { '@id': `${pageId}#breadcrumb` },
      },
      breadcrumbNode(pageId, [
        { name: 'Início', url: `${siteUrl}/` },
        { name: `Consultório em ${loc.label}`, url: pageId },
      ]),
      faqNode(pageId, loc.page.faq.map((f) => ({ q: fillText(f.q, loc), a: fillText(f.a, loc) }))),
    ],
  };

  const photo = images[loc.photo];
  if (!photo) throw new Error(`site-data.js: locations[${loc.slug}].photo = "${loc.photo}" nao existe em assets/.`);

  const head = buildHead({
    title: loc.page.title,
    description: fillText(loc.page.description, loc),
    canonical: pageId,
    jsonLd: cityJsonLd,
    local: true,
    keywords: loc.page.keywords,
    // So esta cidade nos sinais de geolocalizacao — dizer ao Google que
    // /ponta-pora tambem e sobre Bonito e exatamente o que dilui as duas.
    places: [loc],
    preload: photo.path,
  });

  const main = cityTemplate
    .replaceAll('__LOC_H1__', fillText(`Ginecologista e Obstetra em ${loc.label}`, loc))
    .replaceAll('__LOC_LEAD__', fillText(loc.page.lead, loc))
    .replaceAll('__LOC_LANDMARK__', fillText(loc.page.landmark, loc))
    .replaceAll('__LOC_ABOUT__', loc.page.about.map((p) => `<p>${fillText(p, loc)}</p>`).join(''))
    .replaceAll('__LOC_SERVICES__', serviceChips)
    .replaceAll('__LOC_FAQ__', locFaq)
    .replaceAll('__LOC_OTHER__', otherBlock)
    .replaceAll('__LOC_PHOTO__', `src="${photo.path}" width="${photo.w}" height="${photo.h}"`);

  const out = fill(
    `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      head +
      `<style>${cityCss}</style>__ANALYTICS_HEAD____MOTION_HEAD__</head><body__BODY_ATTR__>__ENV_BADGE__` +
      `<a class="skip" href="#conteudo">Ir para o conteúdo</a>` +
      toHomeAnchors(shell('nav')) +
      main +
      toHomeAnchors(shell('footer')) +
      shell('menu') +
      shell('faq') +
      `__MOTION_BODY____CONSENT_BANNER__</body></html>`,
    loc,
  );

  return { loc, out };
});

// /privacidade reaproveita o shell da home. As imagens do consultorio ficam de
// fora de proposito: numa pagina juridica elas so pesariam.
const privacyPage = fill(
  `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    buildHead({
      title: pv.metaTitle,
      description: pv.metaDescription,
      canonical: `${siteUrl}${pv.path}`,
      jsonLd: privacyJsonLd,
    }) +
    `<style>${privacyCss}</style>__ANALYTICS_HEAD____MOTION_HEAD__</head><body__BODY_ATTR__>__ENV_BADGE__` +
    `<a class="skip" href="#politica">Ir para o conteúdo</a>` +
    toHomeAnchors(shell('nav')) +
    privacyMain +
    toHomeAnchors(shell('footer')) +
    shell('menu') +
    `__MOTION_BODY____CONSENT_BANNER__</body></html>`,
);

// Todas as paginas geradas, na ordem em que vao para dist/.
const pages = [
  { route: '/', dir: '', html: page },
  ...cityPages.map(({ loc, out }) => ({ route: loc.path, dir: loc.path, html: out })),
  { route: pv.path, dir: pv.path, html: privacyPage },
];

for (const { route, html: out } of pages) {
  const leftovers = out.match(/__[A-Z_]+__|\/\*__STYLES__\*\/|<!--\/?#(shell|opt):/g);
  if (leftovers) throw new Error(`${route}: placeholders nao substituidos: ${[...new Set(leftovers)].join(', ')}`);

  // Um "-->" sobrando depois da limpeza de comentarios significa que um
  // comentario do template terminou antes do fim: escrever a sequencia de
  // fechamento DENTRO de um comentario o encerra ali, e o resto do texto — que
  // era documentacao para quem edita — vaza como conteudo visivel no topo da
  // pagina. Ja aconteceu no location.html, e a pagina continua valida o
  // suficiente para ninguem notar sem olhar.
  const stray = out.indexOf('-->');
  if (stray >= 0) {
    throw new Error(
      `${route}: sobrou um "-->" no HTML gerado — algum comentario do template fechou antes do fim ` +
        `e o texto dele virou conteudo visivel. Perto de: ...${out.slice(Math.max(0, stray - 90), stray + 3).replace(/\s+/g, ' ')}`,
    );
  }
}

// A partir daqui nao ha mais nada que possa falhar por conteudo — so agora
// dist/ e recriado (ver comentario no topo).
await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
for (const name of imageNames) await copyFile(`assets/${name}.webp`, `dist/assets/${name}.webp`);
for (const { path } of Object.values(brand)) await copyFile(path, `dist/${path}`);
for (const file of iconFiles) await copyFile(`assets/${file}`, `dist/${file}`);

// Pre-comprime para o nginx servir via gzip_static.
for (const { dir, html: out } of pages) {
  if (dir) await mkdir(`dist${dir}`, { recursive: true });
  await writeFile(`dist${dir}/index.html`, out);
  await writeFile(`dist${dir}/index.html.gz`, gzipSync(Buffer.from(out), { level: 9 }));
}

// --- arquivos auxiliares ----------------------------------------------------
// lastmod = a mais recente entre as duas fontes de conteudo. Usar so o
// site.html deixaria a data velha quando a edicao fosse apenas no site-data.js.
const sources = await Promise.all(['site.html', 'src/site-data.js'].map((f) => stat(f)));
const lastmod = new Date(Math.max(...sources.map((s) => s.mtime))).toISOString().slice(0, 10);

await writeFile(
  'dist/robots.txt',
  isProd
    ? [
        'User-agent: *',
        'Allow: /',
        '',
        '# Bots de IA/LLM tambem sao trafego de descoberta — liberados de proposito.',
        'User-agent: GPTBot',
        'Allow: /',
        '',
        'User-agent: Google-Extended',
        'Allow: /',
        '',
        `Sitemap: ${siteUrl}/sitemap.xml`,
        '',
      ].join('\n')
    : [
        `# Ambiente de ${siteEnv}. Nao ha nada aqui para indexar.`,
        'User-agent: *',
        'Disallow: /',
        '',
      ].join('\n'),
);

// Sitemap so em producao: um sitemap em homologacao e um convite explicito para
// o Googlebot rastrear o ambiente errado.
if (isProd) {
  const sitemapImages = Object.values(images)
    .map((i) => `    <image:image><image:loc>${i.url}</image:loc></image:image>`)
    .join('\n');

  // As paginas de cidade vem logo depois da home, com prioridade alta: sao elas
  // que disputam "ginecologista em <cidade>", e a foto propria de cada uma entra
  // no image sitemap junto.
  //
  // /privacidade entra indexavel de proposito: pagina de privacidade visivel e
  // sinal de confianca que o Google valoriza em site de saude (YMYL), e ela nao
  // compete por nenhuma busca que interessa. Prioridade baixa e changefreq anual
  // porque o texto so muda quando o site muda. lastmod vem de privacy.updated —
  // a data do documento, nao a do build.
  const cityUrls = locations
    .map(
      (l) => `  <url>
    <loc>${l.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
    <image:image><image:loc>${images[l.photo].url}</image:loc></image:image>
  </url>`,
    )
    .join('\n');

  await writeFile(
    'dist/sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
${sitemapImages}
  </url>
${cityUrls}
  <url>
    <loc>${siteUrl}${pv.path}</loc>
    <lastmod>${pv.updated}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
`,
  );
}

await writeFile(
  'dist/site.webmanifest',
  JSON.stringify(
    {
      name: site.practice.name,
      short_name: site.practice.shortName,
      description: site.seo.description,
      lang: site.locale,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#fbf8f3',
      theme_color: site.themeColor,
      // Sem `maskable`: o Android recorta o icone maskable num circulo que come
      // 20% de cada lado, e o monograma nao sobrevive a isso. Declarar so `any`
      // faz o sistema desenhar o icone dentro de um contorno proprio, intacto.
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    },
    null,
    2,
  ),
);

// Pagina 404 real: sem ela o nginx devolveria o index com status 200 em qualquer
// URL inexistente (soft 404), o que o Google trata como erro de qualidade.
await writeFile(
  'dist/404.html',
  `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Página não encontrada | ${esc(site.practice.shortName)}</title><link rel="icon" href="/favicon.ico" sizes="32x32"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;text-align:center;padding:32px;background:#fbf8f3;color:#30272a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}h1{font:500 clamp(32px,6vw,52px)/1.1 Georgia,serif;color:${site.themeColor};margin:0 0 14px}p{color:#75696c;max-width:420px;margin:0 auto 26px;line-height:1.7}a{display:inline-block;background:${site.themeColor};color:#fff;text-decoration:none;padding:15px 24px;border-radius:999px;font-weight:700;font-size:14px}</style></head><body><main><h1>Página não encontrada</h1><p>O endereço que você acessou não existe ou foi movido. Volte para a página inicial para conhecer o atendimento da ${esc(site.doctor.fullName)}.</p><a href="/">Ir para a página inicial</a></main></body></html>`,
);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
for (const { route, dir, html: out } of pages) {
  const gz = kb((await stat(`dist${dir}/index.html.gz`)).size);
  console.log(`${route.padEnd(18)} ${kb(Buffer.byteLength(out))} (gz ${gz})`);
}
console.log(`dist/assets/       ${imageNames.length} fotos + ${Object.keys(brand).length} de marca`);
console.log(`icones             ${iconFiles.length} na raiz (${og.w}x${og.h} no cartao de compartilhamento)`);
// Fica no resumo porque e um numero de orcamento, nao curiosidade: e quando a
// manchete termina de ser escrita. Ver docs/SEO.md, §7.2.
console.log(`manchete           ${(typedTotalMs / 1000).toFixed(2)}s de escrita`);
console.log(`site url           ${siteUrl}`);
console.log(`ambiente           ${siteEnv}${isProd ? ' (indexavel)' : ' (noindex + robots.txt Disallow)'}`);
console.log(`analytics          ${gaId ? `${gaId}${isProd ? '' : ' + debug_mode'}` : 'desligado (GA_MEASUREMENT_ID vazio)'}`);
if (!site.doctor.crm) console.warn('AVISO: src/site-data.js -> doctor.crm vazio (exigido pelo CFM na publicidade medica).');
