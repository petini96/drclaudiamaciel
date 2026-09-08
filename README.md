# Site — Dra. Claudia Maciel

Landing page para a Dra. Claudia Maciel (Ginecologista & Obstetra, Bonito/MS).

Duas rotas: a home (`/`), de página única, e a política de privacidade
(`/privacidade`), que fica separada porque o texto é longo o bastante para
diluir a relevância da home e porque uma URL estável é exigida por Meta Ads e
Google Ads. As duas compartilham header, rodapé e o script do menu, recortados
de `site.html` pelos marcadores `<!--#shell:nome-->`.

O build gera HTML estático (`dist/index.html` e `dist/privacidade/index.html`)
com o CSS embutido e as imagens `.webp` servidas como arquivos reais em
`dist/assets/`. Em produção, um nginx alpine serve os arquivos e o **Traefik**
faz o TLS e o roteamento.

## Estrutura

```
site.html                              markup (fonte da verdade do layout)
src/site-data.js                       NAP, SEO, serviços, FAQ e política de privacidade
src/styles.css, src/photos.css         estilos, injetados em /*__STYLES__*/
src/env-ui.css                         selo de ambiente e aviso de cookies (as duas páginas)
src/privacy.css                        visual de /privacidade (só nessa página)
assets/*.webp                          imagens, copiadas para dist/assets/
build.mjs                              gera dist/ (html, meta tags, JSON-LD, robots, sitemap, manifest, 404)
scripts/dev.mjs                        servidor local com rebuild automático (npm run dev)
Dockerfile                             multi-stage: node (build) -> nginx (runtime)
deploy/nginx.conf                      server block do nginx
deploy/traefik/drclaudiamaciel.yml     rota do Traefik em produção
deploy/traefik/drclaudiamaciel-hom.yml rota do Traefik em homologação (Basic Auth)
docker-compose.yml                     o mesmo para os dois ambientes; o que muda vive no .env
.env.example / .env.hom.example        variáveis de produção / de homologação
docs/SEO.md                            consolidado das decisões de SEO
docs/HOMOLOGACAO.md                    ambiente hom.* e as camadas contra indexação
docs/ANALYTICS.md                      GA4, Consent Mode v2 e LGPD
```

`dist/` é gerado e **não** vai para o git.

## Ambientes

| | Produção | Homologação | Local |
|---|---|---|---|
| Onde | `drclaudiamaciel.com.br` | `hom.drclaudiamaciel.com.br` | `127.0.0.1:8091` |
| Branch | `main` | `hom` | qualquer |
| `SITE_ENV` | `prod` | `hom` | `dev` (automático) |
| Indexável | sim | não | não |
| Acesso | público | Basic Auth | — |

`SITE_ENV` é a única chave: ele decide o `meta robots`, o `robots.txt`, se o
`sitemap.xml` é gerado, o selo visível de ambiente e o `debug_mode` do GA4.
O build **falha** se `SITE_ENV=prod` for combinado com uma `SITE_URL` de
homologação — o acidente que faria o Google indexar `hom.*` como conteúdo
duplicado do site real.

Detalhes de deploy, DNS e senha: **[docs/HOMOLOGACAO.md](docs/HOMOLOGACAO.md)**.

## Desenvolvimento

```bash
npm run dev
```

Sobe em <http://127.0.0.1:8091>, com **rebuild automático** ao salvar `site.html`, `src/` ou
`assets/` — é só recarregar a página. Para trocar a porta: `PORT=3000 npm run dev`.

O servidor espelha o `deploy/nginx.conf`: só `/` devolve o index, qualquer outra rota cai em
404 de verdade, e os `Content-Type` são os mesmos de produção. Não há dependências — é um
`node:http` de ~70 linhas em `scripts/dev.mjs`.

Se o build falhar (por exemplo, um token `__NOME__` sem substituição), o erro aparece no
terminal e o `dist/` anterior é preservado — o site local continua no ar até você corrigir.

O `npm run dev` roda como `SITE_ENV=dev`: `noindex`, com o selo de ambiente e sem Google
Analytics. Para conferir outro ambiente localmente:

