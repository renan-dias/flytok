/**
 * O mundo da mosca: necessidades, objetos do ambiente, loja e propagandas.
 *
 * Este arquivo é só dados e tipos — a dinâmica vive em `FlyAgent.ts`. Separar
 * assim deixa explícito o que é *cenário* (editável, ajustável) e o que é
 * *comportamento* (aprendido).
 */

// ---------------------------------------------------------------------------
// Necessidades
// ---------------------------------------------------------------------------

export type NeedId = 'fome' | 'sede' | 'descanso' | 'estimulo';

export interface NeedSpec {
  id: NeedId;
  label: string;
  emoji: string;
  /** Quanto a necessidade cresce por segundo, de 0 (saciada) a 1 (desesperada). */
  ratePerSecond: number;
  /** Acima disso a necessidade domina a emoção e o comportamento. */
  urgentAt: number;
}

export const NEEDS: NeedSpec[] = [
  { id: 'fome', label: 'Fome', emoji: '🍯', ratePerSecond: 1 / 85, urgentAt: 0.6 },
  { id: 'sede', label: 'Sede', emoji: '💧', ratePerSecond: 1 / 75, urgentAt: 0.6 },
  { id: 'descanso', label: 'Descanso', emoji: '😴', ratePerSecond: 1 / 170, urgentAt: 0.7 },
  { id: 'estimulo', label: 'Estímulo', emoji: '✨', ratePerSecond: 1 / 65, urgentAt: 0.65 },
];

export const NEED_IDS: NeedId[] = NEEDS.map((n) => n.id);

// ---------------------------------------------------------------------------
// Objetos do mundo
// ---------------------------------------------------------------------------

export type ItemCategory = 'comida' | 'bebida' | 'descanso' | 'lazer';

export interface ItemSpec {
  id: string;
  label: string;
  emoji: string;
  category: ItemCategory;
  /** Necessidade que o objeto alivia ao ser usado. */
  satisfies: NeedId;
  /** Quanto da necessidade é aliviado por uso (0..1). */
  potency: number;
  /** Usos até acabar. `Infinity` para objetos permanentes. */
  uses: number;
  /** Preço na loja. Objetos iniciais também têm preço: podem ser repostos. */
  price: number;
  /** Segundos entre a compra e a chegada da encomenda. */
  deliverySeconds: number;
  /** Já está no ambiente quando o laboratório abre? */
  presentAtStart: boolean;
  description: string;
  /** Chamada publicitária usada quando este item vira propaganda. */
  adCopy: string;
}

/**
 * O ambiente começa com água e um poleiro — mas **sem nenhuma comida**.
 * Essa lacuna é de propósito: é a fome que vai empurrar a mosca a descobrir
 * sozinha que existe um jeito de conseguir comida.
 */
export const ITEMS: ItemSpec[] = [
  {
    id: 'orvalho',
    label: 'Gota de orvalho',
    emoji: '💧',
    category: 'bebida',
    satisfies: 'sede',
    potency: 0.8,
    uses: Infinity,
    price: 6,
    deliverySeconds: 10,
    presentAtStart: true,
    description: 'Sempre presente na bancada. Mata a sede, não a fome.',
    adCopy: 'Hidratação que nunca acaba.',
  },
  {
    id: 'poleiro',
    label: 'Poleiro de arame',
    emoji: '🪵',
    category: 'descanso',
    satisfies: 'descanso',
    potency: 0.55,
    uses: Infinity,
    price: 14,
    deliverySeconds: 18,
    presentAtStart: true,
    description: 'Um lugar duro para pousar. Descansa, mas mal.',
    adCopy: 'Pouse em algum lugar.',
  },
  {
    id: 'melado',
    label: 'Gota de melado',
    emoji: '🍯',
    category: 'comida',
    satisfies: 'fome',
    potency: 0.45,
    uses: 3,
    price: 7,
    deliverySeconds: 12,
    presentAtStart: false,
    description: 'Barato e rápido. Tira a fome por pouco tempo.',
    adCopy: 'Açúcar puro, entrega em segundos.',
  },
  {
    id: 'fruta',
    label: 'Fruta madura',
    emoji: '🍑',
    category: 'comida',
    satisfies: 'fome',
    potency: 0.85,
    uses: 4,
    price: 13,
    deliverySeconds: 22,
    presentAtStart: false,
    description: 'O que uma Drosophila realmente quer. Fermentando no ponto.',
    adCopy: 'Fermentada no ponto. Você merece.',
  },
  {
    id: 'acucar',
    label: 'Cristal de açúcar',
    emoji: '🍬',
    category: 'comida',
    satisfies: 'fome',
    potency: 1,
    uses: 6,
    price: 27,
    deliverySeconds: 38,
    presentAtStart: false,
    description: 'Recompensa máxima por uso, e dura bastante.',
    adCopy: 'O pico de dopamina que a natureza esqueceu.',
  },
  {
    id: 'ninho',
    label: 'Ninho de algodão',
    emoji: '🛏️',
    category: 'descanso',
    satisfies: 'descanso',
    potency: 1,
    uses: Infinity,
    price: 31,
    deliverySeconds: 46,
    presentAtStart: false,
    description: 'Descanso profundo. Substitui o poleiro com folga.',
    adCopy: 'Durma como uma larva.',
  },
  {
    id: 'espelho',
    label: 'Espelho giratório',
    emoji: '🪞',
    category: 'lazer',
    satisfies: 'estimulo',
    potency: 0.7,
    uses: Infinity,
    price: 19,
    deliverySeconds: 26,
    presentAtStart: false,
    description: 'Estímulo visual sem precisar do feed.',
    adCopy: 'Entretenimento que não pede sua atenção de volta.',
  },
  {
    id: 'flor',
    label: 'Flor de néctar',
    emoji: '🌸',
    category: 'comida',
    satisfies: 'fome',
    potency: 0.7,
    uses: 5,
    price: 36,
    deliverySeconds: 44,
    presentAtStart: false,
    description: 'Comida e estímulo no mesmo objeto.',
    adCopy: 'Beleza que alimenta.',
  },
];

