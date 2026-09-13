/**
 * feedEngine
 * ----------
 * O feed infinito e o algoritmo que decide o que vem a seguir.
 *
 * Duas coisas acontecem aqui:
 *
 * 1. **Recomendação.** O motor mantém uma afinidade aprendida por categoria,
 *    ritmo e paleta, alimentada pelo que a mosca de fato fez — tempo de
 *    retenção e likes. O próximo item é sorteado por softmax sobre esse score,
 *    com uma fatia de exploração. É o mesmo laço de qualquer feed de vídeo
 *    curto: quanto mais ela assiste algo, mais daquilo ela recebe.
 *
 * 2. **Publicidade.** A cada poucos itens entra um anúncio de 1, 3, 5 ou 10
 *    segundos, com foto pública de mosquito, promovendo um objeto da loja —
 *    preferencialmente o que atende à necessidade que mais dói no momento.
 *
 * O feed nunca acaba: itens são gerados sob demanda a partir de um catálogo
 * procedural, misturado com o que a comunidade adicionou.
 */

import {
  Category,
  Pace,
  Palette,
  VideoItem,
  WatchRecord,
} from './types';
import { AdDuration, ItemSpec, MOSQUITO_PHOTOS } from './world';

// ---------------------------------------------------------------------------
// Catálogo procedural
// ---------------------------------------------------------------------------

const CATEGORIES: Category[] = ['FOOD_SUGAR', 'SHARP_MOTION', 'DANCE', 'CHAOTIC_NOISE'];
const PACES: Pace[] = ['SLOW', 'MEDIUM', 'FRENETIC'];
const PALETTES: Palette[] = ['WARM', 'COLD', 'NEON', 'MONOCHROME'];

/** Títulos por categoria, combinados com um sufixo para dar variedade infinita. */
const TITLE_STEMS: Record<Category, string[]> = {
  FOOD_SUGAR: [
    'Calda escorrendo',
    'Fruta fermentando',
    'Cristal de açúcar girando',
    'Mel derramado',
    'Banana passando do ponto',
    'Xarope em câmera lenta',
  ],
  SHARP_MOTION: [
    'Corte a cada 4 quadros',
    'Câmera sacudindo',
    'Zoom estourado',
    'Perseguição em primeira pessoa',
    'Chicote de câmera',
    'Queda livre',
  ],
  DANCE: [
    'Coreografia em loop',
    'Passo repetido 40 vezes',
    'Trend da semana',
    'Dança com strobe',
    'Duo sincronizado',
    'Giro infinito',
  ],
  CHAOTIC_NOISE: [
    'Ruído puro',
    'Trinta cortes sem sentido',
    'Estática colorida',
    'Colagem aleatória',
    'Feed dentro do feed',
    'Sobrecarga sensorial',
  ],
};

const TITLE_SUFFIX = [
  '',
  ' (parte 2)',
  ' — versão longa',
  ' #fyp',
  ' em 4K',
  ' que viralizou',
  ' sem áudio',
  ' v3',
];

// ---------------------------------------------------------------------------
// Afinidade aprendida
// ---------------------------------------------------------------------------

interface Affinity {
  category: Record<Category, number>;
  pace: Record<Pace, number>;
  palette: Record<Palette, number>;
}

function emptyAffinity(): Affinity {
  return {
    category: { FOOD_SUGAR: 0, SHARP_MOTION: 0, DANCE: 0, CHAOTIC_NOISE: 0 },
    pace: { SLOW: 0, MEDIUM: 0, FRENETIC: 0 },
    palette: { WARM: 0, COLD: 0, NEON: 0, MONOCHROME: 0 },
  };
}

/** Perfil de gosto exposto na UI. */
export interface TasteProfile {
  category: { key: Category; score: number }[];
  pace: { key: Pace; score: number }[];
  palette: { key: Palette; score: number }[];
  /** Quantos itens já entraram no cálculo. */
  samples: number;
}

export class FeedEngine {
  /** Afinidade acumulada — cresce com retenção e likes, decai devagar. */
  private affinity: Affinity = emptyAffinity();
  private samples = 0;

  /** Itens adicionados pela comunidade, reaproveitados no sorteio. */
  private communityPool: VideoItem[] = [];

  private serial = 0;
  /** Quantos itens de conteúdo desde o último anúncio. */
  private sinceAd = 0;
  /** Sorteia o intervalo até o próximo anúncio, entre 3 e 5 itens. */
  private adGap = 3 + Math.floor(Math.random() * 3);

  private photoCursor = Math.floor(Math.random() * MOSQUITO_PHOTOS.length);

  // -- comunidade -----------------------------------------------------------

  setCommunityPool(items: VideoItem[]) {
    this.communityPool = items.filter((i) => !i.isAd);
  }

  // -- aprendizado do gosto -------------------------------------------------

  /**
   * Incorpora uma sessão concluída. Retenção longa e like empurram a afinidade
   * para cima; descarte rápido empurra para baixo. É deliberadamente a mesma
   * métrica que um feed real otimiza.
   */
  learnFrom(record: WatchRecord, item: VideoItem | undefined) {
    if (!item || item.isAd) return;
    // Normaliza retenção: 10 s é uma sessão "boa".
    const retention = Math.min(2, record.retentionMs / 10_000);
    const signal = retention - 0.45 + (record.liked ? 0.8 : 0);

    const apply = <K extends string>(map: Record<K, number>, key: K) => {
      map[key] += signal * 0.35;
      // Decaimento suave em tudo, para o perfil poder mudar de ideia.
      for (const k of Object.keys(map) as K[]) map[k] *= 0.985;
    };

    apply(this.affinity.category, item.category);
    apply(this.affinity.pace, item.pace);
    apply(this.affinity.palette, item.palette);
    this.samples++;
  }

