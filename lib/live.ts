import { BrainSnapshot, VideoStimulus } from './types';
import { NULL_STIMULUS } from './FlyBrainCore';

/**
 * Canal "quente" entre o loop de simulação (10 Hz) e a cena 3D (60 Hz).
 *
 * A cena lê este objeto mutável dentro de `useFrame` em vez de assinar o store
 * do Zustand: isso evita que o React re-renderize a árvore do Canvas dez vezes
 * por segundo, o que derrubaria o frame rate. Os painéis de UI, que toleram
 * 10 Hz, continuam usando seletores normais do store.
 */
export interface LiveChannel {
  snapshot: BrainSnapshot | null;
  stimulus: VideoStimulus;
  /** Pulso de like: setado em 1 e decaído a cada frame pela cena. */
  likePulse: number;
  /** Pulso de scroll: idem, dirige a animação da pata para cima. */
  scrollPulse: number;
  /** Pulso de comentário: a pata digita e o emoji sobe na tela. */
  commentPulse: number;
  /** Pulso de consumo: a mosca se abaixa até o objeto. */
  consumePulse: number;
  /** Último emoji postado pela mosca. */
  lastComment: string;
  /** Contador monotônico de likes — usado para emitir partículas de coração. */
  likeCount: number;
  /** Timestamp (performance.now) do último like, para o spawn de partículas. */
  lastLikeAt: number;
  /** Playlist tocando ou pausada. */
  running: boolean;
  /** A mosca está de fato olhando para a tela? (senão, está em outra atividade) */
  watching: boolean;
  /** Segundos restantes do anúncio em exibição; 0 quando não há anúncio. */
  adRemaining: number;
  /** Fase do dia, 0..1 (0 = meia-noite). Dirige a luz da cena. */
  dayPhase: number;
}

export const live: LiveChannel = {
  snapshot: null,
  stimulus: NULL_STIMULUS,
  likePulse: 0,
  scrollPulse: 0,
  commentPulse: 0,
  consumePulse: 0,
  lastComment: '🙂',
  likeCount: 0,
  lastLikeAt: -1,
  running: false,
  watching: true,
  adRemaining: 0,
  dayPhase: 0.35,
};