export const ITEM_BY_ID: Record<string, ItemSpec> = Object.fromEntries(
  ITEMS.map((i) => [i.id, i])
);

/** Itens que a loja vende (todos, inclusive repor os iniciais). */
export const SHOP_ITEMS = ITEMS;

// ---------------------------------------------------------------------------
// Propagandas
// ---------------------------------------------------------------------------

export interface AdPhoto {
  title: string;
  license: string;
  url: string;
}

/**
 * Fotos públicas de Culicidae (mosquitos) usadas como criativo publicitário —
 * o "outro inseto" que aparece anunciando coisas para a mosca.
 *
 * Todas vêm do Wikimedia Commons, categoria Culicidae, com licença verificada.
 * A atribuição aparece no rodapé do painel de propagandas.
 */
export const MOSQUITO_PHOTOS: AdPhoto[] = [
  {
    title: 'Hong Kong Biodiversity Museum mosquito collection',
    license: 'CC0',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/Hong_Kong_Biodiversity_Museum_mosquito_collection.jpg/960px-Hong_Kong_Biodiversity_Museum_mosquito_collection.jpg',
  },
  {
    title: 'A close-up photo of a Mosquito biting a person',
    license: 'Public domain',
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/d4/A_close-up_photo_of_a_Mosquito_biting_a_person._%28d08b41e7-cf15-44dd-a64d-534b0672453f%29.jpg',
  },
  {
    title: 'Aedes washinoi',
    license: 'CC0',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/31/Aedes_Washinoi.png/960px-Aedes_Washinoi.png',
  },
  {
    title: 'Zancudo (Culicidae)',
    license: 'CC BY 4.0',
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/76/Zancudo_%28Culicidae%29.jpg',
  },
  {
    title: 'Insecto sobre ropa',
    license: 'CC BY 4.0',
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Insecto_sobre_ropa.jpg',
  },
  {
    title: 'ခြင် (mosquito)',
    license: 'CC BY-SA 4.0',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e7/%E1%80%81%E1%80%BC%E1%80%84%E1%80%BA.jpg/960px-%E1%80%81%E1%80%BC%E1%80%84%E1%80%BA.jpg',
  },
  {
    title: 'Mosquito (85791)',
    license: 'CC BY-SA 4.0',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/5/57/Mosquito_%2885791%29.jpg/960px-Mosquito_%2885791%29.jpg',
  },
  {
    title: 'Mosquito — Oklahoma',
    license: 'CC BY 2.0',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c5/Mosquito_-_Oklahoma.jpg/960px-Mosquito_-_Oklahoma.jpg',
  },
  {
    title: 'Komár, další skrytý opylovač',
    license: 'CC BY-SA 4.0',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/de/Kom%C3%A1r_dal%C5%A1%C3%AD_skryt%C3%BD_opylova%C4%8D.jpg/960px-Kom%C3%A1r_dal%C5%A1%C3%AD_skryt%C3%BD_opylova%C4%8D.jpg',
  },
  {
    title: 'Mosquito Anopheles, 100×',
    license: 'CC BY 4.0',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dd/Mosquito_Anopheles_100x_actual_height_about_2.4mm.jpg/960px-Mosquito_Anopheles_100x_actual_height_about_2.4mm.jpg',
  },
];

/** Durações permitidas de um anúncio, em segundos. */
export const AD_DURATIONS = [1, 3, 5, 10] as const;
export type AdDuration = (typeof AD_DURATIONS)[number];

// ---------------------------------------------------------------------------
// Ciclo dia/noite
// ---------------------------------------------------------------------------

/** Duração de um dia simulado, em segundos reais. */
export const DAY_LENGTH_SECONDS = 240;

export type DayPhase = 'madrugada' | 'amanhecer' | 'dia' | 'entardecer' | 'noite';

/** Converte a fase do dia (0..1, 0 = meia-noite) num rótulo legível. */
export function dayPhaseOf(phase: number): DayPhase {
  if (phase < 0.2) return 'madrugada';
  if (phase < 0.3) return 'amanhecer';
  if (phase < 0.7) return 'dia';
  if (phase < 0.8) return 'entardecer';
  return 'noite';
}

/** Relógio 24 h a partir da fase, para exibição. */
export function clockOf(phase: number): string {
  const total = phase * 24 * 60;
  const h = Math.floor(total / 60) % 24;
  const m = Math.floor(total % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Quanto de luz ambiente existe no mundo (0 = noite fechada, 1 = meio-dia).
 * Também modula o quanto a tela do celular domina a atenção: à noite, a tela é
 * a única fonte de luz — e pesa mais.
 */
export function daylightOf(phase: number): number {
  // Curva suave com pico às 12 h e mínimo às 0 h.
  return Math.max(0, Math.sin((phase - 0.25) * Math.PI * 2) * 0.5 + 0.5);
}
