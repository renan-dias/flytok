'use client';

import { create } from 'zustand';
import { FlyBrainCore, NULL_STIMULUS, stimulusFromTags } from '@/lib/FlyBrainCore';
import { AgentSnapshot, FlyAgent } from '@/lib/FlyAgent';
import { FeedEngine, TasteProfile } from '@/lib/feedEngine';
import { ConnectomeMeta } from '@/lib/connectome';
import { live } from '@/lib/live';
import { parseMediaUrl } from '@/lib/media';
import { ITEM_BY_ID } from '@/lib/world';
import {
  BrainParams,
  BrainSnapshot,
  Category,
  DEFAULT_BRAIN_PARAMS,
  Pace,
  Palette,
  VideoItem,
  WatchRecord,
} from '@/lib/types';

const STORAGE_KEY = 'flytok.neural-config.v2';

/** Quantos itens do feed infinito ficam materializados à frente. */
const QUEUE_AHEAD = 8;

/**
 * Instâncias únicas. Ficam fora do store porque são objetos mutáveis de alta
 * frequência — o Zustand guarda apenas os snapshots imutáveis resultantes.
 */
export const brain = new FlyBrainCore(DEFAULT_BRAIN_PARAMS);
export const agent = new FlyAgent();
export const feedEngine = new FeedEngine();

/**
 * Clipes iniciais da comunidade.
 *
 * Não precisam mais de CORS: tudo passa pelo proxy same-origin `/api/media`.
 * (O bucket de amostras do Google que estava aqui antes virou 403 — todo ele.)
 */
const SEED_VIDEOS: VideoItem[] = [
  {
    id: 'seed-1',
    title: 'Corte rápido neon',
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
    kind: 'MP4',
    pace: 'FRENETIC',
    palette: 'NEON',
    category: 'SHARP_MOTION',
    addedBy: 'lab',
  },
  {
    id: 'seed-2',
    title: 'Xarope de açúcar em câmera lenta',
    url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/360/Jellyfish_360_10s_1MB.mp4',
    kind: 'MP4',
    pace: 'SLOW',
    palette: 'WARM',
    category: 'FOOD_SUGAR',
    addedBy: 'lab',
  },
  {
    id: 'seed-3',
    title: 'Dança com strobe',
    url: 'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4',
    kind: 'MP4',
    pace: 'MEDIUM',
    palette: 'COLD',
    category: 'DANCE',
    addedBy: 'lab',
  },
  {
    id: 'seed-4',
    title: 'Ruído caótico de feed',
    url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4',
    kind: 'MP4',
    pace: 'FRENETIC',
    palette: 'NEON',
    category: 'CHAOTIC_NOISE',
    addedBy: 'lab',
  },
];

export interface NewVideoDraft {
  title: string;
  url: string;
  pace: Pace;
  palette: Palette;
  category: Category;
}

/** Versão do formato de save. Incompatibilidades são recusadas na leitura. */
export const SAVE_FORMAT = 'flytok.save.v1';

/** Documento exportado pelo menu principal. */
export interface SaveFile {
  format: typeof SAVE_FORMAT;
  savedAt: string;
  app: { name: string; version: string };
  brain: { params: BrainParams; plasticity: Record<Category, number> };
  agent: ReturnType<FlyAgent['exportState']>;
  feed: ReturnType<FeedEngine['exportState']>;
  world: {
    community: VideoItem[];
    queue: VideoItem[];
    history: WatchRecord[];
    retention: Record<string, number>;
    log: LogLine[];
  };
}

/** Linha do diário de eventos mostrada na UI. */
export interface LogLine {
  id: number;
  at: number;
  icon: string;
  text: string;
  tone: 'neutro' | 'bom' | 'dinheiro' | 'descoberta';
}

interface LabState {
  /** Itens adicionados por pessoas — reaproveitados pelo feed infinito. */
  community: VideoItem[];
  /** Fila materializada do feed infinito; índice 0 é o que está tocando. */
  queue: VideoItem[];
  history: WatchRecord[];
  retention: Record<string, number>;
  params: BrainParams;
  snapshot: BrainSnapshot | null;
  agentSnapshot: AgentSnapshot | null;
  taste: TasteProfile | null;
  running: boolean;
  toast: string | null;
  connectome: ConnectomeMeta | null;
  connectomeError: string | null;
  log: LogLine[];
  /** O menu principal está aberto? Começa aberto. */
  menuOpen: boolean;
  /** Já houve alguma simulação nesta sessão? Habilita "Continuar". */
  started: boolean;

