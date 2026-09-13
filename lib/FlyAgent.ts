/**
 * FlyAgent
 * --------
 * A camada deliberativa da mosca, acima do modelo neural (`FlyBrainCore`).
 *
 * Divisão de trabalho:
 *   · FlyBrainCore — reflexo. Enquanto a mosca está no feed, ele decide curtir
 *     e rolar a partir de dopamina e aversão. É o circuito visual.
 *   · FlyAgent     — deliberação. Decide *o que fazer com o tempo*: ficar no
 *     feed, comentar, trabalhar, consumir algo do ambiente ou comprar.
 *
 * ## O ponto central: dinheiro não dá recompensa
 *
 * A mosca só tem recompensa intrínseca para uma coisa — **aliviar necessidade**
 * (fome, sede, descanso, estímulo). Ganhar moedas vale exatamente zero na função
 * de recompensa (ver `computeReward`). Nada no código diz a ela que comentar
 * rende dinheiro, nem que dinheiro compra comida.
 *
 * O que existe é uma cadeia causal no mundo:
 *   comentar/trabalhar → moedas → estado "posso comprar" → comprar → entrega →
 *   objeto no ambiente → consumir → fome alivia → **recompensa**
 *
 * O aprendizado é Q-learning com traços de elegibilidade (TD(λ)). O valor flui
 * de trás para frente ao longo dessa cadeia: primeiro CONSUMIR fica valioso,
 * depois COMPRAR, e só então COMENTAR e TRABALHAR — que continuam sem
 * recompensa nenhuma, mas passam a levar a estados valiosos. Quando o Q de
 * COMENTAR sobe, a mosca *descobriu* a economia. Os traços existem justamente
 * porque a recompensa chega muito depois da ação (a encomenda demora).
 */

import {
  AD_DURATIONS,
  AdDuration,
  DAY_LENGTH_SECONDS,
  ITEMS,
  ITEM_BY_ID,
  ItemSpec,
  NEEDS,
  NEED_IDS,
  NeedId,
  daylightOf,
} from './world';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Ações deliberativas disponíveis. A ordem é o índice na tabela Q. */
export const AGENT_ACTIONS = ['FEED', 'COMMENT', 'WORK', 'CONSUME', 'BUY'] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

export const ACTION_LABEL: Record<AgentAction, string> = {
  FEED: 'assistir ao feed',
  COMMENT: 'comentar',
  WORK: 'trabalhar',
  CONSUME: 'consumir',
  BUY: 'comprar',
};

/** Quanto tempo cada ação ocupa, em segundos. */
const ACTION_DURATION: Record<AgentAction, number> = {
  FEED: 1.2,
  COMMENT: 1.1,
  WORK: 3.2,
  CONSUME: 1.4,
  BUY: 0.8,
};

export interface OwnedItem {
  id: string;
  usesLeft: number;
}

export interface Delivery {
  itemId: string;
  /** Segundos restantes até chegar. */
  etaSeconds: number;
  totalSeconds: number;
  paid: number;
}

export interface Purchase {
  itemId: string;
  price: number;
  at: number;
  /** A propaganda tinha acabado de passar? */
  influencedByAd: boolean;
}

export interface CommentPost {
  emoji: string;
  emotion: string;
  /** Moedas recebidas por este comentário (0 quando não rendeu nada). */
  earned: number;
  at: number;
}

export interface Discovery {
  id: string;
  label: string;
  detail: string;
  at: number;
}

export interface Emotion {
  emoji: string;
  label: string;
  /** -1 (péssimo) a +1 (ótimo). */
  valence: number;
  /** 0 (apática) a 1 (agitada). */
  arousal: number;
}

