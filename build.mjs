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

// IMPORTANTE: nada e escrito em dist/ ate a validacao de placeholders passar
// (mais abaixo). Se o `rm` viesse antes, um build quebrado apagaria o site e
// deixaria dist/ vazio — o que, com o servidor de dev rodando, derruba a
// pagina inteira ate o erro ser corrigido.

// --- imagens como arquivos reais -------------------------------------------
// Ficam fora do HTML (em vez de base64) por tres motivos de SEO: o Google
// Images so indexa URLs reais, og:image/Twitter exigem URL absoluta, e o HTML
// cai de ~240 KB para ~40 KB, o que adianta o First Contentful Paint.
const images = {};
for (const name of imageNames) {
  const bytes = await readFile(`assets/${name}.webp`);
  const { w, h } = webpSize(bytes);
  images[name] = { path: `assets/${name}.webp`, url: `${siteUrl}/assets/${name}.webp`, w, h };
}

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

// --- dados estruturados (JSON-LD) ------------------------------------------
const { address: addr, geo, phone } = site.business;
const fullAddress = `${addr.street} — ${addr.district}, ${addr.city}-${addr.stateCode}`;
const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${addr.street}, ${addr.district}, ${addr.city}, ${addr.stateCode}`,
)}`;
const hero = images[site.seo.ogImage];

