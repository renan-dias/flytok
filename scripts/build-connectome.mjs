/**
 * build-connectome.mjs
 * --------------------
 * Baixa as anotações públicas do conectoma FlyWire (FAFB v783) e as converte
 * num binário compacto que o navegador carrega em ~1 MB.
 *
 *   node scripts/build-connectome.mjs
 *
 * Fonte: Schlegel et al. (2024), "Whole-brain annotation and multi-connectome
 * cell typing of Drosophila", Nature 634, 139-152.
 * Arquivo: flyconnectome/flywire_annotations, Supplemental_file1 (CC-BY-4.0).
 *
 * Saída:
 *   public/flywire/connectome.bin   posições Int16 (x,y,z) + cluster Uint8
 *   public/flywire/connectome.json  metadados: contagens reais, escala, fonte
 *
 * As posições são as coordenadas reais de cada neurônio no volume FAFB
 * (voxels de 4 x 4 x 40 nm), convertidas para micrômetros, centradas na origem
 * e normalizadas para caber num cubo de lado ~2 — as proporções anatômicas do
 * cérebro são preservadas.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'flywire');
const CACHE = path.join(ROOT, '.cache', 'flywire_annotations.tsv');

const SOURCE_URL =
  'https://raw.githubusercontent.com/flyconnectome/flywire_annotations/main/supplemental_files/Supplemental_file1_neuron_annotations.tsv';

/** Voxel do FAFB em nanômetros. */
const VOXEL_NM = [4, 4, 40];

/**
 * Índice de cada população no shader. O cluster 4 ("other") é todo o resto do
 * cérebro: são esses ~50 mil neurônios que dão ao holograma a silhueta real.
 */
const CLUSTER_INDEX = {
  visualLobula: 0,
  pamDopamine: 1,
  ppl1Aversion: 2,
  centralComplex: 3,
  other: 4,
};

/**
 * Regras de atribuição, aplicadas em ordem — a primeira que casar vence.
 * Todas usam colunas reais da tabela de anotações; nada é inventado aqui.
 */
function classify({ cellType, cellClass, superClass }) {
  // Neurônios dopaminérgicos PAM — o cluster de recompensa (307 no volume).
  if (cellType.startsWith('PAM')) return CLUSTER_INDEX.pamDopamine;

  // PPL1 — punição / sinal aversivo (16 no volume).
  if (cellType.startsWith('PPL1')) return CLUSTER_INDEX.ppl1Aversion;

  // Complexo central: corpo em leque, elipsoide, protocerebral bridge, nódulos.
  if (cellClass === 'CX') return CLUSTER_INDEX.centralComplex;

  // Lobula e lobula plate — onde vivem as células tangenciais sensíveis a
  // movimento. `cell_class` codifica o trajeto entre neurópilos (ex.: "ME>LOP").
  if (/\bLOP?\b/.test(cellClass.replace(/[>.]/g, ' '))) return CLUSTER_INDEX.visualLobula;
  if (superClass === 'visual_projection') return CLUSTER_INDEX.visualLobula;

  return CLUSTER_INDEX.other;
}

async function ensureSource() {
  if (fs.existsSync(CACHE)) {
    console.log(`· usando cache ${path.relative(ROOT, CACHE)}`);
    return CACHE;
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  console.log('· baixando anotações do FlyWire (~32 MB)…');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`download falhou: HTTP ${res.status}`);
  fs.writeFileSync(CACHE, Buffer.from(await res.arrayBuffer()));
  return CACHE;
}

