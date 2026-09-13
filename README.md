# FlyTok

Laboratório virtual interativo sobre **design persuasivo**, construído em cima do conectoma **real**
de *Drosophila melanogaster* — os 139.248 neurônios que o FlyWire mapeou e publicou.

Uma mosca articulada em 3D vive numa bancada com um smartphone. Ela assiste a um feed infinito,
acumula dopamina, se entedia, curte com a pata, rola, sente fome, comenta, trabalha, compra coisas e
espera a entrega chegar. Nada disso é roteirizado: o que ela faz sai de um agente que aprende.

---

## Rodando

```bash
npm install
node scripts/build-connectome.mjs
npm run dev
```

O segundo comando baixa as anotações públicas do FlyWire (~32 MB) e gera `public/flywire/` — sem ele
o cérebro não aparece. Depois abra <http://localhost:3000> e clique em **Iniciar simulação** no menu.

## Deploy na Vercel

Importe o repositório e aceite os defaults. Não há banco nem variável de ambiente. Só garanta que
`public/flywire/connectome.bin` esteja commitado (ou rode o script no build), porque a Vercel não
executa `scripts/` sozinha.

---

## Menu principal e arquivo de save

O app abre no menu principal: **iniciar**, **pausar/retomar**, **salvar em arquivo** e **carregar
arquivo**. O botão `menu` no cabeçalho reabre o menu a qualquer momento (e pausa o mundo, para ele
não correr sem ninguém olhando).

Salvar exporta um `.json` legível com tudo que define aquela mosca:

```jsonc
{
  "format": "flytok.save.v1",
  "savedAt": "…",
  "brain": { "params": …, "plasticity": … },   // pesos sinápticos e plasticidade
  "agent": { "q": [...], "needs": …, "money": …,  // a tabela Q aprendida,
             "owned": …, "deliveries": …,          // o que ela sente e tem,
             "discoveries": …, "desire": … },      // e o que já descobriu
  "feed":  { "affinity": …, "samples": … },        // o perfil de gosto do algoritmo
  "world": { "community": …, "queue": …, "history": …, "log": … }
}
```

Carregar devolve exatamente aquele animal, com tudo o que ele já tinha descoberto — e entra pausado,
para você decidir quando soltar. Saves de formato diferente são recusados com mensagem clara, e uma
tabela Q de tamanho incompatível (de uma versão com outra codificação de estado) é descartada em vez
de ser lida como lixo.

Em desenvolvimento o store fica acessível no console como `__flytok`, o que ajuda a inspecionar:
`__flytok.getState().exportSave()`.

---

## O conectoma é real

| | |
|---|---|
| Dataset | FlyWire FAFB v783 |
| Neurônios | 139.248, cada um na coordenada real do volume |
| Extensão | 818 × 394 × 278 µm |
| Fonte | Schlegel et al. 2024, *Nature* 634:139-152 |
| Licença | CC-BY-4.0 |

As quatro populações modeladas são recortadas por anotação real de tipo celular, e as contagens batem
com a literatura:

| População | Neurônios | Critério na tabela de anotações |
|---|---|---|
| `visualLobula` | 53.201 | `cell_class` com LO/LOP, ou `super_class` = visual_projection |
| `pamDopamine` | 307 | `cell_type` começa com `PAM` |
| `ppl1Aversion` | 16 | `cell_type` começa com `PPL1` |
| `centralComplex` | 2.875 | `cell_class` = `CX` |
| tecido de fundo | 82.849 | todo o resto — é o que dá a silhueta do cérebro |

O que **não** é real é a dinâmica: os quatro clusters são pools de taxa média, não uma simulação da
fiação sináptica. A anatomia e os rótulos vêm dos dados; o comportamento é um modelo didático.

---

## As duas camadas do comportamento

```
FlyBrainCore   reflexo      dopamina/aversão → curtir, rolar
     ↑
FlyAgent       deliberação  o que fazer com o tempo → feed, comentar,
                            trabalhar, consumir, comprar
```

### A descoberta da economia

Este é o centro do projeto. A mosca tem recompensa intrínseca para **uma coisa só**: aliviar uma
necessidade (fome, sede, descanso, estímulo). Ganhar moedas vale **exatamente zero** na função de
recompensa — dá para conferir em `computeReward`, não há termo de dinheiro nenhum.

O que existe é uma cadeia causal no mundo:

```
comentar / trabalhar → moedas → "posso comprar" → comprar → entrega (12-46 s)
    → objeto na bancada → consumir → a fome cai → recompensa
```

O aprendizado é Q-learning com traços de elegibilidade (TD(λ), λ = 0,92). O valor caminha de trás
para frente: primeiro *consumir* fica valioso, depois *comprar*, e só então *comentar* e *trabalhar* —
que continuam sem nenhuma recompensa própria, mas passam a levar a estados valiosos. Os traços
existem justamente porque a recompensa chega muito depois da ação: a encomenda demora para chegar.

O painel **"O que a mosca acha que vale a pena"** mostra a tabela Q crua. É ali que se assiste à
descoberta acontecer. O bloco **Descobertas** só marca um marco quando o valor aprendido de fato
subiu e a ação já foi repetida o suficiente — nenhum desses avisos é roteirizado.

Leva de 5 a 10 minutos. A mosca começa tateando (ε = 48% de exploração) e vai fechando o cerco.

### O papel da propaganda

