# Melhorias de SEO — Site Dra. Claudia Maciel

Consolidado de tudo que foi feito para melhorar o desempenho no Google orgânico, o que
ficou pendente e por quê. Documento de referência do projeto — o passo a passo de build e
deploy continua no [README.md](../README.md).

**Contexto:** landing page de página única, servida por nginx atrás do Traefik, em
`drclaudiamaciel.com.br`. Palavra-chave principal: *ginecologista em Bonito MS*.

---

## 1. Arquitetura de conteúdo

### `src/site-data.js` — fonte única de verdade (novo)

Antes, o conteúdo indexável estava espalhado pelo `site.html`. Agora NAP (nome, endereço,
telefone), dados de SEO, serviços e FAQ vivem num só arquivo, e o `build.mjs` gera a partir
dele: meta tags, JSON-LD, cards de serviço, lista de FAQ, `sitemap.xml`, `robots.txt` e o
`site.webmanifest`.

**Por que importa:** o Google exige que o conteúdo declarado no `FAQPage` esteja **visível na
página**. Mantendo os dois lados gerados da mesma fonte, é impossível eles divergirem — e
divergência custa o rich result. O mesmo vale para os horários, que alimentam ao mesmo tempo
o `openingHoursSpecification` e a linha visível no bloco de contato.

Há um teste embutido no build: se qualquer token `__NOME__` sobrar sem substituição, o build
falha em vez de publicar HTML quebrado.

---

## 2. Dados estruturados (JSON-LD)

O maior ganho isolado para busca local. Um `@graph` único no `<head>`, com sete nós:

| Nó | Conteúdo |
|---|---|
| `Physician` + `MedicalClinic` + `LocalBusiness` | Endereço postal, coordenadas, telefone, `hasMap`, especialidades, 9 cidades atendidas, 6 serviços, horários e ação de agendamento |
| `Person` | Dra. Claudia Maciel, cargo, CRM/RQE como `identifier`, `worksFor`, `knowsAbout` |
| `WebSite` / `WebPage` | Identidade do site, idioma, imagem principal, breadcrumb |
| `ImageObject` | Imagem principal com dimensões e legenda |
| `BreadcrumbList` | Trilha de navegação |
| `FAQPage` | 9 perguntas e respostas |

### Ancoragem de entidade (`sameAs` + `alternateName`)

O JSON-LD declara os perfis externos em `sameAs` e o nome de registro
(*Claudia Estela Maciel Davalos*) em `alternateName`.

**Por que importa:** os diretórios médicos indexam pelo nome de registro; as pacientes buscam
por "Dra. Claudia Maciel". Declarar os dois, mais os links dos perfis, é o que faz o Google
entender que tudo é **a mesma entidade** e concentrar a autoridade — em vez de espalhá-la
entre um site, um Instagram e três diretórios que ele trata como coisas diferentes.

Perfis já ligados (URL conferida): Instagram e Doctoralia.

**Decisão consciente — sem links visíveis para Doctoralia/BoaConsulta.** O `sameAs` já
entrega toda a consolidação de entidade, e é invisível. Um link visível para esses
diretórios mandaria justamente a visitante com intenção de agendar para o funil de um
terceiro, que cobra pela consulta e fica com o relacionamento. O Instagram é diferente: é
propriedade dela, e segue linkado no rodapé.

---

## 3. Meta tags e indexação

| Item | O que faz |
|---|---|
| `<title>` | `Ginecologista e Obstetra em Bonito-MS \| Dra. Claudia Maciel` (59 caracteres, não trunca) |
| `meta description` | 155 caracteres, com palavra-chave e chamada para ação |
| `link rel=canonical` | Uma única URL indexável, sem duplicação |
| `meta robots` | `index,follow` + `max-snippet:-1` + **`max-image-preview:large`** (habilita a miniatura grande no resultado) |
| Open Graph + Twitter Card | Prévia ao compartilhar no WhatsApp, Instagram, Facebook e X. A imagem é o **cartão de marca** (`assets/og-image.jpg`, 1200×630, JPEG) e não a foto do hero: quem recebe o link precisa reconhecer de quem é o site antes de ler o título |
| `geo.region`, `geo.position`, `ICBM` | Sinais de geolocalização para busca local |
| `favicon.ico` (16/32/48) + `icon-192/512.png` + `apple-touch-icon.png` + `site.webmanifest` | O Google **exige** favicon para exibir o ícone do site na SERP mobile |
| `logo` no `@graph` | Logotipo da entidade, separado do `image` (a foto da médica). É o campo que o Google usa para representar a marca no Knowledge Panel — uma fotografia ali sai cortada e sem leitura |
| Uma página por consultório | `/bonito` e `/ponta-pora`, cada uma com `title`, `h1`, endereço, mapa, horário, região e `LocalBusiness` próprios (ver "Duas cidades", abaixo) |