async function main() {
  const src = await ensureSource();
  const text = fs.readFileSync(src, 'utf8');
  const lines = text.split('\n');
  const header = lines[0].split('\t');

  const col = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`coluna ausente na fonte: ${name}`);
    return i;
  };
  const iRoot = col('root_id');
  const iPos = [col('pos_x'), col('pos_y'), col('pos_z')];
  const iSoma = [col('soma_x'), col('soma_y'), col('soma_z')];
  const iCellType = col('cell_type');
  const iCellClass = col('cell_class');
  const iSuperClass = col('super_class');
  const iSide = col('side');

  /** @type {{x:number,y:number,z:number,cluster:number}[]} */
  const neurons = [];
  const counts = { visualLobula: 0, pamDopamine: 0, ppl1Aversion: 0, centralComplex: 0, other: 0 };
  const sides = {};
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split('\t');
    if (!c[iRoot]) continue;

    // Prefere a posição do soma; cai para a posição de referência do neurônio
    // quando o núcleo não foi identificado.
    const useSoma = c[iSoma[0]] !== '' && c[iSoma[0]] !== undefined;
    const raw = useSoma ? iSoma.map((k) => Number(c[k])) : iPos.map((k) => Number(c[k]));
    if (!raw.every(Number.isFinite)) {
      skipped++;
      continue;
    }

    const cluster = classify({
      cellType: (c[iCellType] ?? '').trim(),
      cellClass: (c[iCellClass] ?? '').trim(),
      superClass: (c[iSuperClass] ?? '').trim(),
    });

    const name = Object.keys(CLUSTER_INDEX).find((k) => CLUSTER_INDEX[k] === cluster);
    counts[name]++;
    const side = (c[iSide] ?? '').trim() || 'unknown';
    sides[side] = (sides[side] ?? 0) + 1;

    neurons.push({
      // nm → µm
      x: (raw[0] * VOXEL_NM[0]) / 1000,
      y: (raw[1] * VOXEL_NM[1]) / 1000,
      z: (raw[2] * VOXEL_NM[2]) / 1000,
      cluster,
    });
  }

  // ---- centraliza e normaliza preservando as proporções ----
  const bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const n of neurons) {
    const v = [n.x, n.y, n.z];
    for (let k = 0; k < 3; k++) {
      if (v[k] < bounds.min[k]) bounds.min[k] = v[k];
      if (v[k] > bounds.max[k]) bounds.max[k] = v[k];
    }
  }
  const center = bounds.min.map((v, k) => (v + bounds.max[k]) / 2);
  const extent = bounds.max.map((v, k) => v - bounds.min[k]);
  // Escala única para os três eixos: a anatomia não pode ser distorcida.
  const scale = 2 / Math.max(...extent);

  const N = neurons.length;
  const pos = new Int16Array(N * 3);
  const clusters = new Uint8Array(N);
  // Int16 vai de -32768 a 32767; usamos 16000 como meia-faixa, deixando folga.
  const Q = 16000;

  neurons.forEach((n, i) => {
    const x = (n.x - center[0]) * scale;
    // FAFB cresce em Y para baixo (dorsal → ventral): invertemos para o cérebro
    // aparecer na vertical correta na cena.
    const y = -(n.y - center[1]) * scale;
    const z = (n.z - center[2]) * scale;
    pos[i * 3] = Math.round(x * Q);
    pos[i * 3 + 1] = Math.round(y * Q);
    pos[i * 3 + 2] = Math.round(z * Q);
    clusters[i] = n.cluster;
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(clusters.buffer)]);
  fs.writeFileSync(path.join(OUT_DIR, 'connectome.bin'), bin);

  const meta = {
    dataset: 'FlyWire FAFB v783',
    source: 'Schlegel et al. 2024, Nature 634:139-152 — flywire_annotations Supplemental_file1',
    license: 'CC-BY-4.0',
    url: SOURCE_URL,
    generatedAt: new Date().toISOString(),
    neuronCount: N,
    skipped,
    quantization: Q,
    /** Multiplicador para voltar de unidades de cena a micrômetros reais. */
    micronsPerUnit: 1 / scale,
    boundsMicrons: bounds,
    clusterIndex: CLUSTER_INDEX,
    counts,
    sides,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'connectome.json'), JSON.stringify(meta, null, 2));

  console.log(`\n✓ ${N.toLocaleString('pt-BR')} neurônios reais gravados`);
  console.log(`  ${(bin.length / 1e6).toFixed(2)} MB em public/flywire/connectome.bin`);
  console.log(`  extensão do cérebro: ${extent.map((e) => e.toFixed(0)).join(' × ')} µm`);
  console.log('  populações:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`    ${k.padEnd(15)} ${String(v).padStart(7)}`);
  }
  if (skipped) console.log(`  (${skipped} sem coordenada utilizável, descartados)`);
}

main().catch((err) => {
  console.error('falhou:', err.message);
  process.exit(1);
});
