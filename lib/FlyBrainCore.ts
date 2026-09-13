/**
 * FlyBrainCore
 * ------------
 * Motor de simulação neural bioinspirado no conectoma de Drosophila melanogaster
 * (referência conceitual: FlyWire / hemibrain). É código puro — sem React, sem
 * Three.js — para que possa ser testado, instrumentado ou rodado headless.
 *
 * Clusters modelados (nomes reais do conectoma, dinâmica simplificada):
 *   · visualLobula   — lobula plate tangential cells. Detecta movimento/brilho.
 *   · pamDopamine    — neurônios dopaminérgicos PAM. Recompensa → LIKE.
 *   · ppl1Aversion   — neurônios PPL1. Punição/fadiga → SCROLL.
 *   · centralComplex — complexo central. Integra e emite a decisão motora.
 *
 * Cada cluster é um pool de taxa média (rate model) com constante de tempo
 * própria, integrado por Euler exponencial a cada tick (default 100 ms).
 */

import {
  BrainParams,
  BrainSnapshot,
  Category,
  ClusterId,
  MotorAction,
  Pace,
  Palette,
  VideoItem,
  VideoStimulus,
  DEFAULT_BRAIN_PARAMS,
} from './types';

// ---------------------------------------------------------------------------
// Constantes de modelagem
// ---------------------------------------------------------------------------

/** Constantes de tempo (segundos) de cada pool neuronal. Lobula é a mais rápida. */
const TAU: Record<ClusterId, number> = {
  visualLobula: 0.12,
  pamDopamine: 0.45,
  ppl1Aversion: 0.9,
  centralComplex: 0.25,
};

/** Constante de habituação ao estímulo atual, em segundos. */
const HABITUATION_TAU = 7.5;

/** Taxa de disparo máxima dos neurônios visuais (Hz), usada para escalar a métrica. */
const MAX_VISUAL_HZ = 180;

/** Ganho de recompensa intrínseco de cada categoria sobre o cluster PAM. */
const CATEGORY_REWARD_GAIN: Record<Category, number> = {
  FOOD_SUGAR: 1.35, // moscas são fortemente atraídas por sinais de açúcar
  SHARP_MOTION: 0.95,
  DANCE: 0.85,
  CHAOTIC_NOISE: 0.55,
};

/** Ganho de cada categoria sobre a lobula (quão visualmente gritante é o conteúdo). */
const CATEGORY_VISUAL_GAIN: Record<Category, number> = {
  FOOD_SUGAR: 0.8,
  SHARP_MOTION: 1.3,
  DANCE: 1.05,
  CHAOTIC_NOISE: 1.25,
};

/** Ganho de cada categoria sobre PPL1 (potencial aversivo / estressor). */
const CATEGORY_AVERSION_GAIN: Record<Category, number> = {
  FOOD_SUGAR: 0.45,
  SHARP_MOTION: 0.9,
  DANCE: 0.6,
  CHAOTIC_NOISE: 1.4,
};

const PACE_VALUE: Record<Pace, number> = { SLOW: 0.18, MEDIUM: 0.55, FRENETIC: 0.95 };

/** [brilho, caos cromático] por paleta predominante. */
const PALETTE_VALUE: Record<Palette, [number, number]> = {
  WARM: [0.7, 0.35],
  COLD: [0.45, 0.25],
  NEON: [0.9, 0.8],
  MONOCHROME: [0.35, 0.1],
};

const CLUSTER_IDS: ClusterId[] = ['visualLobula', 'pamDopamine', 'ppl1Aversion', 'centralComplex'];

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Integração exponencial de 1ª ordem: puxa `current` em direção a `target`. */
function relax(current: number, target: number, tau: number, dt: number): number {
  const alpha = 1 - Math.exp(-dt / tau);
  return current + (target - current) * alpha;
}

/**
 * Deriva o estímulo sensorial a partir dos metadados declarados do vídeo.
 * Usado quando não há análise de frames disponível (embeds de TikTok/YouTube
 * são sandboxed e não expõem pixels por restrição de CORS).
 */
export function stimulusFromTags(video: VideoItem, t: number): VideoStimulus {
  const pace = PACE_VALUE[video.pace];
  const [brightness, colorChaos] = PALETTE_VALUE[video.palette];

  // Oscilação procedural: simula os cortes do vídeo batendo na retina.
  // Vídeos frenéticos pulsam mais rápido e com maior amplitude.
  const cutHz = 0.4 + pace * 3.2;
  const pulse = 0.5 + 0.5 * Math.sin(t * cutHz * Math.PI * 2);
  const jitter = 0.5 + 0.5 * Math.sin(t * cutHz * 5.1 + 1.7);

  const motion = clamp01(pace * (0.6 + 0.4 * pulse) + colorChaos * 0.15 * jitter);

  return {
    motion,
    brightness: clamp01(brightness * (0.85 + 0.15 * pulse)),
    colorChaos,
    pace,
    category: video.category,
  };
}