Anúncios entram no feed a cada 3 a 5 itens, duram 1, 3, 5 ou 10 segundos e usam fotos públicas de
mosquito (Wikimedia Commons, licença creditada na própria tela). Cada anúncio promove um objeto da
loja, preferencialmente o que atende à necessidade que mais dói no momento.

Ver um anúncio **não ensina nada** à mosca: ele instala *desejo*, que entra na escolha da ação como um
bônus de atratividade sobre comprar, sem tocar no valor aprendido. É o análogo do "wanting"
dopaminérgico — a publicidade não muda o que ela sabe, muda o que ela quer.

### O ambiente tem buracos de propósito

A bancada começa com água e um poleiro, e **nenhuma comida**. É essa lacuna que empurra a mosca para
a economia. O que ela compra aparece fisicamente na cena 3D quando a entrega chega.

---

## Arquitetura

```
scripts/build-connectome.mjs  baixa o FlyWire e gera o binário de 0,97 MB

lib/FlyBrainCore.ts    modelo neural puro (sem React, sem Three.js)
lib/FlyAgent.ts        necessidades, emoção, economia e o Q-learning
lib/feedEngine.ts      feed infinito, recomendação e inserção de anúncios
lib/world.ts           necessidades, catálogo de objetos, loja, ciclo dia/noite
lib/connectome.ts      carregador do binário do FlyWire
lib/live.ts            canal "quente" entre o loop de 10 Hz e a cena de 60 FPS
lib/feedPainter.ts     pintura 2D da tela do celular
lib/theme.ts           tema claro/escuro
lib/media.ts           normalização de URL e proxy

app/api/media/route.ts proxy same-origin de vídeo e imagem

components/
  FlyScene.tsx          bancada, luzes, câmera, ciclo dia/noite
  FlyModel.tsx          mosca articulada, animada pelas ações do agente
  PhoneFeed.tsx         celular 9:16, texturas de canvas e embeds
  BrainPointCloud.tsx   139.248 neurônios reais em uma draw call
  EnvironmentProps.tsx  os objetos que a mosca possui, na bancada
  FlyStatePanel.tsx     emoção, necessidades, carteira, loja, tabela Q
  NeuroControls.tsx     métricas do circuito e pesos sinápticos
  FeedPanel.tsx         fila do feed, comunidade, histórico
```

### Desempenho

A cena 3D **não assina** o snapshot da simulação. O loop de 10 Hz escreve em `lib/live.ts`, um objeto
mutável que os componentes leem dentro de `useFrame`. Sem isso, o React re-renderizaria a árvore do
Canvas dez vezes por segundo.

Os 139.248 neurônios vivem em um único `BufferGeometry` desenhado em uma draw call. Cor e tamanho
saem do vertex shader a partir de uniforms de ativação — atualizar o cérebro inteiro custa cinco
floats por frame, e nenhum atributo volta para a GPU.

---

## Mídia no feed

- **MP4/WebM e imagens** passam pelo proxy same-origin `/api/media` e viram textura real na tela do
  celular. O proxy existe porque o WebGL recusa quadros de mídia cross-origin sem CORS — o arquivo
  carregaria, mas não poderia ser desenhado. Requisições `Range` são repassadas.
- **YouTube / Shorts / TikTok / Reels** são montados como `<iframe>` ancorado na superfície da tela 3D,
  e tocam de verdade. Por serem DOM, desenham por cima da cena e não recebem oclusão das patas.
- Qualquer item cuja mídia falhe cai numa reconstrução procedural a partir das tags.

O proxy é um vetor de SSRF, então: só http(s), só respostas de tipo vídeo/imagem, e endereços
privados são bloqueados **depois** da resolução de DNS (contra rebinding) — incluindo o endpoint de
metadados de nuvem `169.254.169.254`.

---

## Armadilhas já pagas aqui

Documentadas porque nenhuma delas emite erro — só deixam a tela preta ou o aprendizado parado.

1. **`<Text>` e `<Environment>` da drei suspendem para sempre se o CDN falhar.** Ambos buscam um
   recurso remoto. Dentro de um `<Suspense fallback={null}>`, uma busca que nunca resolve deixa a
   cena inteira suspensa, sem nenhum log. Por isso a iluminação é toda local e o rótulo do holograma
   é DOM sobre o canvas.

2. **O `<Canvas>` só cria a cena depois da primeira medição do `ResizeObserver`.** Quando o
   componente entra por import dinâmico, essa notificação pode não chegar — canvas em branco para
   sempre. `useForceInitialMeasure` em `FlyScene.tsx` dispara um `resize` após a montagem.

3. **A ordem entre concluir a ação e medir a recompensa.** O alívio de uma necessidade é
   instantâneo. Se a recompensa for medida antes de `finishAction`, a queda da fome cai entre dois
   ticks e nunca entra no cálculo — o valor de *consumir* fica cravado em zero mesmo depois de
   dezenas de usos, e a cadeia inteira até a descoberta da economia não fecha. Custou uma tabela Q
   zerada para aparecer.

---

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Three.js · @react-three/fiber ·
@react-three/drei · Zustand · Lucide Icons

## Créditos de dados

- Conectoma: FlyWire FAFB v783 — Dorkenwald et al. e Schlegel et al., *Nature* 2024. CC-BY-4.0.
- Fotos de mosquito: Wikimedia Commons, categoria Culicidae. Licença de cada imagem creditada na
  própria tela do anúncio e listada em `lib/world.ts`.
- Clipes de teste: test-videos.co.uk (Big Buck Bunny e Sintel, Blender Foundation; Jellyfish).