```bash
SITE_ENV=prod npm run dev                                    # o HTML exato de produção
SITE_ENV=hom GA_MEASUREMENT_ID=G-XXXXXXXXXX npm run dev      # com o aviso de cookies e o GA
```

### Só gerar o `dist/`

```bash
npm run build
```

Dá para abrir o `dist/index.html` direto no navegador (as imagens usam caminho relativo),
mas aí o favicon e o manifest não carregam — eles usam caminho absoluto (`/favicon.svg`), que
só resolve sob um servidor. Para conferir o site de verdade, use o `npm run dev`.

Para editar **conteúdo indexável** (título, descrição, serviços, FAQ, endereço, telefone),
mexa em `src/site-data.js`. Para layout, em `site.html`; para estilos, em `src/styles.css` /
`src/photos.css`; para trocar fotos, substitua os `.webp` em `assets/` mantendo o nome.
Os tokens `__NOME__` são validados no build: se algum sobrar sem substituição, o build falha.

---

## SEO

> Consolidado completo das melhorias, com o antes/depois e o porquê de cada decisão:
> **[docs/SEO.md](docs/SEO.md)**.

Toda a camada de SEO é **gerada no build** a partir de `src/site-data.js`, para que os dados
estruturados nunca divirjam do que está visível na página (divergência é motivo de perda de
rich result no Google).

### O que o build produz

| Saída | Para quê |
|---|---|
| `<title>` + `meta description` | *Snippet* na SERP, otimizado para "ginecologista em Bonito MS" |
| `link rel=canonical` | Uma única URL indexável, sem duplicação |
| `meta robots` com `max-image-preview:large` | Habilita a miniatura grande no resultado |
| Open Graph + Twitter Card | Prévia com imagem no WhatsApp, Instagram, Facebook e X |
| `geo.region` / `geo.position` / `ICBM` | Sinais de geolocalização para busca local |
| JSON-LD (`@graph`) | `Physician` + `MedicalClinic` + `LocalBusiness`, `Person`, `WebSite`, `WebPage`, `ImageObject`, `BreadcrumbList` e `FAQPage` |
| `sameAs` + `alternateName` | Liga o site aos perfis já indexados (Instagram, Doctoralia) na mesma entidade |
| `openingHoursSpecification` | Habilita o "aberto agora" na SERP; a linha visível de horário sai do mesmo array |
| `robots.txt` | Libera tudo + aponta o sitemap (inclusive para GPTBot / Google-Extended) |
| `sitemap.xml` | URL, `lastmod` e extensão *image sitemap* com as 5 fotos |
| `favicon.svg` + `site.webmanifest` | O Google exige favicon para exibir o ícone na SERP mobile |
| `404.html` | Evita *soft 404* (ver nginx abaixo) |

### Performance (Core Web Vitals)

As imagens deixaram de ser embutidas em base64 e passaram a ser arquivos reais. Isso
resolve três coisas de uma vez: o Google Images só indexa URLs reais, `og:image` exige URL
absoluta, e **o HTML caiu de ~238 KB para ~36 KB** (9 KB com gzip), o que adianta o First
Contentful Paint.

Além disso: `preload` do hero com `fetchpriority="high"` (LCP), `loading="lazy"` nas demais,
`width`/`height` em todas as imagens (CLS zero), e o CSS do Google Fonts carregado sem
bloquear a renderização.

### Acessibilidade

O acordeão do FAQ usa `<details>`/`<summary>` nativo — navegável por teclado, sem JS, e com
o texto sempre no DOM para o crawler. Há *skip link*, `aria-expanded` no menu, marcos
semânticos (`<address>`, `<ol>`, `<nav aria-label>`) e `prefers-reduced-motion`.

### Ancoragem de entidade (`sameAs`)

`doctor.profiles` vira `sameAs` no JSON-LD. É assim que o Google entende que este site, o
Instagram e o perfil do Doctoralia são **a mesma pessoa**, e concentra a autoridade numa
única entidade em vez de espalhá-la. Reforçando isso, o JSON-LD declara o nome de registro
(*Claudia Estela Maciel Davalos*) como `alternateName` — é por ele que os diretórios médicos
indexam, enquanto as pacientes buscam por "Dra. Claudia Maciel".

