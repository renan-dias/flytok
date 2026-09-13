'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Brain, Bug, Github, Info, Menu, Moon, Sun } from 'lucide-react';
import FeedPanel from '@/components/FeedPanel';
import FlyStatePanel from '@/components/FlyStatePanel';
import MainMenu from '@/components/MainMenu';
import NeuroControls from '@/components/NeuroControls';
import SimulationRunner from '@/components/SimulationRunner';
import { useLabStore } from '@/store/useLabStore';
import { useTheme } from '@/lib/theme';

/**
 * Página única do laboratório. A cena 3D é carregada só no cliente: o WebGL
 * precisa de `window`, e mantê-la fora do SSR evita o flash de hidratação.
 */
const FlyScene = dynamic(() => import('@/components/FlyScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="pulse-dot mx-auto mb-3 h-2.5 w-2.5 rounded-full bg-accent" />
        <p className="text-[11px] uppercase tracking-[0.25em] text-ink-faint">
          Montando a bancada…
        </p>
      </div>
    </div>
  ),
});

/** Alterna entre o laboratório escuro e o modo claro. */
function ThemeToggle() {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const hydrate = useTheme((s) => s.hydrate);

  // O script inline do layout já aplicou a classe; aqui só espelhamos no store.
  useEffect(() => hydrate(), [hydrate]);

  const dark = theme === 'dark';
  return (
    <button
      onClick={toggle}
      title={dark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
      aria-label={dark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
      className="flex items-center gap-1.5 rounded-md border border-lab-edge px-2 py-1 text-ink-dim transition hover:border-accent/50 hover:text-accent"
    >
      {dark ? <Sun size={12} /> : <Moon size={12} />}
      <span className="hidden text-[10px] uppercase tracking-[0.16em] md:inline">
        {dark ? 'claro' : 'escuro'}
      </span>
    </button>
  );
}

/**
 * Painel direito em abas: são duas leituras diferentes do mesmo animal — o que
 * ela sente e quer, e como o circuito está reagindo. Juntas não cabem na tela.
 */
function RightPanel() {
  const [tab, setTab] = useState<'mosca' | 'cerebro'>('mosca');
  const emotion = useLabStore((s) => s.agentSnapshot?.emotion.emoji ?? '🙂');

  const tabCls = (active: boolean) =>
    `flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-[11px] uppercase tracking-[0.14em] transition ${
      active
        ? 'border-accent text-accent'
        : 'border-transparent text-ink-faint hover:text-ink-dim'
    }`;

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 flex border-b border-lab-edge bg-lab-panel/95 backdrop-blur">
        <button onClick={() => setTab('mosca')} className={tabCls(tab === 'mosca')}>
          <span className="text-sm leading-none">{emotion}</span> Mosca
        </button>
        <button onClick={() => setTab('cerebro')} className={tabCls(tab === 'cerebro')}>
          <Brain size={12} /> Cérebro
        </button>
      </div>
      {tab === 'mosca' ? <FlyStatePanel /> : <NeuroControls />}
    </div>
  );
}

/** Reabre o menu principal (e pausa, para o mundo não correr sem ninguém olhando). */
function MenuButton() {
  const openMenu = useLabStore((s) => s.openMenu);
  return (
    <button
      onClick={openMenu}
      title="Menu principal"
      aria-label="Abrir o menu principal"
      className="flex items-center gap-1.5 rounded-md border border-lab-edge px-2 py-1 text-ink-dim transition hover:border-accent/50 hover:text-accent"
    >
      <Menu size={12} />
      <span className="hidden text-[10px] uppercase tracking-[0.16em] md:inline">menu</span>
    </button>
  );
}

function StatusPill() {
  const running = useLabStore((s) => s.running);
  const snapshot = useLabStore((s) => s.snapshot);
  const agentMoney = useLabStore((s) => s.agentSnapshot?.money ?? 0);
  return (
    <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.16em]">
      <span className="flex items-center gap-1.5 text-ink-dim">
        <span
          className={`h-1.5 w-1.5 rounded-full ${running ? 'bg-emerald-400 pulse-dot' : 'bg-ink-faint'}`}
        />
        {running ? 'exposição ativa' : 'em espera'}
      </span>
      <span className="hidden text-ink-faint sm:inline">
        dopamina{' '}
        <span className="font-mono text-neuro-dopamine">
          {((snapshot?.dopamine ?? 0) * 100).toFixed(0)}%
        </span>
      </span>
      <span className="hidden text-ink-faint sm:inline">
        atenção{' '}
        <span className="font-mono text-accent">
          {((snapshot?.attention ?? 0) * 100).toFixed(0)}%
        </span>
      </span>
      <span className="hidden text-ink-faint lg:inline">
        moedas <span className="font-mono text-amber-500">{agentMoney}</span>
      </span>
    </div>
  );
}