export interface AgentSnapshot {
  needs: Record<NeedId, number>;
  emotion: Emotion;
  money: number;
  /** Total de moedas já ganhas na vida. */
  lifetimeEarned: number;
  action: AgentAction;
  /** Progresso 0..1 da ação em curso. */
  actionProgress: number;
  owned: OwnedItem[];
  deliveries: Delivery[];
  purchases: Purchase[];
  comments: CommentPost[];
  discoveries: Discovery[];
  /** Desejo induzido por propaganda, por item (0..1). */
  desire: Record<string, number>;
  /** Valor aprendido de cada ação no estado atual — a "crença" da mosca. */
  actionValues: Record<AgentAction, number>;
  /**
   * Média do valor de cada ação sobre os estados já visitados. O estado atual
   * costuma estar zerado (são 72 estados), então é esta média que mostra se a
   * mosca está de fato aprendendo alguma coisa.
   */
  meanActionValues: Record<AgentAction, number>;
  /** Quantos dos 72 estados já foram tocados pelo aprendizado. */
  visitedStates: number;
  /** Quantas vezes cada ação já foi tomada. */
  actionCounts: Record<AgentAction, number>;
  /** Taxa de exploração corrente. */
  epsilon: number;
  /** Fase do dia, 0..1 (0 = meia-noite). */
  dayPhase: number;
  daylight: number;
  /** Mensagem curta do que a mosca está fazendo agora. */
  activity: string;
}

/** Eventos emitidos num tick, para a UI e a cena 3D reagirem. */
export interface AgentEvents {
  commented?: CommentPost;
  bought?: Purchase;
  delivered?: string;
  consumed?: { itemId: string; need: NeedId };
  worked?: number;
  discovered?: Discovery;
}

// ---------------------------------------------------------------------------
// Aprendizado
// ---------------------------------------------------------------------------

const ALPHA = 0.18; // taxa de aprendizado
const GAMMA = 0.96; // desconto — alto: a recompensa chega bem depois
const LAMBDA = 0.92; // traço de elegibilidade — sem isso a cadeia não fecha
const EPS_START = 0.48;
const EPS_END = 0.05;
const EPS_DECAY_STEPS = 1400;

/** Buckets de urgência de uma necessidade. */
function bucket3(v: number): number {
  return v < 0.34 ? 0 : v < 0.67 ? 1 : 2;
}

const N_ACTIONS = AGENT_ACTIONS.length;
/** urgentNeed(4) × urgência(3) × dinheiro(4) × podeSatisfazer(2) = 96 estados. */
const N_STATES = 4 * 3 * 4 * 2;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------
// Emoção
// ---------------------------------------------------------------------------

/**
 * Mapeia valência × excitação (e a necessidade mais urgente) num rótulo com
 * emoji. O emoji é literalmente o que a mosca posta quando comenta.
 */
function deriveEmotion(
  needs: Record<NeedId, number>,
  dopamine: number,
  aversion: number,
  arousalIn: number
): Emotion {
  const worst = NEED_IDS.reduce((a, b) => (needs[a] > needs[b] ? a : b));
  const worstValue = needs[worst];
  const meanNeed = NEED_IDS.reduce((s, n) => s + needs[n], 0) / NEED_IDS.length;

  const valence = clamp01(dopamine) * 1.1 - clamp01(aversion) * 0.9 - meanNeed * 1.1;
  const arousal = clamp01(arousalIn * 0.6 + worstValue * 0.6);

  // Uma necessidade urgente domina o que a mosca sente.
  if (worstValue > 0.82) {
    const urgent: Record<NeedId, [string, string]> = {
      fome: ['🥺', 'faminta'],
      sede: ['🥵', 'com sede'],
      descanso: ['🥱', 'exausta'],
      estimulo: ['😖', 'sem estímulo'],
    };
    const [emoji, label] = urgent[worst];
    return { emoji, label, valence: Math.max(-1, valence), arousal };
  }
  if (worstValue > 0.6) {
    const wanting: Record<NeedId, [string, string]> = {
      fome: ['🤤', 'com fome'],
      sede: ['💧', 'com sede'],
      descanso: ['😪', 'cansada'],
      estimulo: ['🫠', 'entediada'],
    };
    const [emoji, label] = wanting[worst];
    return { emoji, label, valence, arousal };
  }

  if (valence > 0.45) return { emoji: arousal > 0.5 ? '🤩' : '😌', label: arousal > 0.5 ? 'eufórica' : 'satisfeita', valence, arousal };
  if (valence > 0.12) return { emoji: arousal > 0.55 ? '😃' : '🙂', label: arousal > 0.55 ? 'animada' : 'tranquila', valence, arousal };
  if (valence > -0.15) return { emoji: arousal > 0.55 ? '😐' : '😶', label: arousal > 0.55 ? 'inquieta' : 'neutra', valence, arousal };
  if (valence > -0.5) return { emoji: arousal > 0.55 ? '😠' : '🥱', label: arousal > 0.55 ? 'irritada' : 'entediada', valence, arousal };
  return { emoji: arousal > 0.55 ? '😩' : '😵‍💫', label: arousal > 0.55 ? 'aflita' : 'apática', valence, arousal };
}