### Duas cidades (Bonito e Ponta Porã)

A Dra. Claudia atende em dois consultórios, e isso é uma decisão de arquitetura,
não só de conteúdo.

**O problema.** `title` e `h1` são os dois sinais mais fortes de intenção local, e
cada um só consegue mirar uma cidade. Uma página única disputando "ginecologista
em Bonito" **e** "ginecologista em Ponta Porã" divide o foco e tende a não
ranquear bem para nenhuma das duas — o Google não tem como decidir de qual
cidade a página é.

**A estrutura.**

| Rota | Papel | `title` | `LocalBusiness` no `@graph` |
|---|---|---|---|
| `/` | Hub da marca | "Ginecologista e Obstetra em Bonito e Ponta Porã-MS" | **os dois** |
| `/bonito` | Unidade | "Ginecologista e Obstetra em Bonito-MS \| Dra. Claudia Maciel" | só Bonito |
| `/ponta-pora` | Unidade | "Ginecologista e Obstetra em Ponta Porã \| Dra. Claudia Maciel" | só Ponta Porã |

A home declara **as duas** unidades para que o Google entenda que a entidade tem
dois endereços mesmo que a visitante nunca abra as páginas de cidade. Cada página
de cidade declara **só a sua** — incluir a outra diria ao Google que
`/ponta-pora` também é sobre Bonito, que é exatamente o que dilui as duas. Pelo
mesmo motivo, `geo.region`, `geo.position` e `keywords` são por página.

**O grafo.** Um `MedicalOrganization` (`#practice`) sem endereço, porque ele tem
dois, com `department` apontando para as duas unidades; cada unidade é
`Physician + MedicalClinic + LocalBusiness` com `branchOf`/`parentOrganization` de
volta; e um `Person` (a médica) com `workLocation` nas duas. É esse desenho que
diz "mesma marca, duas unidades" em vez de deixar o Google supor — ou pior,
tratá-las como dois negócios homônimos.

**Conteúdo duplicado.** Duas páginas de cidade montadas a partir do mesmo molde
com o nome trocado são conteúdo duplicado, e o Google escolhe uma só para
ranquear. Por isso cada uma tem texto escrito por extenso (`locations[].page` no
site-data), foto própria (`locations[].photo`) e perguntas frequentes próprias; e
por isso os serviços aparecem ali como lista compacta linkando para `/#cuidados`,
em vez de repetir as descrições completas em três URLs.

**Links internos.** A home linka para as duas; cada cidade linka para a outra e
de volta para a home; o rodapé, presente em todas as páginas, traz o NAP completo
das duas unidades e os dois links.

**Fora do código:** cada unidade precisa do **seu** Google Business Profile, com o
mesmo NAP do `site-data.js` e apontando para a sua página. Sem isso, a página da
cidade não entra no pacote local por melhor que seja.

### `sitemap.xml`

Gerado no build, com as 4 URLs do site e a extensão *image sitemap* — as 5 fotos são
declaradas explicitamente para o Google Imagens, e cada página de cidade declara a sua.
As páginas de cidade entram com prioridade 0.9, logo abaixo da home: são elas que disputam
"ginecologista em &lt;cidade&gt;".

```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://drclaudiamaciel.com.br/</loc>
    <lastmod>2026-09-05</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
    <image:image><image:loc>.../assets/claudia-hero.webp</image:loc></image:image>
    ... (5 imagens)
  </url>
</urlset>
```

O `lastmod` é a data de modificação mais recente entre `site.html` e `src/site-data.js`.