**Só inclua URL conferida** — `sameAs` apontando para link quebrado atrapalha em vez de
ajudar. Faltam colar (as URLs aparecem truncadas na busca do Google; abra o perfil e copie
da barra de endereço): `agenda.app.br`, `BoaConsulta` e o link do Google Business Profile
(Maps → Compartilhar → Copiar link).

**Por que não há links visíveis para Doctoralia/BoaConsulta na página:** `sameAs` já entrega
todo o benefício de consolidação de entidade, e é invisível. Um link visível para esses
diretórios mandaria justamente a visitante com intenção de agendar para o funil de um
terceiro — que cobra pela consulta e fica com o relacionamento. Instagram é diferente: é
propriedade dela, e continua linkado no rodapé.

### ⚠️ Pendências antes de ir para produção

1. **Corrigir o telefone no Google Business Profile** — o perfil exibe (67) 98446-1107, mas o
   número correto é o (67) 99250-5165 que está no site. Enquanto os dois divergirem, o NAP
   fica inconsistente exatamente no par que o Google mais compara em busca local.
2. **Corrigir o bairro no Doctoralia** — lá consta "Alvorada"; o correto é "Centro", como no
   Google Business Profile e neste site.
3. **Remover/atualizar o consultório de Campo Grande no Doctoralia** — o perfil ainda lista
   um segundo endereço (Clovis Bevilaqua, 36) que não está mais em uso.
4. **Coordenadas** (`business.geo`) — é o único dado ainda aproximado (centro de Bonito-MS).
   Pegue as exatas no Google Maps: botão direito no ponto → copiar coordenadas.
5. **Revisar serviços e FAQ** (`services`, `faq`) — os textos foram ampliados com termos de
   busca ("pré-natal", "exames preventivos", "reposição hormonal", "laser íntimo", extraídos
   da própria bio do Instagram) e há uma pergunta nova sobre reposição hormonal. Confirme
   que descrevem exatamente o que é oferecido.

Já conferidos e gravados: CRM/MS 5944, RQE 4352, endereço completo com CEP 79290-000,
horário Seg–Sex 8h–12h e 14h–18h.

### Fora do código (o que mais move o ponteiro em busca local)

O site é só metade do trabalho. Para aparecer no mapa e no pacote local do Google:

1. **Google Business Profile** — criar/reivindicar o perfil, com o **mesmo** nome, endereço
   e telefone (NAP) que estão em `src/site-data.js`. É o maior fator isolado de SEO local.
2. **Google Search Console** — verificar o domínio e enviar
   `https://drclaudiamaciel.com.br/sitemap.xml`.
3. **Avaliações** — hoje há **1 avaliação** (5,0) no Google. É o ponto mais fraco do perfil e
   o de maior retorno: pedir avaliação a cada paciente atendida move mais o ranking local do
   que qualquer ajuste de código. (Não dá para declarar `aggregateRating` no JSON-LD sem as
   avaliações estarem na própria página — e review próprio de LocalBusiness é contra as
   diretrizes do Google.)
4. **Citações NAP** consistentes em Doctoralia, BoaConsulta e agenda.app.br — ver as
   divergências listadas em "Pendências" acima.
5. **Conteúdo novo e recorrente** — um blog com artigos (ex.: "pré-natal em Bonito",
   "quando fazer o preventivo") é o caminho para ranquear em cauda longa. O caminho para
   isso já existe: `/privacidade` mostra como acrescentar uma rota (bloco `<!--#shell:-->`
   em `site.html`, entrada no `location` do nginx e no `sitemap.xml`).

---

## Deploy em produção

O Traefik desta infra roda com `network_mode: host` e usa o **file provider**
(`/etc/traefik/dynamic/`), apontando para serviços em `127.0.0.1:PORTA`. O container do
site segue esse padrão: publica só no loopback, na porta **8091**.

**1. Subir o container** (no servidor, dentro do repositório clonado):

```bash
cp .env.example .env && docker compose up -d --build
```