/** Estímulo nulo — usado quando a playlist está vazia (tela preta). */
export const NULL_STIMULUS: VideoStimulus = {
  motion: 0,
  brightness: 0.02,
  colorChaos: 0,
  pace: 0,
  category: 'DANCE',
};

// ---------------------------------------------------------------------------
// Núcleo
// ---------------------------------------------------------------------------

export class FlyBrainCore {
  private params: BrainParams;

  /** Ativação [0,1] de cada pool neuronal. */
  private clusters: Record<ClusterId, number> = {
    visualLobula: 0.04,
    pamDopamine: 0.05,
    ppl1Aversion: 0.05,
    centralComplex: 0.05,
  };

  /** Recurso atencional. Cai a zero → a mosca rola o feed. */
  private attention = 1;

  /** Pesos plásticos por categoria (aprendizado hebbiano). */
  private plasticity: Record<Category, number> = {
    FOOD_SUGAR: 1,
    SHARP_MOTION: 1,
    DANCE: 1,
    CHAOTIC_NOISE: 1,
  };

  /** Tempo (s) desde que o vídeo atual começou — dirige a habituação. */
  private exposure = 0;
  /** Relógio interno (s), usado pelo gerador procedural de estímulo. */
  private clock = 0;
  private watchedMs = 0;
  private liked = false;
  private peakDopamine = 0;
  private lastAction: MotorAction = 'WATCH';
  /** Bloqueio para não disparar LIKE repetidamente no mesmo vídeo. */
  private likeCooldown = 0;

  constructor(params: BrainParams = DEFAULT_BRAIN_PARAMS) {
    this.params = { ...params };
  }

  // -- configuração ---------------------------------------------------------

  setParams(params: Partial<BrainParams>) {
    this.params = { ...this.params, ...params };
  }

  getParams(): BrainParams {
    return { ...this.params };
  }

  /** Reinicia apenas o contexto do vídeo (habituação, retenção, like). */
  onVideoChange() {
    this.exposure = 0;
    this.watchedMs = 0;
    this.liked = false;
    this.peakDopamine = 0;
    // Trocar de vídeo devolve parte da atenção: é exatamente esse "reset"
    // que o scroll infinito explora no design persuasivo.
    this.attention = Math.min(1, this.attention * 0.35 + 0.65);
    this.likeCooldown = 0;
    this.lastAction = 'WATCH';
  }

  /** Zera ativações, atenção e todos os pesos aprendidos. */
  resetConnectome() {
    for (const id of CLUSTER_IDS) this.clusters[id] = 0.05;
    this.plasticity = { FOOD_SUGAR: 1, SHARP_MOTION: 1, DANCE: 1, CHAOTIC_NOISE: 1 };
    this.attention = 1;
    this.onVideoChange();
  }

  /** Estado serializável dos pesos aprendidos (para Salvar Configuração Neural). */
  exportPlasticity(): Record<Category, number> {
    return { ...this.plasticity };
  }

  importPlasticity(p: Partial<Record<Category, number>>) {
    this.plasticity = { ...this.plasticity, ...p };
  }

  /** Relógio interno em segundos — a UI usa para gerar o estímulo procedural. */
  get time(): number {
    return this.clock;
  }

  get currentPeakDopamine(): number {
    return this.peakDopamine;
  }

  // -- loop -----------------------------------------------------------------

