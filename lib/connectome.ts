/**
 * Carregador do conectoma real.
 *
 * Lê `public/flywire/connectome.bin`, gerado por `scripts/build-connectome.mjs`
 * a partir das anotações públicas do FlyWire (FAFB v783, CC-BY-4.0).
 *
 * Layout do binário:
 *   [Int16 x, y, z] × N     posições quantizadas (dividir por `quantization`)
 *   [Uint8 cluster] × N     índice da população de cada neurônio
 *
 * O resultado é memoizado em escopo de módulo: a cena 3D pode montar e
 * desmontar à vontade sem rebaixar o arquivo.
 */

export interface ConnectomeMeta {
  dataset: string;
  source: string;
  license: string;
  url: string;
  neuronCount: number;
  quantization: number;
  /** Quantos micrômetros reais vale uma unidade de cena. */
  micronsPerUnit: number;
  boundsMicrons: { min: number[]; max: number[] };
  clusterIndex: Record<string, number>;
  counts: Record<string, number>;
  sides: Record<string, number>;
}

export interface ConnectomeData {
  /** Posições em unidades de cena, prontas para o BufferGeometry. */
  positions: Float32Array;
  /** Índice da população de cada neurônio (0..4). */
  clusters: Uint8Array;
  meta: ConnectomeMeta;
}

let pending: Promise<ConnectomeData> | null = null;

export function loadConnectome(): Promise<ConnectomeData> {
  if (pending) return pending;

  pending = (async () => {
    const [metaRes, binRes] = await Promise.all([
      fetch('/flywire/connectome.json'),
      fetch('/flywire/connectome.bin'),
    ]);
    if (!metaRes.ok || !binRes.ok) {
      throw new Error(
        'conectoma não encontrado em /flywire — rode `node scripts/build-connectome.mjs`'
      );
    }

    const meta = (await metaRes.json()) as ConnectomeMeta;
    const buf = await binRes.arrayBuffer();

    const n = meta.neuronCount;
    const expected = n * 3 * 2 + n;
    if (buf.byteLength !== expected) {
      throw new Error(`connectome.bin com tamanho inesperado: ${buf.byteLength} ≠ ${expected}`);
    }

    const quant = new Int16Array(buf, 0, n * 3);
    const clusters = new Uint8Array(buf.slice(n * 3 * 2));

    const positions = new Float32Array(n * 3);
    const inv = 1 / meta.quantization;
    for (let i = 0; i < n * 3; i++) positions[i] = quant[i] * inv;

    return { positions, clusters, meta };
  })();

  // Uma falha não deve envenenar o cache: uma nova tentativa deve poder rodar.
  pending.catch(() => {
    pending = null;
  });

  return pending;
}