**2. Registrar a rota no Traefik** (uma única vez):

```bash
sudo cp deploy/traefik/drclaudiamaciel.yml /home/deployer/infra/traefik/dynamic/
```

O Traefik está com `providers.file.watch=true`, então a rota entra sem restart. O
certificado é emitido pelo resolver `le` (TLS-ALPN) e o redirect HTTP→HTTPS já é global no
entrypoint `web`. O arquivo também aplica **HSTS** (`stsPreload`) — só mantenha
`stsIncludeSubdomains` se todos os subdomínios forem HTTPS.

**3. Conferir:**

```bash
curl -I https://drclaudiamaciel.com.br
```

### DNS

Antes do passo 2, aponte os registros `A` de `drclaudiamaciel.com.br` e
`www.drclaudiamaciel.com.br` para o IP do servidor. O ACME TLS-ALPN precisa do DNS já
resolvendo para emitir o certificado. `www` é redirecionado 301 para o domínio raiz.

### Cache

| Rota | `Cache-Control` |
|---|---|
| `/` (HTML) | `max-age=300, must-revalidate` |
| `/assets/*` | `max-age=31536000, immutable` |
| `favicon.svg`, `site.webmanifest` | `max-age=604800` |
| `robots.txt`, `sitemap.xml` | `max-age=86400` |

O HTML aparece atualizado em até 5 minutos. Como as imagens são imutáveis por um ano,
**trocar uma foto mantendo o mesmo nome de arquivo não invalida o cache do navegador de
quem já visitou** — renomeie o `.webp` (e a referência em `site.html`) ao substituir uma
imagem.

### 404

Qualquer URL fora das duas rotas do site (`/` e `/privacidade`) devolve **404 de verdade**
com `dist/404.html`. Antes, o `try_files $uri /index.html` devolvia o index com status 200
em qualquer endereço, o que o Google classifica como *soft 404* e trata como erro de
qualidade.

`/privacidade` tem um `location =` próprio no nginx apontando para
`dist/privacidade/index.html`. É de propósito: sem ele, o módulo `index` responderia um 301
para acrescentar a barra final, e o canonical da página é `/privacidade`, sem barra.
O `scripts/dev.mjs` faz o mesmo mapeamento, para o local não divergir de produção.

### Atualizar o site

```bash
git pull && docker compose up -d --build
```

### Trocar a porta ou o domínio

Porta: `HOST_PORT` no `.env` **e** a `url` do serviço em
`deploy/traefik/drclaudiamaciel.yml`.
Domínio: `SITE_URL` no `.env` (usado no canonical, Open Graph, JSON-LD, `robots.txt` e
`sitemap.xml`), as regras `Host()` e o middleware de www no mesmo arquivo do Traefik, **e**
o `map $host $robots_tag` em `deploy/nginx.conf` — só os hosts listados ali ficam
indexáveis; qualquer outro recebe `noindex`. Um domínio de produção novo que não entre
nesse `map` sobe funcionando, mas nunca é indexado.

---

## Analytics e LGPD

> Propriedades do GA4, Consent Mode v2, eventos medidos e como conferir a integração:
> **[docs/ANALYTICS.md](docs/ANALYTICS.md)**.

O Measurement ID não fica no código: entra por `GA_MEASUREMENT_ID` no `.env`. Vazio, o
site sobe sem nenhuma linha de Google Analytics — e sem o aviso de cookies, já que não
haveria nada a consentir. Produção e homologação usam **propriedades diferentes** do GA4,
para que os eventos de teste não entrem nos relatórios reais.

O consentimento roda em modo básico: os sinais do Consent Mode v2 são declarados como
negados e o `gtag.js` só é baixado depois do aceite. Quem recusa não gera nenhuma
requisição para o Google.

⚠️ O texto da política de privacidade (`site.privacy`, em `src/site-data.js`) descreve o
que o site tecnicamente faz **hoje**. Revise com a Dra. Claudia — e, se possível, com
assessoria jurídica — antes de ir para produção, e atualize-o se entrar formulário, chat
ou pixel de anúncio.