### `robots.txt`

Libera tudo, aponta o sitemap e libera explicitamente `GPTBot` e `Google-Extended` — buscar
em assistentes de IA já é canal de descoberta de paciente.

---

## 4. Conteúdo on-page

| Antes | Depois |
|---|---|
| H1: *"Sua saúde merece escuta, atenção e cuidado."* — **sem nenhum termo de busca** | H1 com "Ginecologista e Obstetra em Bonito-MS" antes da linha emocional |
| Título genérico | Título com palavra-chave principal + marca |
| Seção "Sobre" com 1 parágrafo | 3 parágrafos, cobrindo as fases de atendimento e a região |
| 4 perguntas no FAQ | **9 perguntas**, cobrindo cauda longa (frequência do preventivo, levar exames, ir menstruada, reposição hormonal, pré-natal) |
| Sem menção à região | Bloco visível com as 9 cidades atendidas + `areaServed` no JSON-LD |
| NAP só no rodapé | NAP em `<address>` no contato **e** no rodapé, com horário de atendimento |
| Sem CRM | CRM/MS 5944 · RQE 4352 no rodapé e no JSON-LD |

### Serviços realinhados ao foco clínico real

A bio do Instagram revelou especialidades que o site não cobria. Dois cards foram renomeados
e as descrições enriquecidas — sem copiar a linguagem promissória da bio, que a Res. CFM
1.974/2011 veda:

- "Climatério e menopausa" → **"Climatério, menopausa e reposição hormonal"**
- "Tecnologias ginecológicas" → **"Laser íntimo e tecnologias ginecológicas"**
- "Saúde íntima" ganhou "libido"

São termos de busca de alta intenção comercial que antes não existiam na página.

---

## 5. Performance (Core Web Vitals)

**Mudança estrutural: as imagens deixaram de ser embutidas em base64 e viraram arquivos
reais** em `dist/assets/`.

|  | Antes | Depois |
|---|---|---|
| `index.html` | 237,8 KB | **37,6 KB** |
| Transferido (gzip) | 173,2 KB | **9,8 KB** |

Resolve três coisas de uma vez:

1. O Google Imagens **só indexa URLs reais** — base64 não é indexável.
2. `og:image` e `twitter:image` **exigem URL absoluta** — a prévia no WhatsApp não funcionava.
3. O HTML chega ~18× menor, adiantando o First Contentful Paint.

Complementos:

- `preload` do hero com `fetchpriority="high"` → a imagem do LCP começa a baixar junto com o HTML
- `loading="lazy"` + `decoding="async"` nas 4 imagens abaixo da dobra
- `width`/`height` em **todas** as imagens, lidos direto do header WebP no build → **CLS zero**
- CSS do Google Fonts carregado sem bloquear a renderização (com fallback `<noscript>`)

---

## 6. Infraestrutura (nginx / Traefik)

### Correção de *soft 404*

O `try_files $uri /index.html` devolvia **status 200 em qualquer URL inexistente**. O Google
classifica isso como *soft 404* e trata como erro de qualidade, podendo desindexar. Agora só
`/` devolve o index; qualquer outra rota retorna 404 real com uma página `404.html` própria
(marcada `noindex,follow`).

### Cache

| Rota | `Cache-Control` |
|---|---|
| `/` (HTML) | `max-age=300, must-revalidate` |
| `/assets/*` | `max-age=31536000, immutable` |
| `favicon.ico`, `apple-touch-icon.png`, `icon-*.png`, `site.webmanifest` | `max-age=604800` |
| `robots.txt`, `sitemap.xml` | `max-age=86400` |

> ⚠️ Como as imagens são imutáveis por um ano, **trocar uma foto mantendo o mesmo nome de
> arquivo não invalida o cache de quem já visitou**. Ao substituir uma imagem, renomeie o
> `.webp` e a referência no `site.html`.

### Outros

- `/favicon.ico` e `/apple-touch-icon.png` servidos de verdade na raiz, com `access_log off`
  (o navegador e o iOS pedem esses caminhos sozinhos; antes o `.ico` era um 301 para um SVG)
