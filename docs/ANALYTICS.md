# Google Analytics 4 e consentimento (LGPD)

O Measurement ID **não fica no código**. Ele entra pela variável
`GA_MEASUREMENT_ID` no build (`.env` → build arg do Docker → `build.mjs`). Sem a
variável, nenhuma linha de Google Analytics é injetada na página — nem o banner
de cookies, já que não haveria nada a consentir.

---

## Uma propriedade GA4 por ambiente

A hierarquia do GA4 é **Conta → Propriedade → Fluxo de dados** (é o fluxo que
tem o Measurement ID `G-XXXXXXXXXX`).

Homologação usa uma **propriedade separada**, não um fluxo a mais dentro da
propriedade de produção. Um fluxo novo na mesma propriedade despejaria os
eventos de teste nos mesmos relatórios do site real — e a partir daí todo
relatório precisaria de um filtro por hostname, para sempre. Propriedade
separada é grátis (o limite é 100 por conta), isola os dados por completo e
deixa o DebugView limpo para validar a integração.

### Criar a propriedade de homologação

1. GA4 → **Administrador** → **Criar** → **Propriedade**
2. Nome: `Dra. Claudia Maciel — Homologação` · fuso `(GMT-04:00) Campo Grande` · moeda BRL
3. Em **Fluxos de dados** → **Web** → URL `https://hom.drclaudiamaciel.com.br`
4. Copie o `G-XXXXXXXXXX` para `GA_MEASUREMENT_ID` no `.env` de homologação
5. Repita para produção, com a URL `https://drclaudiamaciel.com.br`

Em **Administrador → Retenção de dados**, suba de 2 para **14 meses** nas duas.
A política de privacidade da página declara 14 meses.

### DebugView

Com `SITE_ENV=hom`, o build liga `debug_mode: true` no `gtag('config')`. Os
eventos aparecem em tempo real em **Administrador → DebugView**, sem precisar da
extensão do Chrome. Em produção o `debug_mode` fica desligado — eventos de
debug não entram nos relatórios normais.

---

## Consent Mode v2 — modo "básico"

Antes de qualquer tag, a página declara os sinais de consentimento como negados:

```js
gtag('consent', 'default', {
  ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'granted', security_storage: 'granted'
});
```

E o `gtag.js` **só é baixado depois do aceite**. Quem recusa (ou ignora o aviso)
não gera nenhuma requisição para o Google — nem os *pings sem cookie* que o modo
avançado envia mesmo com o consentimento negado.

**Por que o modo básico e não o avançado.** O ganho do modo avançado é a
modelagem de conversões, que exige volume e integração com o Google Ads — nada
disso se aplica aqui. Em troca, ele transmite dados de quem não consentiu, o que
para o site de uma médica no Brasil é o lado errado da dúvida. De quebra, o modo
básico não custa um request de terceiro no carregamento inicial, o que ajuda nos
Core Web Vitals.

### Se um dia quiser o modo avançado

Em `build.mjs`, no bloco `analyticsHead`, mova para lá as três linhas que hoje
vivem dentro de `load()` no `consentBanner` — a criação da `<script>` do
`googletagmanager.com`, o `gtag('js', …)` e o `gtag('config', …)`. O `default`
negado continua onde está; o `gtag('consent','update')` do botão de aceite passa
a liberar os cookies de uma tag que já estava carregada.

---

## O que é medido

| Evento | Quando | Parâmetro |
|---|---|---|
| `page_view` | automático (Enhanced Measurement) | — |
| `scroll`, `click` em links externos | automático | — |
| `generate_lead` | clique em qualquer link `wa.me/*` ou `tel:*` | `method`: `whatsapp` ou `telefone` |

`generate_lead` é um **evento recomendado** do GA4, não um evento personalizado
— ganha relatório próprio sem configuração. Ele existe porque só há dois
caminhos de contato no site, e é o clique neles, não o `page_view`, que
representa a conversão do consultório.

Marque-o como conversão em **Administrador → Eventos → Marcar como evento-chave**.
E crie a dimensão personalizada `method` (escopo de evento) para separar
WhatsApp de telefone nos relatórios.

---

## O banner e a política de privacidade

- O texto do banner vive em `site.analytics.consent`, em `src/site-data.js`.
- A política é a página **`/privacidade`** (`dist/privacidade/index.html`),
  gerada de `site.privacy`. Um banner de cookies sem política acessível não
  cumpre a LGPD. O link para ela aparece em dois lugares: no rodapé de todas as
  páginas e dentro do próprio banner, **antes** do aceite — que é o "acesso
  facilitado e ostensivo" dos arts. 6º, VI e 9º da LGPD. A lei não exige o texto
  embutido na home, e o Guia Orientativo de Cookies da ANPD recomenda justamente
  este modelo em camadas.
- A escolha é gravada em `localStorage` (`cm-consent`), não em cookie: ela nunca
  sai do navegador de quem visitou.
- O botão **"Alterar minha preferência de cookies"**, no fim da política, apaga
  a escolha e traz o banner de volta — revogar precisa ser tão fácil quanto
  consentir (LGPD, art. 8º, §5º).

> ⚠️ O texto da política foi redigido a partir do que o site **tecnicamente faz
> hoje**: nenhum formulário, nenhum dado de saúde, só GA4 mediante
> consentimento. Se entrar um formulário, um chat ou um pixel de anúncio, o
> texto precisa mudar junto. Recomendado revisar com a Dra. Claudia e, se
> possível, com assessoria jurídica antes de ir para produção.

---

## Conferir a integração

Em `hom.drclaudiamaciel.com.br`, com o DevTools aberto:

1. **Antes de responder o aviso** — aba Network, filtro `googletagmanager`:
   deve estar **vazia**. `document.cookie` não deve conter `_ga`.
2. **Clique em "Aceitar"** — a requisição de `gtag/js?id=G-…` aparece, os
   cookies `_ga` e `_ga_*` são criados, e o `page_view` surge no DebugView.
3. **Clique no botão de WhatsApp** — `generate_lead` com `method: whatsapp`
   aparece no DebugView.
4. **Recarregue** — o aviso não volta e o GA carrega direto.
5. **Abra a política → "Alterar minha preferência de cookies"** — o aviso
   reaparece. Escolha "Recusar", recarregue: nenhuma requisição ao Google.
