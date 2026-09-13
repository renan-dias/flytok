'use client';

import { useState } from 'react';
import {
  Clock,
  Film,
  Heart,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  Megaphone,
  Pause,
  Play,
  Plus,
  SkipForward,
  Trash2,
  Zap,
} from 'lucide-react';
import { useLabStore } from '@/store/useLabStore';
import { formatMs } from '@/lib/media';
import {
  CATEGORY_LABEL,
  Category,
  PACE_LABEL,
  PALETTE_LABEL,
  Pace,
  Palette,
} from '@/lib/types';

/**
 * FeedPanel (painel esquerdo)
 * --------------------------
 * O feed é infinito: o que aparece aqui é a fila que o algoritmo já
 * materializou à frente, sempre recomposta a partir do gosto aprendido da
 * mosca, com anúncios intercalados. O bloco da comunidade é o que pessoas
 * adicionaram — esses itens voltam a circular no sorteio.
 */

const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
const PACES = Object.keys(PACE_LABEL) as Pace[];
const PALETTES = Object.keys(PALETTE_LABEL) as Palette[];

const CATEGORY_DOT: Record<Category, string> = {
  FOOD_SUGAR: 'bg-amber-400',
  SHARP_MOTION: 'bg-cyan-400',
  DANCE: 'bg-fuchsia-400',
  CHAOTIC_NOISE: 'bg-rose-500',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-md border border-lab-edge sunken px-2.5 py-1.5 text-xs text-ink outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent/30';

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-lab-edge bg-lab-panel/80 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-accent">
        {icon} {title}
      </div>
      {children}
    </section>
  );
}