- Ícones da raiz **fora** do `immutable` de `/assets/`: trocar o logotipo não pode depender de
  cada visitante limpar o cache
- `gzip_types` sem `image/webp` (já é comprimido — gzipar só gastava CPU)
- **HSTS** no Traefik (`stsPreload`), eliminando o salto `http→https` na primeira visita
- Redirect 301 de `www` para o domínio raiz (já existia)

---

## 7. Acessibilidade e HTML semântico

Não são fatores diretos de ranqueamento, mas sustentam a *page experience* e a
rastreabilidade:

- FAQ migrado para `<details>`/`<summary>` nativo. O anterior era um `<button>` com `<p>`
  dentro — **HTML inválido** (`button` só aceita conteúdo de frase). Agora é navegável por
  teclado, sem JS, e o texto está sempre no DOM para o crawler.
- *Skip link*, `aria-expanded` no menu, `:focus-visible` visível
- `<address>` para o NAP, `<ol>` na jornada, `<ul>` nos selos, `<nav aria-label>`
- `scroll-margin-top` para o header fixo não cobrir o alvo das âncoras
- `prefers-reduced-motion` — respeitado em duas camadas: as durações são zeradas no CSS
  **e** o script que habilita as animações nem aplica a classe `motion` quando a
  preferência está ligada (ver §7.2)
- `rel="noopener"` em todos os `target="_blank"`
- Hierarquia de títulos correta: 1 `h1`, 7 `h2`, 9 `h3`

### Correções da auditoria de acessibilidade

O Lighthouse apontou dois audits reprovados. Ambos corrigidos.

**Contraste de cor** — WCAG AA exige 4,5:1 para texto normal:

| Onde | Antes | Depois |
|---|---|---|
| `.num` sobre branco | `#bdaeb1` — 2,13:1 | **`#827174` — 4,60:1** |
| `--muted` sobre `--blush` | `#75696c` — 4,36:1 | **`#6d6164` — 4,91:1** |

`--muted` é variável global: o ganho vale nos três fundos em que aparece — 4,91:1 sobre
blush, 5,59:1 sobre cream, 5,93:1 sobre branco. O `#75696c` anterior reprovava por
0,14 de margem, o tipo de falha que passa despercebida em revisão visual.

**Nome acessível divergente do texto visível** (`label-content-name-mismatch`). Quem usa
comando de voz fala o que **vê** na tela; se o `aria-label` não contém o texto visível, o
comando não encontra o elemento.

| Elemento | Problema | Correção |
|---|---|---|
| Link do Instagram | texto visível `@draclaudiamaciel`, nome acessível `"Instagram da Dra. Claudia Maciel"` | `aria-label="@draclaudiamaciel no Instagram"` |
| Logo `.brand` | label cobria só o nome, não o cargo e a cidade que também estão visíveis | `aria-label` removido — o texto visível já nomeia o link |

> Este audit tem **peso 0** no Lighthouse: corrigi-lo não altera a nota. Foi corrigido
> porque o problema para o usuário é real, não porque pontuava.

### 7.1 Seção "Formação e atuação" (E-E-A-T)

Saúde é **YMYL** (*Your Money or Your Life*), a categoria em que o Google pesa mais
credencial verificável. Antes desta seção, os únicos sinais de autoridade da página eram o
CRM no rodapé e o texto de apresentação — nada que o algoritmo (ou a paciente) pudesse
conferir. A seção `#formacao` expõe registro profissional, título de especialista, áreas de
atuação e local de atendimento, e alimenta `hasCredential` no nó `Person` do JSON-LD:

```
identifier    -> QUAL é o número (CRM/MS 5944, RQE 4352)
hasCredential -> o que ele SIGNIFICA e QUEM o reconhece (CRM-MS, CFM)
```

Os dois vêm do mesmo `site-data.js` que gera os cartões visíveis, então o dado estruturado
e o que a paciente lê nunca divergem — divergência entre os dois é penalizada.

**Duas coisas que não podem entrar nesta seção**, nem em nenhuma outra: **depoimento de
paciente** e **imagem de "antes e depois"**. As normas do CFM sobre publicidade médica
(Res. 1.974/2011 e atualizações) proíbem as duas. É a razão pela qual o site não tem — e
não deve ganhar — uma seção de depoimentos, apesar de ser o padrão em landing page de
serviço. Credencial inflada ou não conferível tem o mesmo problema, com o agravante de
derrubar a confiança do domínio inteiro na busca.