  /**
   * Avança a simulação em `dtMs` (tipicamente 100 ms) e devolve o snapshot.
   * A ação retornada é consumida pelo store para animar a pata e trocar o vídeo.
   */
  tick(dtMs: number, stim: VideoStimulus): BrainSnapshot {
    const dt = Math.max(0.001, dtMs / 1000);
    this.clock += dt;
    this.exposure += dt;
    this.watchedMs += dtMs;
    if (this.likeCooldown > 0) this.likeCooldown -= dt;

    const p = this.params;
    const cat = stim.category;

    // 1) Lobula — resposta sensorial bruta ao movimento/brilho do vídeo.
    const visualDrive = clamp01(
      (stim.motion * 0.62 + stim.pace * 0.23 + stim.brightness * 0.15) *
        p.visualAffinity *
        CATEGORY_VISUAL_GAIN[cat]
    );
    this.clusters.visualLobula = relax(this.clusters.visualLobula, visualDrive, TAU.visualLobula, dt);

    // 2) Novidade — decai exponencialmente com a exposição (habituação sensorial).
    const novelty = Math.exp(-this.exposure / HABITUATION_TAU);

    // 3) PAM (dopamina) — recompensa = saliência visual × novidade × plasticidade.
    const rewardDrive = clamp01(
      this.clusters.visualLobula *
        (0.35 + 0.65 * novelty) *
        p.dopamineSensitivity *
        CATEGORY_REWARD_GAIN[cat] *
        this.plasticity[cat] *
        (0.5 + 0.5 * this.attention)
    );
    this.clusters.pamDopamine = relax(this.clusters.pamDopamine, rewardDrive, TAU.pamDopamine, dt);

    // 4) PPL1 (aversão) — três fontes somadas:
    //    a) tédio   — saliência visual abaixo do limiar de tédio;
    //    b) fadiga  — habituação acumulada (1 - novidade);
    //    c) sobrecarga — ruído cromático em movimento estressa o sistema visual.
    const boredom = clamp01(
      (p.boredomThreshold - this.clusters.visualLobula) / Math.max(0.08, p.boredomThreshold)
    );
    const fatigue = 1 - novelty;
    const overload = clamp01(stim.colorChaos * stim.motion - 0.45);
    const aversionDrive = clamp01(
      (boredom * 0.55 + fatigue * 0.4 + overload * 0.5) * CATEGORY_AVERSION_GAIN[cat]
    );
    this.clusters.ppl1Aversion = relax(this.clusters.ppl1Aversion, aversionDrive, TAU.ppl1Aversion, dt);

    // 5) Atenção — recurso finito: dopamina repõe, aversão e o tempo drenam.
    const attentionDelta = this.clusters.pamDopamine * 0.55 - this.clusters.ppl1Aversion * 0.85 - 0.06;
    this.attention = clamp01(this.attention + attentionDelta * dt);

    // 6) Complexo central — integra recompensa menos punição, modulado pela atenção.
    const centralDrive = clamp01(
      0.5 +
        (this.clusters.pamDopamine - this.clusters.ppl1Aversion) * 0.5 * (0.4 + 0.6 * this.attention)
    );
    this.clusters.centralComplex = relax(
      this.clusters.centralComplex,
      centralDrive,
      TAU.centralComplex,
      dt
    );

    // 7) Plasticidade hebbiana — conexões coativas lobula→PAM são reforçadas,
    //    com decaimento lento em direção a 1 para evitar saturação.
    if (p.hebbian) {
      const coactivity = this.clusters.visualLobula * this.clusters.pamDopamine;
      const decay = (this.plasticity[cat] - 1) * 0.02;
      this.plasticity[cat] = Math.min(
        2.5,
        Math.max(0.35, this.plasticity[cat] + (coactivity * 0.06 - decay) * dt)
      );
    }

    this.peakDopamine = Math.max(this.peakDopamine, this.clusters.pamDopamine);

    // 8) Decisão motora do complexo central.
    let action: MotorAction = 'WATCH';
    if (!this.liked && this.likeCooldown <= 0 && this.clusters.pamDopamine > p.likeThreshold) {
      action = 'LIKE';
      this.liked = true;
      this.likeCooldown = 1.2;
      // O like é auto-reforçador: devolve atenção ao sistema.
      this.attention = clamp01(this.attention + 0.22);
    } else if (this.clusters.ppl1Aversion > p.scrollThreshold || this.attention <= 0.001) {
      action = 'SCROLL_NEXT';
    }
    this.lastAction = action;

    return this.snapshot(novelty, action);
  }

  /** Monta o objeto de leitura consumido pela UI e pelo render 3D. */
  private snapshot(novelty: number, action: MotorAction): BrainSnapshot {
    return {
      clusters: { ...this.clusters },
      attention: this.attention,
      dopamine: this.clusters.pamDopamine,
      aversion: this.clusters.ppl1Aversion,
      visualFiringRate: this.clusters.visualLobula * MAX_VISUAL_HZ,
      novelty,
      plasticity: { ...this.plasticity },
      action,
      watchedMs: this.watchedMs,
      liked: this.liked,
    };
  }

  /** Snapshot sem avançar o tempo (hidratação inicial da UI). */
  peek(): BrainSnapshot {
    return this.snapshot(Math.exp(-this.exposure / HABITUATION_TAU), this.lastAction);
  }
}