// --- interpolacao de texto --------------------------------------------------
// Marcadores usados no site-data.js ({crm}, {endereco}...). Existem para que
// nenhum texto editorial repita um dado de negocio a mao: telefone, endereco e
// registro aparecem em varios lugares da pagina, e a copia manual e o caminho
// mais curto para o NAP divergir entre o site, o JSON-LD e o Google Business —
// que e justamente o par que o Google compara em busca local.
const textVars = {
  '{telefone}': esc(phone.display),
  '{endereco}': esc(fullAddress),
  '{site}': esc(siteUrl.replace(/^https?:\/\//, '')),
  '{crm}': esc(site.doctor.crm),
  '{rqe}': esc(site.doctor.rqe),
};
/** Escapa o texto e resolve os marcadores acima. */
const fillText = (s) => Object.entries(textVars).reduce((acc, [k, v]) => acc.split(k).join(v), esc(s));

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

// Horario legivel para a pagina, derivado do MESMO array que alimenta o
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

const hoursText = humanHours(site.business.openingHours);

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
      name: `Conselho Regional de Medicina do estado de ${addr.state} (CRM-${addr.stateCode})`,
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

const postalAddress = {
  '@type': 'PostalAddress',
  streetAddress: addr.street,
  addressLocality: addr.city,
  addressRegion: addr.stateCode,
  postalCode: addr.postalCode,
  addressCountry: addr.country,
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: site.business.name,
      inLanguage: site.locale,
      publisher: { '@id': `${siteUrl}/#practice` },
    },
    {
      '@type': ['Physician', 'MedicalClinic', 'LocalBusiness'],
      '@id': `${siteUrl}/#practice`,
      name: site.business.name,
      alternateName: [site.business.shortName, site.doctor.legalName],
      url: `${siteUrl}/`,
      description: site.seo.description,
      image: { '@id': `${siteUrl}/#primaryimage` },
      logo: hero.url,
      telephone: phone.e164,
      address: postalAddress,
      geo: { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng },
      hasMap: mapUrl,
      medicalSpecialty: ['Obstetric', 'Gynecologic'],
      knowsLanguage: site.locale,
      sameAs: site.doctor.profiles,
      areaServed: site.business.areaServed.map((c) => ({
        '@type': 'City',
        name: c,
        address: { '@type': 'PostalAddress', addressRegion: addr.stateCode, addressCountry: addr.country },
      })),
      availableService: site.services.map((s) => ({
        '@type': 'MedicalProcedure',
        name: s.name,
        description: s.description,
      })),
      ...(site.business.openingHours.length
        ? {
            openingHoursSpecification: site.business.openingHours.map((h) => ({
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
        name: 'Agendar consulta',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `https://wa.me/${phone.e164.replace('+', '')}`,
          inLanguage: site.locale,
          actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'],
        },
      },
    },
    {
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
      workLocation: postalAddress,
      telephone: phone.e164,
      sameAs: site.doctor.profiles,
      knowsAbout: site.services.map((s) => s.name),
      ...(doctorIds.length ? { identifier: doctorIds } : {}),
      ...(doctorCredentials.length ? { hasCredential: doctorCredentials } : {}),
    },
    {
      '@type': 'ImageObject',
      '@id': `${siteUrl}/#primaryimage`,
      url: hero.url,
      contentUrl: hero.url,
      width: hero.w,
      height: hero.h,
      caption: `${site.doctor.fullName}, ${site.doctor.jobTitle.toLowerCase()} em ${addr.city}-${addr.stateCode}`,
    },
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
    {
      '@type': 'BreadcrumbList',
      '@id': `${siteUrl}/#breadcrumb`,
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: `${siteUrl}/` }],
    },
    {
      '@type': 'FAQPage',
      '@id': `${siteUrl}/#faq`,
      inLanguage: site.locale,
      isPartOf: { '@id': `${siteUrl}/#webpage` },
      mainEntity: site.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
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
function buildHead({ title, description, canonical, jsonLd, local = false }) {
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
    local ? `<meta name="keywords" content="${esc(site.seo.keywords.join(', '))}">` : '',
    `<meta name="author" content="${esc(site.doctor.fullName)}">`,
    `<meta name="theme-color" content="${site.themeColor}">`,
    `<meta name="color-scheme" content="light">`,
    `<meta name="format-detection" content="telephone=no">`,
    // Sinais de geolocalizacao para busca local.
    local ? `<meta name="geo.region" content="${addr.country}-${addr.stateCode}">` : '',
    local ? `<meta name="geo.placename" content="${esc(addr.city)}">` : '',
    local ? `<meta name="geo.position" content="${geo.lat};${geo.lng}">` : '',
    local ? `<meta name="ICBM" content="${geo.lat}, ${geo.lng}">` : '',
    // Open Graph.
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(site.business.name)}">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:image" content="${hero.url}">`,
    `<meta property="og:image:type" content="image/webp">`,
    `<meta property="og:image:width" content="${hero.w}">`,
    `<meta property="og:image:height" content="${hero.h}">`,
    `<meta property="og:image:alt" content="${esc(site.doctor.fullName)}, ${esc(site.doctor.jobTitle.toLowerCase())} em ${esc(addr.city)}-${addr.stateCode}">`,
    // Twitter/X.
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${hero.url}">`,
    // Icones + manifest (o Google exige favicon para exibir o icone na SERP mobile).
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="mask-icon" href="/favicon.svg" color="${site.themeColor}">`,
    `<link rel="manifest" href="/site.webmanifest">`,
    // LCP: o hero comeca a baixar junto com o HTML.
    local ? `<link rel="preload" as="image" href="${hero.path}" fetchpriority="high">` : '',
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
const css = await readCss([
  'src/styles.css',
  'src/photos.css',
  'src/credentials.css',
  'src/env-ui.css',
  'src/motion.css',
]);
const privacyCss = await readCss(['src/styles.css', 'src/env-ui.css', 'src/privacy.css', 'src/motion.css']);

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

// Fora da home, as ancoras do menu (#sobre, #cuidados...) precisam voltar para
// a raiz — senao viram links mortos para secoes que nao existem em /privacidade.
const toHomeAnchors = (s) => s.replaceAll('href="#', 'href="/#');

// O separador precisa ficar fora do esc(), senao o "&" de &middot; e escapado
// e a entidade aparece literal na pagina. O separador da esquerda tambem entra
// aqui para nao sobrar solto quando o CRM estiver vazio.
const crmLine = site.doctor.crm
  ? ` &middot; <span class="crm">${[site.doctor.crm, site.doctor.rqe].filter(Boolean).map(esc).join(' &middot; ')}</span>`
  : '';

/** Substituicoes comuns as duas paginas (NAP, links, imagens). */
function fill(tpl) {
  let out = tpl
    .replaceAll('__ANALYTICS_HEAD__', analyticsHead)
    .replaceAll('__MOTION_HEAD__', motionHead)
    .replaceAll('__MOTION_BODY__', motionBody)
    .replaceAll('__ENV_BADGE__', envBadge)
    .replaceAll('__BODY_ATTR__', bodyAttr)
    .replaceAll('__CONSENT_BANNER__', consentBanner)
    .replaceAll('__PRIVACY_PATH__', pv.path)
    .replaceAll('__PRIVACY_LABEL__', esc(pv.linkLabel))
    .replaceAll('__CRM__', crmLine)
    .replaceAll('__PHONE_DISPLAY__', esc(phone.display))
    .replaceAll('__PHONE_E164__', phone.e164)
    .replaceAll('__WHATSAPP_URL__', `https://wa.me/${phone.e164.replace('+', '')}?text=${encodeURIComponent(site.business.whatsappText)}`)
    .replaceAll('__OPENING_HOURS__', hoursText ? `<span><b>Horário:</b> ${esc(hoursText)}</span>` : '')
    .replaceAll('__ADDRESS_FULL__', esc(fullAddress))
    .replaceAll('__ADDRESS_STREET__', esc(addr.street))
    .replaceAll('__ADDRESS_CITY__', esc(`${addr.district}, ${addr.city}-${addr.stateCode}`))
    .replaceAll('__MAP_URL__', esc(mapUrl))
    .replaceAll('__AREA_SERVED__', site.business.areaServed.map((c) => `<li>${esc(c)}</li>`).join(''))
    // Comentario de HTML tambem nao e informacao para o navegador. Este replace
    // cobre os marcadores <!--#shell:nome--> (que ja foram consumidos pelo
    // shell(), sobre o `html` cru, antes de chegar aqui) e, de quebra, libera o
    // site.html para ser comentado como todo o resto do projeto — sem os
    // comentarios pesarem no HTML de cada visita.
    .replace(/<!--[\s\S]*?-->/g, '');

  for (const [name, img] of Object.entries(images)) {
    const token = `__${name.toUpperCase().replaceAll('-', '_')}__`;
    out = out.replaceAll(token, `src="${img.path}" width="${img.w}" height="${img.h}"`);
  }
  return out;
}

const page = fill(
  typeWords(html)
    .replace('/*__STYLES__*/', css)
    .replaceAll('__HEAD_SEO__', headSeo)
    .replaceAll('__SERVICE_CARDS__', serviceCards)
    .replaceAll('__CREDENTIAL_ITEMS__', credentialCards)
    .replaceAll('__FAQ_LIST__', faqList),
);

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

for (const [label, out] of [['index.html', page], [`${pv.path}/index.html`, privacyPage]]) {
  const leftovers = out.match(/__[A-Z_]+__|\/\*__STYLES__\*\/|<!--\/?#shell:/g);
  if (leftovers) throw new Error(`${label}: placeholders nao substituidos: ${[...new Set(leftovers)].join(', ')}`);
}

// A partir daqui nao ha mais nada que possa falhar por conteudo — so agora
// dist/ e recriado (ver comentario no topo).
await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
await mkdir(`dist${pv.path}`, { recursive: true });
for (const name of imageNames) await copyFile(`assets/${name}.webp`, `dist/assets/${name}.webp`);

// Pre-comprime para o nginx servir via gzip_static.
await writeFile('dist/index.html', page);
await writeFile('dist/index.html.gz', gzipSync(Buffer.from(page), { level: 9 }));
await writeFile(`dist${pv.path}/index.html`, privacyPage);
await writeFile(`dist${pv.path}/index.html.gz`, gzipSync(Buffer.from(privacyPage), { level: 9 }));

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

  // /privacidade entra indexavel de proposito: pagina de privacidade visivel e
  // sinal de confianca que o Google valoriza em site de saude (YMYL), e ela nao
  // compete por nenhuma busca que interessa. Prioridade baixa e changefreq anual
  // porque o texto so muda quando o site muda. lastmod vem de privacy.updated —
  // a data do documento, nao a do build.
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
      name: site.business.name,
      short_name: site.business.shortName,
      description: site.seo.description,
      lang: site.locale,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#fbf8f3',
      theme_color: site.themeColor,
      icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    },
    null,
    2,
  ),
);

await writeFile(
  'dist/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${site.themeColor}"/><circle cx="32" cy="32" r="25" fill="none" stroke="#c78f98" stroke-width="1.5"/><text x="32" y="41" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="26" letter-spacing="1" fill="#fbf8f3">CM</text></svg>`,
);

// Pagina 404 real: sem ela o nginx devolveria o index com status 200 em qualquer
// URL inexistente (soft 404), o que o Google trata como erro de qualidade.
await writeFile(
  'dist/404.html',
  `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Página não encontrada | ${esc(site.business.shortName)}</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;text-align:center;padding:32px;background:#fbf8f3;color:#30272a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}h1{font:500 clamp(32px,6vw,52px)/1.1 Georgia,serif;color:${site.themeColor};margin:0 0 14px}p{color:#75696c;max-width:420px;margin:0 auto 26px;line-height:1.7}a{display:inline-block;background:${site.themeColor};color:#fff;text-decoration:none;padding:15px 24px;border-radius:999px;font-weight:700;font-size:14px}</style></head><body><main><h1>Página não encontrada</h1><p>O endereço que você acessou não existe ou foi movido. Volte para a página inicial para conhecer o atendimento da ${esc(site.doctor.fullName)}.</p><a href="/">Ir para a página inicial</a></main></body></html>`,
);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`dist/index.html    ${kb(Buffer.byteLength(page))} (gz ${kb((await stat('dist/index.html.gz')).size)})`);
console.log(
  `dist${pv.path}/    ${kb(Buffer.byteLength(privacyPage))} (gz ${kb((await stat(`dist${pv.path}/index.html.gz`)).size)})`,
);
console.log(`dist/assets/       ${imageNames.length} imagens`);
// Fica no resumo porque e um numero de orcamento, nao curiosidade: e quando a
// manchete termina de ser escrita. Ver docs/SEO.md, §7.2.
console.log(`manchete           ${(typedTotalMs / 1000).toFixed(2)}s de escrita`);
console.log(`site url           ${siteUrl}`);
console.log(`ambiente           ${siteEnv}${isProd ? ' (indexavel)' : ' (noindex + robots.txt Disallow)'}`);
console.log(`analytics          ${gaId ? `${gaId}${isProd ? '' : ' + debug_mode'}` : 'desligado (GA_MEASUREMENT_ID vazio)'}`);
if (!site.doctor.crm) console.warn('AVISO: src/site-data.js -> doctor.crm vazio (exigido pelo CFM na publicidade medica).');