### 7.2 Animações sem custo de SEO

A regra que sustenta tudo em `src/motion.css`: **nenhum conteúdo começa invisível no HTML
entregue.** O estado inicial das revelações (`opacity:0`) só existe descendo de
`html.motion`, e essa classe é aplicada por um script inline no `<head>`. Sem JS, com JS
quebrado ou com "reduzir movimento" ligado no sistema, a classe nunca aparece e a página
renderiza inteira. Se o `opacity:0` morasse direto no CSS, todo o conteúdo abaixo da dobra
chegaria ao Googlebot oculto — o tipo de sinal que num site de saúde não vale o risco.

Sobre Core Web Vitals:

| Métrica | Cuidado tomado |
|---|---|
| **LCP** | A entrada do hero é só `transform`, nunca `opacity` — o Chrome ignora elementos com `opacity:0` ao eleger o Largest Contentful Paint, então um fade empurraria a métrica para o fim da animação. `translate`/`scale` não afetam a medição: os pixels são pintados no primeiro frame. **Exceção: o `<h1>`** (ver abaixo). |
| **CLS** | Nada anima propriedade de layout. O header ganha sombra no scroll, não altura. O aviso de cookies é `position:fixed`. |
| **INP** | Zero listener de `scroll`. A sombra do header vem de um sentinela de 1px observado por `IntersectionObserver`, e cada elemento revelado sofre `unobserve` em seguida. |
| **Peso** | +3,1 KB gzipped na home (a maior parte é a seção nova, não a animação); +0,3 KB em `/privacidade`. Nenhuma requisição nova: o CSS é inline e o JS são duas peças de ~700 B. Os comentários de CSS e de HTML agora são removidos no build, o que devolveu ~4 KB por página. |

#### A manchete "escrita" e o LCP

As palavras do `<h1>` aparecem em sequência, com um cursor que salta de uma para a outra
(uma vez por carregamento). É a única animação do site que usa `opacity` num elemento de
conteúdo do hero, e foi uma decisão consciente:

- **O texto completo está no HTML entregue.** O `build.mjs` (`typeWords`) só envolve cada
  palavra num `<span>` com o índice em `--w`; o CSS controla *quando* cada uma fica
  visível. Escrever o H1 com JS deixaria o elemento mais importante da página para o Google
  dependente de script para existir.
- **O elemento de LCP desta página é a foto do hero**, não a manchete — ela é maior em todos
  os breakpoints, continua `preload`ada com `fetchpriority="high"` e não tem fade nenhum.
  A animação da manchete, portanto, não entra na medição.
- **A manchete inteira termina em ~1,8 s** (a última palavra começa a aparecer em 1,62 s,
  mais 0,22 s de fade). Mesmo no cenário pessimista em que ela fosse o elemento de LCP, o
  valor fica dentro da faixa "boa" (< 2,5 s). O `npm run build` **imprime esse número a
  cada rodada** (`manchete  1.62s de escrita`), justamente para ele não crescer sem
  ninguém ver.
- **O atraso é absoluto a partir do primeiro paint, e corre em paralelo com a rede.** Ele
  só pode ser o gargalo quando a conexão é rápida — e aí 1,8 s é um LCP bom. Numa conexão
  lenta, quem manda é o download da foto, e a animação não custa nada.

O ritmo não é constante: cada palavra recebe do build o seu próprio tempo, derivado do
número de letras mais uma hesitação depois de vírgula ou ponto, com um desvio de ±14%
determinístico (derivado das letras da própria palavra, para o build seguir reproduzível).
Cadência fixa era o que fazia o efeito parecer máquina. Os parâmetros são `CHAR_MS`,
`WORD_MS`, `PAUSE` e `LEAD_MS` no `build.mjs` — **não** no CSS, para não haver a mesma
constante em dois arquivos.