/** Rodapé: cita a fonte real dos dados e o que está carregado de fato. */
function Footer() {
  const meta = useLabStore((s) => s.connectome);
  const error = useLabStore((s) => s.connectomeError);

  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-lab-edge bg-lab-panel/70 px-4 py-1.5 text-[10px] text-ink-faint backdrop-blur">
      <span className="flex min-w-0 items-center gap-1.5">
        <Info size={11} className="shrink-0" />
        <span className="truncate">
          Conectoma real: FlyWire FAFB v783 (Schlegel et al. 2024, Nature) · CC-BY-4.0. A dinâmica
          neural é um modelo didático de taxa média, não uma simulação da fiação.
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <Github size={11} />
        {error ? (
          <span className="text-rose-400">conectoma não carregou</span>
        ) : meta ? (
          <>
            {meta.neuronCount.toLocaleString('pt-BR')} neurônios reais · 4 populações · 10 Hz
          </>
        ) : (
          <>carregando conectoma…</>
        )}
      </span>
    </footer>
  );
}

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      {/* Relógio da simulação (10 Hz) — headless. */}
      <SimulationRunner />

      {/* Menu principal: sobrepõe tudo enquanto estiver aberto. */}
      <MainMenu />

      {/* ---------------- cabeçalho ---------------- */}
      <header className="flex shrink-0 items-center justify-between border-b border-lab-edge bg-lab-panel/70 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <Bug size={18} className="text-accent" />
          <div>
            <h1 className="text-sm font-bold tracking-[0.22em] text-ink">
              FLY<span className="text-accent">TOK</span>
            </h1>
            <p className="hidden text-[10px] text-ink-faint sm:block">
              Laboratório de design persuasivo · conectoma de Drosophila melanogaster
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill />
          <ThemeToggle />
          <MenuButton />
        </div>
      </header>

      {/* ---------------- três painéis ---------------- */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="h-[46vh] w-full shrink-0 overflow-y-auto border-b border-lab-edge bg-lab-void/70 lg:h-auto lg:w-[320px] lg:border-b-0 lg:border-r xl:w-[352px]">
          <FeedPanel />
        </aside>

        <section className="relative h-[58vh] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
          {/* inset-0 dá ao Canvas um retângulo já resolvido para medir. */}
          <div className="absolute inset-0">
            <FlyScene />
          </div>
          {/* Rótulo do holograma — em DOM, para não depender de fonte remota
              dentro da cena WebGL. */}
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-accent/30 sunken px-3 py-1 backdrop-blur">
            <span className="text-[10px] uppercase tracking-[0.22em] text-accent">
              conectoma · flywire-like
            </span>
          </div>

          {/* Legenda do código de cores dos neurônios. */}
          <div className="pointer-events-none absolute bottom-3 left-3 space-y-1 rounded-lg border border-lab-edge/70 sunken px-3 py-2 backdrop-blur">
            <p className="mb-1 text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              código de cores
            </p>
            {[
              ['#12306e', 'resto do cérebro'],
              ['#1f47a8', 'repouso'],
              ['#22d3ee', 'processamento visual'],
              ['#c8f13a', 'dopamina / recompensa'],
              ['#f2385a', 'aversão / tédio'],
              ['#a855f7', 'decisão motora'],
            ].map(([color, label]) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: color, boxShadow: `0 0 7px ${color}` }}
                />
                <span className="text-[10px] text-ink-dim">{label}</span>
              </div>
            ))}
          </div>
          <p className="pointer-events-none absolute bottom-3 right-3 text-[10px] text-ink-faint">
            arraste para orbitar · scroll para zoom
          </p>
        </section>

        <aside className="h-[52vh] w-full shrink-0 overflow-y-auto border-t border-lab-edge bg-lab-void/70 lg:h-auto lg:w-[324px] lg:border-l lg:border-t-0 xl:w-[356px]">
          <RightPanel />
        </aside>
      </div>

      {/* ---------------- rodapé ---------------- */}
      <Footer />
    </main>
  );
}
