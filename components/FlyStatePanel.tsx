'use client';

import {
  Brain,
  Coins,
  Compass,
  Heart,
  Lightbulb,
  Moon,
  Package,
  ScrollText,
  ShoppingCart,
  Sun,
} from 'lucide-react';
import { useLabStore } from '@/store/useLabStore';
import { ACTION_LABEL, AGENT_ACTIONS, AgentAction } from '@/lib/FlyAgent';
import {
  CATEGORY_LABEL,
  Category,
  PACE_LABEL,
  Pace,
} from '@/lib/types';
import { ITEM_BY_ID, NEEDS, SHOP_ITEMS, clockOf, dayPhaseOf } from '@/lib/world';

/**
 * FlyStatePanel
 * -------------
 * Tudo que a mosca é por dentro: o que ela sente, do que precisa, quanto tem,
 * o que comprou, o que está a caminho e — o mais interessante — o que ela
 * aprendeu a achar que vale a pena.
 *
 * O bloco "o que a mosca acha que vale a pena" mostra a tabela Q crua. É ali
 * que dá para ver a descoberta acontecer: comentar começa em zero e sobe
 * sozinho, sem nenhuma recompensa direta por dinheiro em lugar nenhum do código.
 */

function Section({
  icon,
  title,
  right,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-lab-edge bg-lab-panel/80 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-accent">
        {icon}
        <span className="flex-1">{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

function Bar({
  label,
  value,
  color,
  display,
}: {
  label: React.ReactNode;
  value: number;
  color: string;
  display?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] text-ink-dim">{label}</span>
        <span className="shrink-0 font-mono text-[11px]" style={{ color }}>
          {display ?? `${pct.toFixed(0)}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full transition-[width] duration-150 ease-linear"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

const ACTION_COLOR: Record<AgentAction, string> = {
  FEED: '#22d3ee',
  COMMENT: '#f472b6',
  WORK: '#fbbf24',
  CONSUME: '#4ade80',
  BUY: '#a855f7',
};

const TONE_COLOR: Record<string, string> = {
  neutro: 'text-ink-dim',
  bom: 'text-emerald-500',
  dinheiro: 'text-amber-500',
  descoberta: 'text-fuchsia-500',
};

export default function FlyStatePanel() {
  const a = useLabStore((s) => s.agentSnapshot);
  const taste = useLabStore((s) => s.taste);
  const log = useLabStore((s) => s.log);

  if (!a) return null;

  const phase = dayPhaseOf(a.dayPhase);
  const isNight = a.daylight < 0.35;

  // Normaliza os valores da tabela Q para desenhar as barras comparativamente.
  const maxQ = Math.max(0.25, ...AGENT_ACTIONS.map((x) => Math.abs(a.meanActionValues[x])));

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* ---------------- emoção ---------------- */}
      <Section
        icon={<Heart size={13} />}
        title="Como a mosca está"
        right={
          <span className="flex items-center gap-1 text-[10px] normal-case tracking-normal text-ink-faint">
            {isNight ? <Moon size={11} /> : <Sun size={11} />}
            {clockOf(a.dayPhase)} · {phase}
          </span>
        }
      >
        <div className="flex items-center gap-3">
          <div className="text-4xl leading-none">{a.emotion.emoji}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold capitalize text-ink">{a.emotion.label}</p>
            <p className="truncate text-[11px] text-ink-faint">{a.activity}</p>
          </div>
        </div>
        <div className="mt-2.5 space-y-2">
          <Bar
            label="Valência (bem ↔ mal)"
            value={(a.emotion.valence + 1) / 2}
            color={a.emotion.valence >= 0 ? '#4ade80' : '#f2385a'}
            display={a.emotion.valence.toFixed(2)}
          />
          <Bar label="Excitação" value={a.emotion.arousal} color="#22d3ee" />
        </div>
      </Section>

      {/* ---------------- necessidades ---------------- */}
      <Section icon={<Compass size={13} />} title="Necessidades">
        <div className="space-y-2">
          {NEEDS.map((n) => {
            const v = a.needs[n.id];
            return (
              <Bar
                key={n.id}
                label={`${n.emoji} ${n.label}`}
                value={v}
                color={v > n.urgentAt ? '#f2385a' : v > 0.4 ? '#fbbf24' : '#4ade80'}
              />
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-ink-faint">
          Barra cheia = necessidade urgente. Aliviar uma necessidade é a única coisa que gera
          recompensa para a mosca.
        </p>
      </Section>

      {/* ---------------- carteira ---------------- */}
      <Section
        icon={<Coins size={13} />}
        title="Carteira"
        right={<span className="font-mono text-sm text-amber-500">{a.money}</span>}
      >
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded sunken px-2 py-1.5">
            <span className="block text-ink-faint">Ganho na vida</span>
            <span className="font-mono text-ink">{a.lifetimeEarned}</span>
          </div>
          <div className="rounded sunken px-2 py-1.5">
            <span className="block text-ink-faint">Comentários</span>
            <span className="font-mono text-ink">{a.actionCounts.COMMENT}</span>
          </div>
        </div>
        {a.comments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {a.comments.slice(0, 10).map((c, i) => (
              <span
                key={i}
                title={`${c.emotion} · ${c.earned > 0 ? `+${c.earned}` : 'sem retorno'}`}
                className={`rounded px-1.5 py-0.5 text-sm ${
                  c.earned > 0 ? 'bg-amber-500/15' : 'sunken'
                }`}
              >
                {c.emoji}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* ---------------- tabela Q ---------------- */}
      <Section icon={<Brain size={13} />} title="O que a mosca acha que vale a pena">
        <div className="space-y-2">
          {AGENT_ACTIONS.map((act) => (
            <Bar
              key={act}
              label={`${ACTION_LABEL[act]} · ${a.actionCounts[act]}×`}
              value={Math.max(0, a.meanActionValues[act]) / maxQ}
              color={ACTION_COLOR[act]}
              display={a.meanActionValues[act].toFixed(3)}
            />
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-ink-faint">
          Valor médio aprendido de cada ação, sobre os {a.visitedStates} de 72 estados já
          visitados. Ganhar dinheiro não gera recompensa nenhuma no código — se comentar subir, foi a
          mosca que descobriu sozinha que aquilo leva a poder comprar comida. Exploração agora:{' '}
          {(a.epsilon * 100).toFixed(0)}%.
        </p>
      </Section>

      {/* ---------------- descobertas ---------------- */}
      <Section icon={<Lightbulb size={13} />} title="Descobertas">
        {a.discoveries.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-ink-faint">
            Nada ainda. A mosca está tateando.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {a.discoveries.map((d) => (
              <li key={d.id} className="rounded border border-fuchsia-500/25 bg-fuchsia-500/10 px-2 py-1.5">
                <p className="text-[11px] font-semibold text-fuchsia-500">{d.label}</p>
                <p className="text-[10px] leading-snug text-ink-dim">{d.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ---------------- ambiente ---------------- */}
      <Section icon={<Package size={13} />} title="No ambiente">
        <ul className="space-y-1">
          {a.owned.length === 0 && (
            <li className="py-2 text-center text-[11px] text-ink-faint">Bancada vazia.</li>
          )}
          {a.owned.map((o) => {
            const spec = ITEM_BY_ID[o.id];
            if (!spec) return null;
            return (
              <li key={o.id} className="flex items-center gap-2 rounded sunken px-2 py-1.5">
                <span className="text-base">{spec.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{spec.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                  {Number.isFinite(o.usesLeft) ? `${o.usesLeft} usos` : '∞'}
                </span>
              </li>
            );
          })}
        </ul>
        {a.deliveries.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">A caminho</p>
            {a.deliveries.map((d, i) => {
              const spec = ITEM_BY_ID[d.itemId];
              const progress = 1 - d.etaSeconds / d.totalSeconds;
              return (
                <div key={`${d.itemId}-${i}`}>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-ink-dim">
                      {spec.emoji} {spec.label}
                    </span>
                    <span className="font-mono text-[10px] text-ink-faint">
                      {Math.ceil(d.etaSeconds)}s
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-150 ease-linear"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ---------------- loja ---------------- */}
      <Section icon={<ShoppingCart size={13} />} title="Loja">
        <ul className="space-y-1">
          {SHOP_ITEMS.map((item) => {
            const desire = a.desire[item.id] ?? 0;
            const affordable = a.money >= item.price;
            return (
              <li
                key={item.id}
                className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                  desire > 0.25 ? 'border border-amber-500/30 bg-amber-500/10' : 'sunken'
                }`}
              >
                <span className="text-base">{item.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-ink">{item.label}</span>
                  <span className="block truncate text-[10px] text-ink-faint">
                    {item.deliverySeconds}s de entrega
                    {desire > 0.05 && ` · desejo ${(desire * 100).toFixed(0)}%`}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-mono text-[11px] ${
                    affordable ? 'text-emerald-500' : 'text-ink-faint'
                  }`}
                >
                  {item.price}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[10px] leading-snug text-ink-faint">
          Destacados em âmbar: itens cujo desejo foi plantado por propaganda. O desejo não ensina
          nada à mosca — só torna a compra mais tentadora.
        </p>
      </Section>

      {/* ---------------- gostos ---------------- */}
      {taste && taste.samples > 0 && (
        <Section icon={<Compass size={13} />} title="Gostos aprendidos">
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint">Categoria</p>
          <ul className="space-y-1">
            {taste.category.map((c) => (
              <li key={c.key} className="flex items-center justify-between text-[11px]">
                <span className="text-ink-dim">{CATEGORY_LABEL[c.key as Category]}</span>
                <span
                  className={`font-mono ${c.score > 0 ? 'text-emerald-500' : 'text-ink-faint'}`}
                >
                  {c.score >= 0 ? '+' : ''}
                  {c.score.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mb-1.5 mt-2.5 text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Ritmo
          </p>
          <ul className="space-y-1">
            {taste.pace.map((c) => (
              <li key={c.key} className="flex items-center justify-between text-[11px]">
                <span className="text-ink-dim">{PACE_LABEL[c.key as Pace]}</span>
                <span
                  className={`font-mono ${c.score > 0 ? 'text-emerald-500' : 'text-ink-faint'}`}
                >
                  {c.score >= 0 ? '+' : ''}
                  {c.score.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-snug text-ink-faint">
            {taste.samples} sessões no cálculo. O algoritmo do feed usa exatamente esse ranking para
            escolher o próximo item.
          </p>
        </Section>
      )}

      {/* ---------------- diário ---------------- */}
      <Section icon={<ScrollText size={13} />} title="Diário">
        {log.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-ink-faint">Sem eventos ainda.</p>
        ) : (
          <ul className="space-y-1">
            {log.slice(0, 18).map((l) => (
              <li key={l.id} className="flex items-start gap-2 text-[11px]">
                <span className="shrink-0">{l.icon}</span>
                <span className={`min-w-0 flex-1 ${TONE_COLOR[l.tone] ?? 'text-ink-dim'}`}>
                  {l.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