> ⚠️ Se a foto sair do hero, ou se a manchete crescer muito, isto precisa ser reavaliado —
> aí ela passa a ser candidata a LCP e a animação entra na conta. O aviso está repetido no
> comentário de `src/motion.css`, onde quem for mexer vai olhar.

**Alvo do *skip link*** — `#inicio` é uma `<section>`, elemento não focável. Chrome e
Firefox movem o ponto de partida da tabulação assim mesmo, mas Safari antigo e alguns
leitores de tela não; sem isso, o Tab seguinte volta para o header e o skip link não
cumpre a função. Recebeu `tabindex="-1"`. Como o CSS usa `:focus-visible` e não `:focus`,
o foco programático não desenha contorno — nenhum ajuste de estilo foi necessário.

---

## 8. Validação executada

- JSON-LD parseia e tem os 7 nós esperados
- **Todas as 9 respostas do `FAQPage` conferidas como visíveis na página** (requisito do Google)
- Todas as imagens com `src`, `alt`, `width` e `height`
- Sem overflow horizontal em 1440px, 1280px e 375px
- Menu mobile, acordeão do FAQ e âncoras testados; sem erros de console
- Rotas conferidas: `/` 200, `robots.txt` 200, `sitemap.xml` 200,
  `site.webmanifest` 200 (`application/manifest+json`), `favicon.ico` / `apple-touch-icon.png` /
  `icon-192.png` / `icon-512.png` / `assets/og-image.jpg` 200, URL inexistente **404**

### Lighthouse (desktop, headless, contra o `dist/` servido localmente)

| Categoria | Antes | Depois |
|---|---|---|
| Performance | 98 | **100** |
| Acessibilidade | 95 | **100** |
| Best Practices | 100 | **100** |
| SEO | 100 | **100** |

FCP 0,9 s · LCP 0,9 s · TBT 0 ms · CLS 0,001 · Speed Index 0,9 s.

Os 5 pontos de acessibilidade vinham **inteiramente** do contraste de cor: peso total
pontuável 146, obtido 139, e `color-contrast` pesa exatamente 7.

> **O 100 em acessibilidade não significa "acessível".** Dos 76 audits da categoria, 19
> passaram, 45 são "não aplicáveis" (o site não tem tabelas, `<video>` nem a maior parte
> dos padrões ARIA) e **10 são manuais** — o Lighthouse declara que não consegue
> verificá-los: ordem lógica de tabulação, ordem visual seguindo o DOM, foco preso em
> região, foco direcionado a conteúdo novo, rótulo e role de controles customizados.
> Automação cobre cerca de um terço da WCAG. Ver pendências na seção 9.

A variação de 98 para 100 em performance é ruído entre execuções, não ganho real — nada
de performance foi alterado nesta rodada.

Para reproduzir, o servidor precisa estar **no ar em outro terminal**: o Lighthouse CLI
abre uma instância própria do Chrome e não usa o servidor da sessão. Sem isso ele audita
a tela de erro do Chrome e devolve `chrome-error://chromewebdata/` com todas as
categorias zeradas.

```bash
npx lighthouse http://127.0.0.1:8091/ --preset=desktop --chrome-flags="--headless=new" --view
```

Rodando pela aba Lighthouse do DevTools, mantenha a janela da página em primeiro plano
durante o teste. Com o DevTools desacoplado em janela própria, o Chrome suspende a
renderização da aba em segundo plano e a auditoria falha com `NO_FCP` — "a página não
pintou conteúdo" — zerando as quatro categorias.

---

## 9. Pendências

### No código

1. **Coordenadas exatas** (`locations[].geo` em `src/site-data.js`) — as duas são o centro
   aproximado da cidade. Pegue no Google Maps: botão direito no ponto → copiar coordenadas.
   Ainda mais crítico em Ponta Porã: a unidade é nova e não tem perfil no Google Business
   para corrigir um pino no lugar errado.
2. **URLs de perfil faltantes** para `sameAs` — `agenda.app.br`, `BoaConsulta` e o link do
   Google Business Profile. Aparecem truncadas na busca; abra cada perfil e copie da barra de
   endereço. *Só inclua URL conferida: link quebrado em `sameAs` atrapalha em vez de ajudar.*