// ---------------------------------------------------------------------------
// Agente
// ---------------------------------------------------------------------------

export class FlyAgent {
  // -- estado do mundo ------------------------------------------------------
  private needs: Record<NeedId, number> = { fome: 0.25, sede: 0.2, descanso: 0.1, estimulo: 0.35 };
  private money = 0;
  private lifetimeEarned = 0;
  private owned: OwnedItem[] = [];
  private deliveries: Delivery[] = [];
  private purchases: Purchase[] = [];
  private comments: CommentPost[] = [];
  private discoveries: Discovery[] = [];
  private desire: Record<string, number> = {};
  private clock = 0;
  /** Segundos desde o início, para o ciclo dia/noite. */
  private worldClock = 0;
  private lastAdAt = -999;

  // -- estado do aprendizado ------------------------------------------------
  private Q: Float64Array = new Float64Array(N_STATES * N_ACTIONS);
  private trace: Float64Array = new Float64Array(N_STATES * N_ACTIONS);
  private steps = 0;
  private actionCounts: Record<AgentAction, number> = {
    FEED: 0,
    COMMENT: 0,
    WORK: 0,
    CONSUME: 0,
    BUY: 0,
  };

  // -- ação em curso --------------------------------------------------------
  private action: AgentAction = 'FEED';
  private actionElapsed = 0;
  private pendingState = 0;
  private pendingAction = 0;
  private rewardAccumulator = 0;
  private activity = 'observando a bancada';
  private emotion: Emotion = {
    emoji: '🙂',
    label: 'tranquila',
    valence: 0,
    arousal: 0.2,
  };

  constructor() {
    for (const item of ITEMS) {
      this.desire[item.id] = 0;
      if (item.presentAtStart) this.owned.push({ id: item.id, usesLeft: item.uses });
    }
    this.pendingState = this.encodeState();
    this.pendingAction = 0;
  }

  // -- consulta -------------------------------------------------------------

  get isWatchingFeed(): boolean {
    return this.action === 'FEED';
  }