export default function FeedPanel() {
  const community = useLabStore((s) => s.community);
  const queue = useLabStore((s) => s.queue);
  const history = useLabStore((s) => s.history);
  const retention = useLabStore((s) => s.retention);
  const running = useLabStore((s) => s.running);
  const snapshot = useLabStore((s) => s.snapshot);
  const addVideo = useLabStore((s) => s.addVideo);
  const removeVideo = useLabStore((s) => s.removeVideo);
  const nextVideo = useLabStore((s) => s.nextVideo);
  const toggleRunning = useLabStore((s) => s.toggleRunning);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [pace, setPace] = useState<Pace>('FRENETIC');
  const [palette, setPalette] = useState<Palette>('NEON');
  const [category, setCategory] = useState<Category>('SHARP_MOTION');
  const [error, setError] = useState<string | null>(null);

  const current = queue[0] ?? null;
  const upcoming = queue.slice(1, 7);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = addVideo({ title, url, pace, palette, category });
    if (!res.ok) {
      setError(res.error ?? 'Não foi possível adicionar o clipe.');
      return;
    }
    setError(null);
    setTitle('');
    setUrl('');
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* ---------------- transporte ---------------- */}
      <Section icon={<Film size={13} />} title="Sessão">
        <div className="flex gap-2">
          <button
            onClick={toggleRunning}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition ${
              running
                ? 'bg-rose-500/15 text-rose-500 hover:bg-rose-500/25'
                : 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25'
            }`}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            {running ? 'Pausar exposição' : 'Iniciar exposição'}
          </button>
          <button
            onClick={() => nextVideo('MANUAL')}
            title="Forçar o próximo item"
            className="rounded-md border border-lab-edge px-3 py-2 text-ink-dim transition hover:border-accent/50 hover:text-accent"
          >
            <SkipForward size={14} />
          </button>
        </div>
        {current && (
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-ink-dim">
            <span className="truncate pr-2">
              {current.isAd ? <span className="text-amber-500">anúncio: </span> : 'Agora: '}
              <span className="text-ink">{current.title}</span>
            </span>
            <span className="shrink-0 font-mono text-accent">
              {formatMs(snapshot?.watchedMs ?? 0)}
            </span>
          </div>
        )}
      </Section>

      {/* ---------------- preview de embed ---------------- */}
      {current?.kind === 'EMBED' && current.embedUrl && (
        <section className="overflow-hidden rounded-lg border border-lab-edge bg-black">
          <iframe
            key={current.id}
            src={current.embedUrl}
            title={current.title}
            className="aspect-[9/16] w-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </section>
      )}

      {/* ---------------- a seguir ---------------- */}
      <Section icon={<InfinityIcon size={13} />} title="A seguir (feed infinito)">
        <ul className="space-y-1">
          {upcoming.map((v) => (
            <li
              key={v.id}
              className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                v.isAd ? 'border border-amber-500/30 bg-amber-500/10' : 'sunken'
              }`}
            >
              {v.isAd ? (
                <Megaphone size={11} className="shrink-0 text-amber-500" />
              ) : (
                <span className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_DOT[v.category]}`} />
              )}
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink-dim">{v.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                {v.isAd ? `${v.adDurationSeconds}s` : PACE_LABEL[v.pace].toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] leading-snug text-ink-faint">
          A ordem vem do algoritmo, que aprende com a retenção e os likes da mosca. Anúncios entram a
          cada 3 a 5 itens.
        </p>
      </Section>

      {/* ---------------- formulário ---------------- */}
      <Section icon={<Plus size={13} />} title="Adicionar da comunidade">
        <form onSubmit={submit} className="space-y-2.5">
          <Field label="Título">
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex.: Donut girando em neon"
            />
          </Field>
          <Field label="URL (mp4, imagem, Shorts, TikTok ou YouTube)">
            <input
              className={inputCls}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ritmo">
              <select
                className={inputCls}
                value={pace}
                onChange={(e) => setPace(e.target.value as Pace)}
              >
                {PACES.map((p) => (
                  <option key={p} value={p}>
                    {PACE_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cores">
              <select
                className={inputCls}
                value={palette}
                onChange={(e) => setPalette(e.target.value as Palette)}
              >
                {PALETTES.map((p) => (
                  <option key={p} value={p}>
                    {PALETTE_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Categoria">
            <select
              className={inputCls}
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          {error && <p className="text-[11px] text-rose-500">{error}</p>}
          <button
            type="submit"
            className="w-full rounded-md bg-accent/15 py-2 text-xs font-semibold text-accent transition hover:bg-accent/25"
          >
            Enviar para o feed
          </button>
        </form>
      </Section>

      {/* ---------------- comunidade ---------------- */}
      <Section icon={<ImageIcon size={13} />} title={`Da comunidade (${community.length})`}>
        <ul className="space-y-1.5">
          {community.map((v) => (
            <li key={v.id} className="group flex items-center gap-2 rounded-md sunken px-2 py-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_DOT[v.category]}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink">{v.title}</span>
                <span className="block truncate text-[10px] text-ink-faint">
                  {PACE_LABEL[v.pace]} · {CATEGORY_LABEL[v.category]} · {v.kind.toLowerCase()}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] text-ink-dim">
                {retention[v.id] ? formatMs(retention[v.id]) : '—'}
              </span>
              <button
                onClick={() => removeVideo(v.id)}
                className="shrink-0 text-ink-faint opacity-0 transition hover:text-rose-500 group-hover:opacity-100"
                title="Remover do sorteio"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
          {community.length === 0 && (
            <li className="py-3 text-center text-[11px] text-ink-faint">
              Nada da comunidade — o feed segue só com o catálogo do algoritmo.
            </li>
          )}
        </ul>
      </Section>

      {/* ---------------- histórico ---------------- */}
      <Section icon={<Clock size={13} />} title="Histórico de retenção">
        {history.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-ink-faint">
            Nenhuma sessão concluída ainda.
          </p>
        ) : (
          <ul className="space-y-1">
            {history.slice(0, 14).map((h, i) => (
              <li
                key={`${h.videoId}-${h.finishedAt}-${i}`}
                className="flex items-center gap-2 rounded sunken px-2 py-1.5"
              >
                {h.liked ? (
                  <Heart size={11} className="shrink-0 fill-rose-500 text-rose-500" />
                ) : (
                  <Zap size={11} className="shrink-0 text-ink-faint" />
                )}
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-dim">{h.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-amber-500">
                  {(h.peakDopamine * 100).toFixed(0)}%
                </span>
                <span className="shrink-0 font-mono text-[10px] text-accent">
                  {formatMs(h.retentionMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
