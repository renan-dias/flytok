/**
 * Tipos compartilhados entre o motor de simulação (FlyBrainCore) e a UI.
 * Mantidos separados para que o núcleo neural permaneça desacoplado do React.
 */

/** Ritmo de corte / cadência do vídeo. */
export type Pace = 'SLOW' | 'MEDIUM' | 'FRENETIC';

/** Paleta predominante — influencia brilho e caos cromático percebidos. */
export type Palette = 'WARM' | 'COLD' | 'NEON' | 'MONOCHROME';

/** Categoria semântica do conteúdo. */
export type Category = 'FOOD_SUGAR' | 'SHARP_MOTION' | 'DANCE' | 'CHAOTIC_NOISE';

/**
 * Como o item será exibido na tela do celular:
 *   · MP4        — arquivo de vídeo, vira textura real (via proxy same-origin);
 *   · IMAGE      — foto, idem;
 *   · EMBED      — Shorts/TikTok/Reels, montado como iframe sobre a tela;
 *   · PROCEDURAL — clipe gerado pelo próprio app, sem mídia externa.
 */
export type MediaKind = 'MP4' | 'EMBED' | 'IMAGE' | 'PROCEDURAL';

export interface VideoItem {
  id: string;
  title: string;
  url: string;
  kind: MediaKind;
  /** URL normalizada para <iframe> quando kind === 'EMBED'. */
  embedUrl?: string;
  pace: Pace;
  palette: Palette;
  category: Category;
  addedBy: string;

  // ---- campos de propaganda ----
  /** Este item é um anúncio inserido pelo feed, não conteúdo. */
  isAd?: boolean;
  /** Item da loja que o anúncio promove. */
  adItemId?: string;
  /** Duração fixa do anúncio: 1, 3, 5 ou 10 segundos. */
  adDurationSeconds?: number;
  /** Chamada publicitária exibida sobre a foto. */
  adCopy?: string;
  /** Crédito da foto (título + licença), exigido pelas licenças CC. */
  photoCredit?: string;
}

/**
 * Estímulo instantâneo apresentado à retina/lobula da mosca.
 * Todos os campos são normalizados em [0, 1].
 */
export interface VideoStimulus {
  /** Energia de movimento aparente (cortes, deslocamento de pixels). */
  motion: number;
  /** Luminância média da cena. */
  brightness: number;
  /** Variância cromática — proxy de "ruído visual". */
  colorChaos: number;
  /** Frequência de corte / cadência. */
  pace: number;
  category: Category;
}

/** Identificadores dos clusters neuronais simulados. */
export type ClusterId = 'visualLobula' | 'pamDopamine' | 'ppl1Aversion' | 'centralComplex';

/** Ação motora resolvida pelo complexo central. */
export type MotorAction = 'WATCH' | 'LIKE' | 'SCROLL_NEXT';

/** Pesos sinápticos editáveis pelo usuário (o "editor de cérebro"). */
export interface BrainParams {
  /** Sensibilidade a dopamina / vício — ganho do cluster PAM. */
  dopamineSensitivity: number; // 0..2
  /** Limiar de tédio — quanto menor, mais rápido a mosca descarta vídeos lentos. */
  boredomThreshold: number; // 0..1
  /** Afinidade com estímulo visual — ganho da lobula. */
  visualAffinity: number; // 0..2
  /** Ativa plasticidade hebbiana (fortalece conexões conforme tempo assistido). */
  hebbian: boolean;
  /** Ativação de PAM necessária para disparar um LIKE. */
  likeThreshold: number; // 0..1
  /** Ativação de PPL1 necessária para disparar um SCROLL. */
  scrollThreshold: number; // 0..1
}

/** Snapshot legível do estado interno do cérebro, emitido a cada tick. */
export interface BrainSnapshot {
  clusters: Record<ClusterId, number>;
  attention: number;
  dopamine: number;
  aversion: number;
  /** Taxa de disparo estimada dos neurônios visuais, em Hz. */
  visualFiringRate: number;
  /** Novidade restante do estímulo atual (1 = recém-apresentado). */
  novelty: number;
  /** Pesos plásticos aprendidos por categoria. */
  plasticity: Record<Category, number>;
  action: MotorAction;
  /** Tempo assistido no vídeo atual, em ms. */
  watchedMs: number;
  liked: boolean;
}

/** Registro histórico de uma sessão de visualização concluída. */
export interface WatchRecord {
  videoId: string;
  title: string;
  category: Category;
  retentionMs: number;
  liked: boolean;
  peakDopamine: number;
  finishedAt: number;
}

export const DEFAULT_BRAIN_PARAMS: BrainParams = {
  dopamineSensitivity: 1.0,
  boredomThreshold: 0.35,
  visualAffinity: 1.0,
  hebbian: true,
  likeThreshold: 0.72,
  scrollThreshold: 0.68,
};

export const CATEGORY_LABEL: Record<Category, string> = {
  FOOD_SUGAR: 'Comida / Açúcar',
  SHARP_MOTION: 'Movimento Brusco',
  DANCE: 'Dança',
  CHAOTIC_NOISE: 'Ruído Caótico',
};

export const PACE_LABEL: Record<Pace, string> = {
  SLOW: 'Lento',
  MEDIUM: 'Médio',
  FRENETIC: 'Frenético',
};

export const PALETTE_LABEL: Record<Palette, string> = {
  WARM: 'Quente (âmbar/vermelho)',
  COLD: 'Fria (azul/verde)',
  NEON: 'Neon saturado',
  MONOCHROME: 'Monocromática',
};