  get dayPhase(): number {
    return (this.worldClock % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
  }

  /** Item que a propaganda deve anunciar: o mais caro que a mosca não tem. */
  pickAdItem(): ItemSpec {
    const missing = ITEMS.filter((i) => !this.owned.some((o) => o.id === i.id && o.usesLeft > 0));
    const pool = missing.length > 0 ? missing : ITEMS;
    // Anuncia com mais frequência o que atende à necessidade mais urgente —
    // é exatamente assim que a publicidade mira: no que já dói.
    const worst = NEED_IDS.reduce((a, b) => (this.needs[a] > this.needs[b] ? a : b));
    const targeted = pool.filter((i) => i.satisfies === worst);
    const from = targeted.length > 0 && Math.random() < 0.7 ? targeted : pool;
    return from[Math.floor(Math.random() * from.length)];
  }

  pickAdDuration(): AdDuration {
    return AD_DURATIONS[Math.floor(Math.random() * AD_DURATIONS.length)];
  }

  /** Chamado quando um anúncio é exibido: instala desejo pelo item anunciado. */
  onAdSeen(itemId: string, durationSeconds: number) {
    // Anúncios mais longos plantam desejo mais forte.
    const gain = 0.18 + durationSeconds * 0.055;
    this.desire[itemId] = clamp01((this.desire[itemId] ?? 0) + gain);
    this.lastAdAt = this.clock;
  }

  hasItemFor(need: NeedId): boolean {
    return this.owned.some((o) => o.usesLeft > 0 && ITEM_BY_ID[o.id]?.satisfies === need);
  }

  // -- codificação de estado ------------------------------------------------

  private mostUrgentNeed(): NeedId {
    return NEED_IDS.reduce((a, b) => (this.needs[a] > this.needs[b] ? a : b));
  }

  private cheapestPrice(): number {
    return Math.min(...ITEMS.filter((i) => !i.presentAtStart).map((i) => i.price));
  }

  private encodeState(): number {
    const urgent = this.mostUrgentNeed();
    const needIdx = NEED_IDS.indexOf(urgent);
    const urgency = bucket3(this.needs[urgent]);
    const cheapest = this.cheapestPrice();
    // Quatro faixas de bolso, não três.
    //
    // Com só "não dá / dá / sobra", um comentário isolado (1 a 3 moedas) não
    // mudava o estado: a mosca ficava num platô sem gradiente nenhum entre
    // estar zerada e conseguir comprar, e o valor não tinha por onde fluir de
    // volta até COMENTAR. A faixa intermediária "já tenho algo guardado" dá o
    // degrau que faltava. É percepção, não recompensa — continua sem nenhum
    // ponto por ter dinheiro.
    const moneyBucket =
      this.money <= 0 ? 0 : this.money < cheapest ? 1 : this.money < cheapest * 2.5 ? 2 : 3;
    const canSatisfy = this.hasItemFor(urgent) ? 1 : 0;
    return ((needIdx * 3 + urgency) * 4 + moneyBucket) * 2 + canSatisfy;
  }

  private qIndex(state: number, action: number) {
    return state * N_ACTIONS + action;
  }

  private bestAction(state: number): number {
    let best = 0;
    let bestV = -Infinity;
    for (let a = 0; a < N_ACTIONS; a++) {
      const v = this.Q[this.qIndex(state, a)];
      if (v > bestV) {
        bestV = v;
        best = a;
      }
    }
    return best;
  }

  private maxQ(state: number): number {
    let best = -Infinity;
    for (let a = 0; a < N_ACTIONS; a++) best = Math.max(best, this.Q[this.qIndex(state, a)]);
    return best;
  }

  private get epsilon(): number {
    const t = Math.min(1, this.steps / EPS_DECAY_STEPS);
    return EPS_START + (EPS_END - EPS_START) * t;
  }

  /**
   * Escolha ε-greedy, com um empurrão de "saliência de incentivo": o desejo
   * plantado por propaganda aumenta a atratividade de COMPRAR sem alterar o
   * valor aprendido. É o análogo do "wanting" dopaminérgico — a publicidade não
   * ensina nada à mosca, só torna a compra mais tentadora.
   */
  private chooseAction(state: number): number {
    if (Math.random() < this.epsilon) return Math.floor(Math.random() * N_ACTIONS);

    const maxDesire = Math.max(0, ...Object.values(this.desire));
    let best = 0;
    let bestV = -Infinity;
    for (let a = 0; a < N_ACTIONS; a++) {
      let v = this.Q[this.qIndex(state, a)];
      if (AGENT_ACTIONS[a] === 'BUY') v += maxDesire * 0.25;
      if (v > bestV) {
        bestV = v;
        best = a;
      }
    }
    return best;
  }

  // -- recompensa -----------------------------------------------------------

  /**
   * Recompensa intrínseca. **Não há termo de dinheiro aqui, de propósito.**
   * Se houvesse, a mosca aprenderia a comentar em dois minutos e a experiência
   * inteira perderia a graça: o que se quer ver é a descoberta.
   */
  private computeReward(
    before: Record<NeedId, number>,
    dopamine: number,
    aversion: number,
    dt: number
  ): number {
    let r = 0;
    for (const n of NEED_IDS) {
      // Alívio de necessidade: a única fonte forte de recompensa.
      // Já é uma diferença entre dois instantes, então não escala por dt.
      r += (before[n] - this.needs[n]) * 4.5;
      // Sofrimento contínuo por necessidade não atendida. Este é um termo *por
      // segundo* — sem multiplicar por dt ele seria dez vezes maior (o tick é
      // de 100 ms) e afogaria a recompensa de alívio, deixando toda a tabela Q
      // negativa e achatada.
      if (this.needs[n] > 0.7) r -= (this.needs[n] - 0.7) * 0.5 * dt;
    }
    r += (dopamine * 0.25 - aversion * 0.2) * dt;
    return r;
  }

  // -- execução de ações ----------------------------------------------------

  private finishAction(events: AgentEvents) {
    const spec = this.action;

    switch (spec) {
      case 'COMMENT': {
        // Comentar é postar o emoji do que a mosca está sentindo.
        // Em 62% das vezes o comentário é monetizado. A mosca não recebe
        // nenhuma recompensa por isso — só o saldo muda.
        const earned = Math.random() < 0.62 ? 1 + Math.floor(Math.random() * 3) : 0;
        this.money += earned;
        this.lifetimeEarned += earned;
        const post: CommentPost = {
          emoji: this.emotion.emoji,
          emotion: this.emotion.label,
          earned,
          at: this.clock,
        };
        this.comments = [post, ...this.comments].slice(0, 40);
        events.commented = post;
        break;
      }

      case 'WORK': {
        // "Trabalho": moderar o próprio feed. Rende mais que comentar, mas
        // gasta energia e abre apetite.
        const earned = 4 + Math.floor(Math.random() * 6);
        this.money += earned;
        this.lifetimeEarned += earned;
        this.needs.descanso = clamp01(this.needs.descanso + 0.1);
        this.needs.fome = clamp01(this.needs.fome + 0.06);
        events.worked = earned;
        break;
      }

      case 'CONSUME': {
        const urgent = this.mostUrgentNeed();
        // Usa o item mais potente disponível para a necessidade mais urgente.
        const candidates = this.owned
          .filter((o) => o.usesLeft > 0 && ITEM_BY_ID[o.id]?.satisfies === urgent)
          .sort((a, b) => ITEM_BY_ID[b.id].potency - ITEM_BY_ID[a.id].potency);
        const chosen = candidates[0];
        if (chosen) {
          const item = ITEM_BY_ID[chosen.id];
          this.needs[urgent] = clamp01(this.needs[urgent] - item.potency);
          if (Number.isFinite(chosen.usesLeft)) chosen.usesLeft -= 1;
          this.owned = this.owned.filter((o) => o.usesLeft > 0);
          events.consumed = { itemId: item.id, need: urgent };
        }
        // Sem item, a ação simplesmente não faz nada — e a mosca aprende isso.
        break;
      }

      case 'BUY': {
        // Compra o item mais desejado que couber no bolso; sem desejo forte,
        // vai pelo que atende à necessidade mais urgente.
        const urgent = this.mostUrgentNeed();
        const affordable = ITEMS.filter((i) => i.price <= this.money);
        if (affordable.length > 0) {
          const scored = affordable
            .map((i) => ({
              item: i,
              score:
                (this.desire[i.id] ?? 0) * 1.4 +
                (i.satisfies === urgent ? 0.9 : 0) +
                i.potency * 0.3 -
                (this.owned.some((o) => o.id === i.id) ? 0.8 : 0),
            }))
            .sort((a, b) => b.score - a.score);
          const item = scored[0].item;
          this.money -= item.price;
          const purchase: Purchase = {
            itemId: item.id,
            price: item.price,
            at: this.clock,
            influencedByAd: (this.desire[item.id] ?? 0) > 0.25,
          };
          this.purchases = [purchase, ...this.purchases].slice(0, 40);
          this.deliveries.push({
            itemId: item.id,
            etaSeconds: item.deliverySeconds,
            totalSeconds: item.deliverySeconds,
            paid: item.price,
          });
          // Comprado: o desejo instalado pela propaganda se dissolve.
          this.desire[item.id] = 0;
          events.bought = purchase;
        }
        break;
      }

      case 'FEED':
      default:
        break;
    }
  }

  private describeActivity(): string {
    switch (this.action) {
      case 'COMMENT':
        return `comentando ${this.emotion.emoji}`;
      case 'WORK':
        return 'trabalhando (moderando o feed)';
      case 'CONSUME': {
        const urgent = this.mostUrgentNeed();
        const item = this.owned.find((o) => ITEM_BY_ID[o.id]?.satisfies === urgent);
        return item ? `consumindo ${ITEM_BY_ID[item.id].label}` : 'procurando algo para consumir';
      }
      case 'BUY':
        return 'comprando';
      default:
        return 'assistindo ao feed';
    }
  }

  // -- descobertas ----------------------------------------------------------

  /** Um estado já foi tocado pelo aprendizado? */
  private isTouched(s: number): boolean {
    for (let a = 0; a < N_ACTIONS; a++) if (this.Q[this.qIndex(s, a)] !== 0) return true;
    return false;
  }

  /**
   * Valor médio aprendido de uma ação, apenas sobre estados já visitados.
   * Incluir os 72 estados diluiria a média com zeros e os limiares de
   * descoberta nunca disparariam.
   */
  private meanQFor(action: AgentAction, filter?: (state: number) => boolean): number {
    const a = AGENT_ACTIONS.indexOf(action);
    let sum = 0;
    let n = 0;
    for (let s = 0; s < N_STATES; s++) {
      if (!this.isTouched(s)) continue;
      if (filter && !filter(s)) continue;
      sum += this.Q[this.qIndex(s, a)];
      n++;
    }
    return n > 0 ? sum / n : 0;
  }

  private note(id: string, label: string, detail: string, events: AgentEvents) {
    if (this.discoveries.some((d) => d.id === id)) return;
    const d: Discovery = { id, label, detail, at: this.clock };
    this.discoveries = [d, ...this.discoveries];
    events.discovered = d;
  }

  /**
   * Detecta descobertas a partir da tabela Q real — nada aqui é roteirizado.
   * Um marco só aparece quando o valor aprendido daquela ação de fato subiu e
   * a mosca já a executou vezes suficientes para não ser ruído.
   */
  private checkDiscoveries(events: AgentEvents) {
    // "Sem bolso" = faixas 0 e 1, em que nada na loja está ao alcance.
    const brokeStates = (s: number) => Math.floor(s / 2) % 4 <= 1;

    // O nível absoluto da tabela Q depende de quanto sofrimento o mundo impõe;
    // o que importa é a *comparação* com simplesmente ficar no feed. Por isso
    // cada marco é relativo à linha de base FEED.
    const baseline = this.meanQFor('FEED');
    const baselineBroke = this.meanQFor('FEED', brokeStates);

    if (this.actionCounts.CONSUME > 8 && this.meanQFor('CONSUME') > baseline + 0.15) {
      this.note(
        'consumir',
        'Consumir alivia',
        'Passou a valorizar usar um objeto do ambiente acima de continuar no feed.',
        events
      );
    }
    if (this.actionCounts.BUY > 4 && this.meanQFor('BUY') > baseline + 0.1) {
      this.note(
        'comprar',
        'Comprar traz objetos',
        'Gastar moedas passou a valer mais que ficar no feed — associou compra a objeto.',
        events
      );
    }
    if (
      this.actionCounts.COMMENT > 14 &&
      this.meanQFor('COMMENT', brokeStates) > baselineBroke + 0.08
    ) {
      this.note(
        'comentar-dinheiro',
        'Comentar rende moedas',
        'Sem bolso e sem comida, comentar passou a valer mais que assistir. Ninguém contou.',
        events
      );
    }
    if (this.actionCounts.WORK > 10 && this.meanQFor('WORK', brokeStates) > baselineBroke + 0.1) {
      this.note(
        'trabalhar-dinheiro',
        'Trabalhar rende mais',
        'Descobriu que trabalhar paga melhor que comentar — ao custo de cansaço e fome.',
        events
      );
    }
  }

  // -- loop -----------------------------------------------------------------

  /**
   * Avança o agente. `dtMs` costuma ser 100 ms, igual ao do cérebro.
   * `dopamine` e `aversion` vêm do `FlyBrainCore` — é o único acoplamento
   * entre a camada reflexa e a deliberativa.
   */
  tick(dtMs: number, dopamine: number, aversion: number, arousal: number): AgentEvents {
    const dt = dtMs / 1000;
    this.clock += dt;
    this.worldClock += dt;
    const events: AgentEvents = {};

    const before: Record<NeedId, number> = { ...this.needs };

    // -- necessidades crescem; à noite o cansaço pesa mais ------------------
    const light = daylightOf(this.dayPhase);
    for (const spec of NEEDS) {
      let rate = spec.ratePerSecond;
      if (spec.id === 'descanso') rate *= 1 + (1 - light) * 1.4;
      this.needs[spec.id] = clamp01(this.needs[spec.id] + rate * dt);
    }

    // Assistir ao feed alivia o tédio na medida da dopamina que ele entrega.
    if (this.action === 'FEED') {
      this.needs.estimulo = clamp01(this.needs.estimulo - dopamine * 0.055 * dt * 6);
    }

    // -- desejo instalado por propaganda decai devagar ----------------------
    for (const id of Object.keys(this.desire)) {
      this.desire[id] = Math.max(0, this.desire[id] - 0.012 * dt);
    }

    // -- entregas em trânsito ----------------------------------------------
    for (let i = this.deliveries.length - 1; i >= 0; i--) {
      const d = this.deliveries[i];
      d.etaSeconds -= dt;
      if (d.etaSeconds <= 0) {
        const spec = ITEM_BY_ID[d.itemId];
        const existing = this.owned.find((o) => o.id === d.itemId);
        if (existing) existing.usesLeft += spec.uses;
        else this.owned.push({ id: d.itemId, usesLeft: spec.uses });
        this.deliveries.splice(i, 1);
        events.delivered = d.itemId;
      }
    }

    // -- emoção -------------------------------------------------------------
    this.emotion = deriveEmotion(this.needs, dopamine, aversion, arousal);

    // -- a ação em curso terminou? -----------------------------------------
    //
    // A ordem aqui é crítica: `finishAction` precisa rodar ANTES de medir a
    // recompensa. O alívio de uma necessidade é instantâneo — se a medição
    // viesse antes, a queda da fome ao consumir cairia entre dois ticks e
    // *nunca* entraria na recompensa. Foi exatamente esse bug que manteve o
    // valor de CONSUMIR em zero mesmo depois de dezenas de usos, quebrando a
    // cadeia inteira que leva até a descoberta da economia.
    this.actionElapsed += dt;
    const finished = this.actionElapsed >= ACTION_DURATION[this.action];
    if (finished) {
      this.finishAction(events);
      this.actionCounts[this.action]++;
    }

    // -- recompensa acumulada dentro da ação em curso -----------------------
    this.rewardAccumulator += this.computeReward(before, dopamine, aversion, dt);

    if (finished) {

      // ---- atualização TD(λ) ----
      const nextState = this.encodeState();
      const r = this.rewardAccumulator;
      const idx = this.qIndex(this.pendingState, this.pendingAction);
      const delta = r + GAMMA * this.maxQ(nextState) - this.Q[idx];

      // Traço substitutivo: a ação recém-tomada recebe crédito cheio.
      this.trace[idx] = 1;
      for (let i = 0; i < this.Q.length; i++) {
        if (this.trace[i] > 1e-4) {
          this.Q[i] += ALPHA * delta * this.trace[i];
          this.trace[i] *= GAMMA * LAMBDA;
        } else if (this.trace[i] !== 0) {
          this.trace[i] = 0;
        }
      }

      this.steps++;
      this.rewardAccumulator = 0;
      this.actionElapsed = 0;

      // ---- escolhe a próxima ação ----
      const a = this.chooseAction(nextState);
      this.pendingState = nextState;
      this.pendingAction = a;
      this.action = AGENT_ACTIONS[a];
      this.activity = this.describeActivity();

      this.checkDiscoveries(events);
    }

    return events;
  }

  // -- leitura --------------------------------------------------------------

  snapshot(): AgentSnapshot {
    const state = this.encodeState();
    const actionValues = {} as Record<AgentAction, number>;
    AGENT_ACTIONS.forEach((a, i) => {
      actionValues[a] = this.Q[this.qIndex(state, i)];
    });

    // Média só sobre estados que o aprendizado já tocou — incluir os 72 estados
    // diluiria tudo a zero e esconderia a curva.
    const touched: number[] = [];
    for (let s = 0; s < N_STATES; s++) {
      for (let a = 0; a < N_ACTIONS; a++) {
        if (this.Q[this.qIndex(s, a)] !== 0) {
          touched.push(s);
          break;
        }
      }
    }
    const meanActionValues = {} as Record<AgentAction, number>;
    AGENT_ACTIONS.forEach((a, i) => {
      meanActionValues[a] =
        touched.length > 0
          ? touched.reduce((sum, s) => sum + this.Q[this.qIndex(s, i)], 0) / touched.length
          : 0;
    });

    return {
      needs: { ...this.needs },
      emotion: this.emotion,
      money: this.money,
      lifetimeEarned: this.lifetimeEarned,
      action: this.action,
      actionProgress: Math.min(1, this.actionElapsed / ACTION_DURATION[this.action]),
      owned: this.owned.map((o) => ({ ...o })),
      deliveries: this.deliveries.map((d) => ({ ...d })),
      purchases: this.purchases.slice(0, 12),
      comments: this.comments.slice(0, 12),
      discoveries: this.discoveries.slice(0, 8),
      desire: { ...this.desire },
      actionValues,
      meanActionValues,
      visitedStates: touched.length,
      actionCounts: { ...this.actionCounts },
      epsilon: this.epsilon,
      dayPhase: this.dayPhase,
      daylight: daylightOf(this.dayPhase),
      activity: this.activity,
    };
  }

  /** Zera tudo: mundo, carteira e o que foi aprendido. */
  reset() {
    this.needs = { fome: 0.25, sede: 0.2, descanso: 0.1, estimulo: 0.35 };
    this.money = 0;
    this.lifetimeEarned = 0;
    this.owned = ITEMS.filter((i) => i.presentAtStart).map((i) => ({ id: i.id, usesLeft: i.uses }));
    this.deliveries = [];
    this.purchases = [];
    this.comments = [];
    this.discoveries = [];
    this.desire = Object.fromEntries(ITEMS.map((i) => [i.id, 0]));
    this.Q = new Float64Array(N_STATES * N_ACTIONS);
    this.trace = new Float64Array(N_STATES * N_ACTIONS);
    this.steps = 0;
    this.actionCounts = { FEED: 0, COMMENT: 0, WORK: 0, CONSUME: 0, BUY: 0 };
    this.action = 'FEED';
    this.actionElapsed = 0;
    this.rewardAccumulator = 0;
    this.clock = 0;
    this.worldClock = 0;
    this.pendingState = this.encodeState();
    this.pendingAction = 0;
  }

  /**
   * Estado completo e serializável: o que ela aprendeu, o que sente, o que tem
   * e o que está a caminho. É o que entra no arquivo de save.
   */
  exportState() {
    return {
      q: Array.from(this.Q),
      steps: this.steps,
      actionCounts: this.actionCounts,
      needs: this.needs,
      money: this.money,
      lifetimeEarned: this.lifetimeEarned,
      owned: this.owned,
      deliveries: this.deliveries,
      purchases: this.purchases,
      comments: this.comments,
      discoveries: this.discoveries,
      desire: this.desire,
      clock: this.clock,
      worldClock: this.worldClock,
    };
  }

  importState(data: Partial<ReturnType<FlyAgent['exportState']>> | undefined) {
    if (!data) return;
    // A tabela Q só é aceita se tiver exatamente o tamanho atual: um save de
    // uma versão com outra codificação de estado seria lido como lixo.
    if (Array.isArray(data.q) && data.q.length === this.Q.length) {
      this.Q = Float64Array.from(data.q);
    }
    this.trace = new Float64Array(this.Q.length);
    if (typeof data.steps === 'number') this.steps = data.steps;
    if (data.actionCounts) this.actionCounts = { ...this.actionCounts, ...data.actionCounts };
    if (data.needs) this.needs = { ...this.needs, ...data.needs };
    if (typeof data.money === 'number') this.money = data.money;
    if (typeof data.lifetimeEarned === 'number') this.lifetimeEarned = data.lifetimeEarned;
    if (Array.isArray(data.owned)) this.owned = data.owned;
    if (Array.isArray(data.deliveries)) this.deliveries = data.deliveries;
    if (Array.isArray(data.purchases)) this.purchases = data.purchases;
    if (Array.isArray(data.comments)) this.comments = data.comments;
    if (Array.isArray(data.discoveries)) this.discoveries = data.discoveries;
    if (data.desire) this.desire = { ...this.desire, ...data.desire };
    if (typeof data.clock === 'number') this.clock = data.clock;
    if (typeof data.worldClock === 'number') this.worldClock = data.worldClock;
    this.pendingState = this.encodeState();
  }
}