  taste(): TasteProfile {
    const rank = <K extends string>(m: Record<K, number>) =>
      (Object.entries(m) as [K, number][])
        .map(([key, score]) => ({ key, score }))
        .sort((a, b) => b.score - a.score);
    return {
      category: rank(this.affinity.category),
      pace: rank(this.affinity.pace),
      palette: rank(this.affinity.palette),
      samples: this.samples,
    };
  }

  // -- geração --------------------------------------------------------------

  /** Softmax com temperatura: temperatura alta = feed mais exploratório. */
  private sampleWeighted<K extends string>(scores: Record<K, number>, temperature: number): K {
    const keys = Object.keys(scores) as K[];
    const max = Math.max(...keys.map((k) => scores[k]));
    const weights = keys.map((k) => Math.exp((scores[k] - max) / temperature));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < keys.length; i++) {
      r -= weights[i];
      if (r <= 0) return keys[i];
    }
    return keys[keys.length - 1];
  }

  private nextId(prefix: string) {
    this.serial += 1;
    return `${prefix}-${this.serial}-${Math.random().toString(36).slice(2, 6)}`;
  }

  /** Um clipe procedural, escolhido segundo o gosto aprendido. */
  private generateContent(temperature: number): VideoItem {
    // 35% das vezes reaproveita algo da comunidade, se houver — assim o que o
    // usuário adiciona continua circulando no feed infinito.
    if (this.communityPool.length > 0 && Math.random() < 0.35) {
      const src = this.communityPool[Math.floor(Math.random() * this.communityPool.length)];
      return { ...src, id: this.nextId('rep') };
    }

    const category = this.sampleWeighted(this.affinity.category, temperature);
    const pace = this.sampleWeighted(this.affinity.pace, temperature);
    const palette = this.sampleWeighted(this.affinity.palette, temperature);

    const stems = TITLE_STEMS[category];
    const title =
      stems[Math.floor(Math.random() * stems.length)] +
      TITLE_SUFFIX[Math.floor(Math.random() * TITLE_SUFFIX.length)];

    return {
      id: this.nextId('gen'),
      title,
      url: '',
      kind: 'PROCEDURAL',
      pace,
      palette,
      category,
      addedBy: 'algoritmo',
    };
  }

  /** Um anúncio de 1, 3, 5 ou 10 segundos para um item da loja. */
  private generateAd(item: ItemSpec, duration: AdDuration): VideoItem {
    const photo = MOSQUITO_PHOTOS[this.photoCursor % MOSQUITO_PHOTOS.length];
    this.photoCursor++;

    return {
      id: this.nextId('ad'),
      title: item.label,
      url: photo.url,
      kind: 'IMAGE',
      // Anúncio é sempre visualmente agressivo: é assim que ele compra atenção.
      pace: duration <= 3 ? 'FRENETIC' : 'MEDIUM',
      palette: 'NEON',
      category: item.satisfies === 'fome' ? 'FOOD_SUGAR' : 'SHARP_MOTION',
      addedBy: 'patrocinado',
      isAd: true,
      adItemId: item.id,
      adDurationSeconds: duration,
      adCopy: item.adCopy,
      photoCredit: `${photo.title} · ${photo.license} · Wikimedia Commons`,
    };
  }

  /**
   * Próximo item do feed. `pickAd` é consultado só quando chegou a vez de um
   * anúncio — quem escolhe o produto é o agente, que sabe o que está faltando.
   */
  next(pickAd: () => { item: ItemSpec; duration: AdDuration }): VideoItem {
    if (this.sinceAd >= this.adGap) {
      this.sinceAd = 0;
      this.adGap = 3 + Math.floor(Math.random() * 3);
      const { item, duration } = pickAd();
      return this.generateAd(item, duration);
    }
    this.sinceAd++;

    // Temperatura cai conforme o perfil ganha confiança: o feed começa
    // diverso e vai fechando o cerco em torno do que prende a mosca.
    const temperature = Math.max(0.35, 1.6 - this.samples * 0.035);
    return this.generateContent(temperature);
  }

  reset() {
    this.affinity = emptyAffinity();
    this.samples = 0;
    this.sinceAd = 0;
    this.adGap = 3 + Math.floor(Math.random() * 3);
  }

  /** Estado serializável do algoritmo de recomendação. */
  exportState() {
    return {
      affinity: this.affinity,
      samples: this.samples,
      serial: this.serial,
      sinceAd: this.sinceAd,
      adGap: this.adGap,
      photoCursor: this.photoCursor,
    };
  }

  importState(data: Partial<ReturnType<FeedEngine['exportState']>> | undefined) {
    if (!data) return;
    if (data.affinity) {
      this.affinity = {
        category: { ...this.affinity.category, ...data.affinity.category },
        pace: { ...this.affinity.pace, ...data.affinity.pace },
        palette: { ...this.affinity.palette, ...data.affinity.palette },
      };
    }
    if (typeof data.samples === 'number') this.samples = data.samples;
    if (typeof data.serial === 'number') this.serial = data.serial;
    if (typeof data.sinceAd === 'number') this.sinceAd = data.sinceAd;
    if (typeof data.adGap === 'number') this.adGap = data.adGap;
    if (typeof data.photoCursor === 'number') this.photoCursor = data.photoCursor;
  }
}

export { CATEGORIES, PACES, PALETTES };