  addVideo: (draft: NewVideoDraft) => { ok: boolean; error?: string };
  removeVideo: (id: string) => void;
  nextVideo: (reason: 'SCROLL' | 'MANUAL' | 'AD_END') => void;
  setParam: <K extends keyof BrainParams>(key: K, value: BrainParams[K]) => void;
  toggleRunning: () => void;
  resetAll: () => void;
  saveConfig: () => void;
  loadConfig: () => void;
  clearToast: () => void;
  /** Materializa a primeira fila. Só pode rodar no cliente (ver comentário). */
  bootstrap: () => void;
  setConnectome: (meta: ConnectomeMeta | null, error?: string) => void;
  tick: (dtMs: number) => void;

  // ---- menu principal ----
  openMenu: () => void;
  closeMenu: () => void;
  startNew: () => void;
  resume: () => void;
  pause: () => void;
  exportSave: () => SaveFile;
  downloadSave: () => void;
  importSave: (data: unknown) => { ok: boolean; error?: string };
}

let logSerial = 0;

export const useLabStore = create<LabState>((set, get) => {
  /** Preenche a fila até QUEUE_AHEAD itens. O feed nunca acaba. */
  function refill(queue: VideoItem[]): VideoItem[] {
    const out = [...queue];
    while (out.length < QUEUE_AHEAD) {
      out.push(
        feedEngine.next(() => ({
          item: agent.pickAdItem(),
          duration: agent.pickAdDuration(),
        }))
      );
    }
    return out;
  }

  function pushLog(lines: Omit<LogLine, 'id' | 'at'>[]) {
    if (lines.length === 0) return;
    const now = Date.now();
    const added = lines.map((l) => ({ ...l, id: ++logSerial, at: now }));
    set((s) => ({ log: [...added, ...s.log].slice(0, 80) }));
  }

  feedEngine.setCommunityPool(SEED_VIDEOS);

  return {
    community: SEED_VIDEOS,
    // A fila NÃO é gerada aqui.
    //
    // `refill` usa Math.random(), então rodar no módulo faria o servidor e o
    // cliente produzirem feeds diferentes — erro de hidratação garantido, com o
    // React descartando a árvore inteira. O `SimulationRunner` chama
    // `bootstrap()` na montagem, já no cliente.
    queue: [],
    history: [],
    retention: {},
    params: DEFAULT_BRAIN_PARAMS,
    snapshot: brain.peek(),
    agentSnapshot: agent.snapshot(),
    taste: feedEngine.taste(),
    running: false,
    toast: null,
    connectome: null,
    connectomeError: null,
    log: [],
    menuOpen: true,
    started: false,

    addVideo: (draft) => {
      const parsed = parseMediaUrl(draft.url);
      if (!parsed.ok) {
        return {
          ok: false,
          error:
            'URL inválida. Use http(s) com .mp4, uma imagem ou um link de Shorts/TikTok/YouTube.',
        };
      }

      const video: VideoItem = {
        id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: draft.title.trim() || 'Clipe sem título',
        url: draft.url.trim(),
        kind: parsed.kind,
        embedUrl: parsed.embedUrl,
        pace: draft.pace,
        palette: draft.palette,
        category: draft.category,
        addedBy: 'comunidade',
      };

      const community = [...get().community, video];
      feedEngine.setCommunityPool(community);
      // Entra logo depois do que está tocando, para aparecer rápido na tela.
      const queue = [...get().queue];
      queue.splice(1, 0, { ...video, id: `${video.id}-q` });
      set({ community, queue });
      return { ok: true };
    },

    removeVideo: (id) => {
      const community = get().community.filter((v) => v.id !== id);
      feedEngine.setCommunityPool(community);
      set({ community });
    },

    nextVideo: (reason) => {
      const { queue, retention } = get();
      const current = queue[0];
      if (!current) return;

      const snap = brain.peek();
      const record: WatchRecord = {
        videoId: current.id,
        title: current.isAd ? `[anúncio] ${current.title}` : current.title,
        category: current.category,
        retentionMs: snap.watchedMs,
        liked: snap.liked,
        peakDopamine: brain.currentPeakDopamine,
        finishedAt: Date.now(),
      };

      // O algoritmo aprende com o que aconteceu — anúncios não contam.
      feedEngine.learnFrom(record, current);

      brain.onVideoChange();
      live.scrollPulse = reason === 'SCROLL' ? 1 : 0.55;
      live.adRemaining = 0;

      // Retenção acumulada só faz sentido para itens da comunidade.
      const baseId = current.id.replace(/-q$/, '');
      const nextRetention = get().community.some((c) => c.id === baseId)
        ? { ...retention, [baseId]: (retention[baseId] ?? 0) + snap.watchedMs }
        : retention;

      set({
        queue: refill(queue.slice(1)),
        history: [record, ...get().history].slice(0, 60),
        retention: nextRetention,
        taste: feedEngine.taste(),
      });
    },

    setParam: (key, value) => {
      const params = { ...get().params, [key]: value };
      brain.setParams(params);
      set({ params });
    },

    toggleRunning: () => {
      const running = !get().running;
      live.running = running;
      set({ running });
    },

    resetAll: () => {
      brain.resetConnectome();
      brain.setParams(DEFAULT_BRAIN_PARAMS);
      agent.reset();
      feedEngine.reset();
      feedEngine.setCommunityPool(get().community);
      set({
        params: DEFAULT_BRAIN_PARAMS,
        snapshot: brain.peek(),
        agentSnapshot: agent.snapshot(),
        taste: feedEngine.taste(),
        history: [],
        retention: {},
        log: [],
        queue: refill([]),
        toast: 'Tudo zerado — conectoma, carteira e o que a mosca tinha aprendido',
      });
    },

    saveConfig: () => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            params: get().params,
            plasticity: brain.exportPlasticity(),
            agent: agent.exportState(),
            savedAt: Date.now(),
          })
        );
        set({ toast: 'Configuração neural e aprendizado salvos neste navegador' });
      } catch {
        set({ toast: 'Não foi possível salvar (localStorage indisponível)' });
      }
    },

    loadConfig: () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw) as {
          params?: BrainParams;
          plasticity?: Record<Category, number>;
          agent?: ReturnType<FlyAgent['exportState']>;
        };
        if (data.params) {
          const params = { ...DEFAULT_BRAIN_PARAMS, ...data.params };
          brain.setParams(params);
          set({ params });
        }
        if (data.plasticity) brain.importPlasticity(data.plasticity);
        if (data.agent) agent.importState(data.agent);
        set({ agentSnapshot: agent.snapshot() });
      } catch {
        /* configuração corrompida: ignora e segue com os defaults */
      }
    },

    clearToast: () => set({ toast: null }),

    bootstrap: () => {
      if (get().queue.length > 0) return;
      set({ queue: refill([]) });
    },

    setConnectome: (meta, error) => set({ connectome: meta, connectomeError: error ?? null }),

    openMenu: () => {
      live.running = false;
      set({ menuOpen: true, running: false });
    },

    closeMenu: () => set({ menuOpen: false }),

    startNew: () => {
      get().resetAll();
      live.running = true;
      set({ menuOpen: false, started: true, running: true, toast: null });
    },

    resume: () => {
      live.running = true;
      set({ menuOpen: false, started: true, running: true });
    },

    pause: () => {
      live.running = false;
      set({ running: false });
    },

    exportSave: () => ({
      format: SAVE_FORMAT,
      savedAt: new Date().toISOString(),
      app: { name: 'FlyTok', version: '0.1.0' },
      brain: { params: get().params, plasticity: brain.exportPlasticity() },
      agent: agent.exportState(),
      feed: feedEngine.exportState(),
      world: {
        community: get().community,
        queue: get().queue,
        history: get().history,
        retention: get().retention,
        log: get().log,
      },
    }),

    downloadSave: () => {
      try {
        const data = get().exportSave();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.href = url;
        a.download = `flytok-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoga depois de um tick: revogar na hora cancela o download no Firefox.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        set({ toast: 'Arquivo de save baixado' });
      } catch (err) {
        set({ toast: `Não foi possível salvar: ${(err as Error).message}` });
      }
    },

    importSave: (data) => {
      const save = data as Partial<SaveFile>;
      if (!save || typeof save !== 'object') {
        return { ok: false, error: 'Arquivo ilegível.' };
      }
      if (save.format !== SAVE_FORMAT) {
        return {
          ok: false,
          error: `Formato não reconhecido (${String(save.format ?? 'ausente')}). Esperado ${SAVE_FORMAT}.`,
        };
      }

      // Pausa antes de trocar o mundo por baixo do loop.
      live.running = false;

      if (save.brain?.params) {
        const params = { ...DEFAULT_BRAIN_PARAMS, ...save.brain.params };
        brain.setParams(params);
        set({ params });
      }
      brain.resetConnectome();
      if (save.brain?.plasticity) brain.importPlasticity(save.brain.plasticity);

      agent.reset();
      agent.importState(save.agent);
      feedEngine.reset();
      feedEngine.importState(save.feed);

      const world = save.world;
      const community = Array.isArray(world?.community) ? world!.community : SEED_VIDEOS;
      feedEngine.setCommunityPool(community);

      set({
        community,
        queue: refill(Array.isArray(world?.queue) ? world!.queue : []),
        history: Array.isArray(world?.history) ? world!.history : [],
        retention: world?.retention ?? {},
        log: Array.isArray(world?.log) ? world!.log : [],
        snapshot: brain.peek(),
        agentSnapshot: agent.snapshot(),
        taste: feedEngine.taste(),
        running: false,
        started: true,
        menuOpen: false,
        toast: `Save de ${new Date(save.savedAt ?? Date.now()).toLocaleString('pt-BR')} carregado`,
      });
      return { ok: true };
    },

    tick: (dtMs) => {
      const { running, queue } = get();
      const current = queue[0];

      if (!running || !current) {
        live.running = running;
        live.stimulus = NULL_STIMULUS;
        return;
      }

      // -- camada deliberativa: o que a mosca decide fazer com o tempo ------
      const prev = brain.peek();
      const agentEvents = agent.tick(
        dtMs,
        prev.dopamine,
        prev.aversion,
        prev.clusters.visualLobula
      );

      const watching = agent.isWatchingFeed;
      live.watching = watching;
      live.dayPhase = agent.dayPhase;

      // -- camada reflexa: só roda enquanto a mosca está de fato olhando ----
      const stim = watching ? stimulusFromTags(current, brain.time) : NULL_STIMULUS;
      const snapshot = brain.tick(dtMs, stim);
      live.snapshot = snapshot;
      live.stimulus = stim;

      // -- eventos do agente viram log e pulsos na cena ---------------------
      const lines: Omit<LogLine, 'id' | 'at'>[] = [];
      if (agentEvents.commented) {
        const c = agentEvents.commented;
        live.commentPulse = 1;
        live.lastComment = c.emoji;
        lines.push({
          icon: c.emoji,
          text: c.earned > 0 ? `comentou e recebeu ${c.earned} moedas` : 'comentou (sem retorno)',
          tone: c.earned > 0 ? 'dinheiro' : 'neutro',
        });
      }
      if (agentEvents.worked !== undefined) {
        lines.push({
          icon: '🛠️',
          text: `trabalhou e recebeu ${agentEvents.worked} moedas`,
          tone: 'dinheiro',
        });
      }
      if (agentEvents.bought) {
        const spec = ITEM_BY_ID[agentEvents.bought.itemId];
        lines.push({
          icon: '🛒',
          text: `comprou ${spec.label} por ${agentEvents.bought.price}${
            agentEvents.bought.influencedByAd ? ' (tinha visto o anúncio)' : ''
          }`,
          tone: 'neutro',
        });
      }
      if (agentEvents.delivered) {
        const spec = ITEM_BY_ID[agentEvents.delivered];
        lines.push({ icon: '📦', text: `chegou: ${spec.label}`, tone: 'bom' });
      }
      if (agentEvents.consumed) {
        const spec = ITEM_BY_ID[agentEvents.consumed.itemId];
        live.consumePulse = 1;
        lines.push({ icon: spec.emoji, text: `consumiu ${spec.label}`, tone: 'bom' });
      }
      if (agentEvents.discovered) {
        lines.push({
          icon: '💡',
          text: `descobriu: ${agentEvents.discovered.label}`,
          tone: 'descoberta',
        });
      }

      // -- anúncio em exibição ----------------------------------------------
      let advanced = false;
      if (current.isAd) {
        const total = current.adDurationSeconds ?? 5;
        const elapsed = snapshot.watchedMs / 1000;
        live.adRemaining = Math.max(0, total - elapsed);
        if (elapsed >= total) {
          // O anúncio foi exibido por inteiro: instala desejo pelo produto.
          if (current.adItemId) agent.onAdSeen(current.adItemId, total);
          get().nextVideo('AD_END');
          advanced = true;
        }
      } else {
        live.adRemaining = 0;
        // Fora do feed a mosca não rola nem curte — está ocupada em outra coisa.
        if (watching) {
          if (snapshot.action === 'LIKE') {
            live.likePulse = 1;
            live.likeCount += 1;
            live.lastLikeAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
          } else if (snapshot.action === 'SCROLL_NEXT') {
            get().nextVideo('SCROLL');
            advanced = true;
          }
        }
      }

      pushLog(lines);
      set({
        snapshot: advanced ? brain.peek() : snapshot,
        agentSnapshot: agent.snapshot(),
      });
    },
  };
});