3. **Revisar serviços e FAQ** — confirmar que os textos ampliados descrevem exatamente o que
   é oferecido no consultório.
4. **Horários de Ponta Porã** (`locations[1].openingHours`) — vazio. Enquanto estiver, o
   `openingHoursSpecification` daquela unidade é omitido do JSON-LD e a página mostra
   "Consulte os horários pelo WhatsApp". É o comportamento correto — horário divergente do
   Google Business Profile prejudica mais do que a ausência dele —, mas é uma pendência:
   sem horário não há "aberto agora" na busca.
5. **Endereço, CEP e região de Ponta Porã** — o endereço veio por mensagem, o CEP é o geral
   da cidade e a `areaServed` foi montada por proximidade geográfica. Conferir os três com a
   Dra. Claudia e contra o Google Business Profile da unidade.
4. **Verificação manual de acessibilidade** — os 10 audits que o Lighthouse não
   automatiza (seção 8). O mais relevante aqui é o menu mobile (`#menuBtn` com
   `aria-expanded`): abrir pelo teclado, tabular dentro dele, fechar com `Esc` e conferir
   se o foco volta para o botão. Depois, percorrer a página inteira só de `Tab` e checar
   se a ordem acompanha a ordem visual.

### Divergências de NAP a corrigir fora do código

NAP inconsistente é o que mais trava SEO local:

| Onde | Problema | Correto |
|---|---|---|
| Google Business Profile | Telefone (67) 98446-1107 | **(67) 99250-5165** |
| Doctoralia | Bairro "Alvorada" | **Centro** |
| Doctoralia | Lista consultório em Campo Grande (Clovis Bevilaqua, 36) | **Remover** — só Bonito |

### Fora do código, por ordem de impacto

1. **Avaliações no Google** — hoje há **1 avaliação** (5,0). É o ponto mais fraco do perfil e o
   de maior retorno: pedir avaliação a cada paciente atendida move mais o ranking local do que
   qualquer ajuste de código daqui pra frente.
   *(Não dá para declarar `aggregateRating` no JSON-LD — as avaliações teriam de estar na
   própria página, e review próprio de `LocalBusiness` é contra as diretrizes do Google.)*
2. **Google Business Profile** — reivindicar e manter o NAP idêntico ao do site. É o maior
   fator isolado de SEO local.
3. **Google Search Console** — verificar o domínio e enviar
   `https://drclaudiamaciel.com.br/sitemap.xml`.
4. **Citações NAP** consistentes nos diretórios (tabela acima).
5. **Conteúdo novo e recorrente** — um blog ("pré-natal em Bonito", "quando fazer o
   preventivo", "reposição hormonal: quem pode fazer") é o caminho para cauda longa. Hoje o
   site é uma página única; publicar conteúdo exigiria acrescentar rotas.

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/site-data.js` | **novo** — NAP, SEO, serviços, formação e FAQ |
| `build.mjs` | Gera meta tags, JSON-LD, cards, formação, FAQ, sitemap, robots, manifest e 404; copia os ativos de marca; remove comentários do CSS no bundle |
| `scripts/gen-brand.mjs` | Gera logo, monograma, cartão de compartilhamento e ícones a partir de `assets/brand/logo-original.webp` (roda fora do build) |
| `site.html` | H1 com palavra-chave, conteúdo ampliado, HTML semântico e acessível; `aria-label` dos links corrigidos, `tabindex="-1"` no alvo do skip link; seção `#formacao` (§7.1) |
| `src/styles.css`, `src/photos.css` | Estilos dos novos elementos, foco visível, reduced-motion, contraste de cor em conformidade com WCAG AA |
| `src/credentials.css` | **novo** — visual da seção "Formação e atuação" |
| `src/motion.css` | **novo** — animações e micro-interações, sem custo de LCP/CLS/INP (§7.2) |
| `deploy/nginx.conf` | Cache por rota, 404 real, `/favicon.ico`, gzip ajustado |
| `deploy/traefik/drclaudiamaciel.yml` | HSTS |
| `.gitignore` | Ignora relatórios do Lighthouse (`lh/`, `*.report.html`, `*.report.json`) |
| `README.md` | Documentação de SEO, cache, 404 e pendências |
