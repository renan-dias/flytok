'use client';

import { useEffect } from 'react';
import { Activity, Brain, Gauge, RotateCcw, Save, Sparkles } from 'lucide-react';
import { useLabStore } from '@/store/useLabStore';
import { CATEGORY_LABEL, Category, ClusterId } from '@/lib/types';
import { CLUSTER_COLOR } from './BrainPointCloud';

/**
 * NeuroControls (painel direito)
 * ------------------------------
 * Leitura em tempo real do estado interno + editor de pesos sinápticos.
 * Re-renderiza a 10 Hz junto com o snapshot — custo irrelevante, já que a cena
 * 3D lê o canal `live` e não depende deste componente.
 */

const CLUSTER_LABEL: Record<ClusterId, string> = {
  visualLobula: 'Lobula (visual)',
  pamDopamine: 'PAM (dopamina)',
  ppl1Aversion: 'PPL1 (aversão)',
  centralComplex: 'Complexo central',
};

function Meter({
  label,
  value,
  color,
  suffix,
  display,
}: {
  label: string;
  value: number; // 0..1
  color: string;
  suffix?: string;
  display?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] text-ink-dim">{label}</span>
        <span className="font-mono text-[11px]" style={{ color }}>
          {display ?? `${pct.toFixed(0)}${suffix ?? '%'}`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 10px ${color}66` }}
        />
      </div>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-ink-dim">{label}</span>
        <span className="font-mono text-[11px] text-accent">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <p className="mb-1.5 text-[10px] leading-snug text-ink-faint">{hint}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-ink/15 accent-accent"
      />
    </div>
  );
}

export default function NeuroControls() {
  const snapshot = useLabStore((s) => s.snapshot);
  const connectome = useLabStore((s) => s.connectome);
  const params = useLabStore((s) => s.params);
  const setParam = useLabStore((s) => s.setParam);
  const resetAll = useLabStore((s) => s.resetAll);
  const saveConfig = useLabStore((s) => s.saveConfig);
  const toast = useLabStore((s) => s.toast);
  const clearToast = useLabStore((s) => s.clearToast);

  // O toast some sozinho depois de 3 s.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(clearToast, 3000);
    return () => window.clearTimeout(id);
  }, [toast, clearToast]);

  const action = snapshot?.action ?? 'WATCH';
  const actionStyle =
    action === 'LIKE'
      ? 'border-rose-500/50 bg-rose-500/15 text-rose-300'
      : action === 'SCROLL_NEXT'
        ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
        : 'border-accent/40 bg-accent/10 text-accent';
  const actionLabel =
    action === 'LIKE' ? 'CURTINDO' : action === 'SCROLL_NEXT' ? 'ROLANDO O FEED' : 'ASSISTINDO';

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* ---------------- estado motor ---------------- */}
      <div className={`rounded-lg border px-3 py-2 text-center text-[11px] font-bold tracking-[0.2em] ${actionStyle}`}>
        {actionLabel}
      </div>

      {/* ---------------- métricas ---------------- */}
      <section className="space-y-2.5 rounded-lg border border-lab-edge bg-lab-panel/80 p-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-accent">
          <Activity size={13} /> Métricas em tempo real
        </div>
        <Meter label="Nível de dopamina (PAM)" value={snapshot?.dopamine ?? 0} color={CLUSTER_COLOR.pamDopamine} />
        <Meter label="Tédio / aversão (PPL1)" value={snapshot?.aversion ?? 0} color={CLUSTER_COLOR.ppl1Aversion} />
        <Meter
          label="Disparo dos neurônios visuais"
          value={(snapshot?.visualFiringRate ?? 0) / 180}
          color={CLUSTER_COLOR.visualLobula}
          display={`${(snapshot?.visualFiringRate ?? 0).toFixed(0)} Hz`}
        />
        <Meter label="Atenção" value={snapshot?.attention ?? 0} color="#7dd3fc" />
        <Meter label="Novidade do estímulo" value={snapshot?.novelty ?? 0} color="#a855f7" />
      </section>

      {/* ---------------- clusters ---------------- */}
      <section className="space-y-2 rounded-lg border border-lab-edge bg-lab-panel/80 p-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-accent">
          <Brain size={13} /> Ativação por população
        </div>
        {(Object.keys(CLUSTER_LABEL) as ClusterId[]).map((id) => (
          <Meter
            key={id}
            label={
              connectome
                ? `${CLUSTER_LABEL[id]} · ${connectome.counts[id]?.toLocaleString('pt-BR') ?? '?'} neurônios`
                : CLUSTER_LABEL[id]
            }
            value={snapshot?.clusters[id] ?? 0}
            color={CLUSTER_COLOR[id]}
          />
        ))}
        {connectome && (
          <p className="pt-1 text-[10px] leading-snug text-ink-faint">
            Contagens reais do FlyWire FAFB v783. Outros{' '}
            {connectome.counts.other?.toLocaleString('pt-BR')} neurônios do volume são desenhados
            como tecido de fundo e não participam do modelo.
          </p>
        )}
      </section>

      {/* ---------------- editor do cérebro ---------------- */}
      <section className="space-y-3.5 rounded-lg border border-lab-edge bg-lab-panel/80 p-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-accent">
          <Gauge size={13} /> Editor do cérebro · neuroplasticidade
        </div>

        <Slider
          label="Sensibilidade a dopamina / vício"
          hint="Ganho do cluster PAM: quanto maior, mais fácil a mosca curte e mais tempo fica presa."
          value={params.dopamineSensitivity}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) => setParam('dopamineSensitivity', v)}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <Slider
          label="Limiar de tédio"
          hint="Saliência visual mínima aceitável. Valores altos = descarta vídeos lentos rapidamente."
          value={params.boredomThreshold}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(v) => setParam('boredomThreshold', v)}
        />
        <Slider
          label="Afinidade com estímulo visual"
          hint="Ganho da lobula: resposta a cortes rápidos, brilho e movimento."
          value={params.visualAffinity}
          min={0}
          max={2}
          step={0.01}
          onChange={(v) => setParam('visualAffinity', v)}
          format={(v) => `${v.toFixed(2)}×`}
        />
        <Slider
          label="Limiar de like"
          hint="Ativação de PAM necessária para a pata tocar a tela."
          value={params.likeThreshold}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(v) => setParam('likeThreshold', v)}
        />
        <Slider
          label="Limiar de scroll"
          hint="Ativação de PPL1 necessária para descartar o clipe."
          value={params.scrollThreshold}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(v) => setParam('scrollThreshold', v)}
        />

        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-lab-edge sunken p-2.5">
          <input
            type="checkbox"
            checked={params.hebbian}
            onChange={(e) => setParam('hebbian', e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-accent"
          />
          <span>
            <span className="block text-[11px] font-medium text-ink">
              Modo aprendizado hebbiano
            </span>
            <span className="block text-[10px] leading-snug text-ink-faint">
              Conexões lobula→PAM coativas são reforçadas conforme o tempo assistido.
            </span>
          </span>
        </label>

        <div className="flex gap-2 pt-0.5">
          <button
            onClick={resetAll}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 py-2 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-500/20"
          >
            <RotateCcw size={13} /> Resetar tudo
          </button>
          <button
            onClick={saveConfig}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 py-2 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
          >
            <Save size={13} /> Salvar config.
          </button>
        </div>
        {toast && <p className="text-center text-[10px] text-emerald-300">{toast}</p>}
      </section>

      {/* ---------------- pesos aprendidos ---------------- */}
      <section className="space-y-2 rounded-lg border border-lab-edge bg-lab-panel/80 p-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-accent">
          <Sparkles size={13} /> Pesos aprendidos por categoria
        </div>
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => {
          const w = snapshot?.plasticity[c] ?? 1;
          // Faixa plástica do modelo: 0.35 a 2.5.
          const norm = (w - 0.35) / (2.5 - 0.35);
          return (
            <Meter
              key={c}
              label={CATEGORY_LABEL[c]}
              value={norm}
              color={w > 1.05 ? '#c8f13a' : w < 0.95 ? '#f2385a' : '#64748b'}
              display={`${w.toFixed(2)}×`}
            />
          );
        })}
        <p className="pt-1 text-[10px] leading-snug text-ink-faint">
          Acima de 1.00× a mosca desenvolveu preferência por aquela categoria; abaixo, desenvolveu
          fadiga.
        </p>
      </section>
    </div>
  );
}
