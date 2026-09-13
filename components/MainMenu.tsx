'use client';

import { useRef, useState } from 'react';
import {
  Bug,
  Download,
  FolderOpen,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Sun,
  X,
} from 'lucide-react';
import { useLabStore } from '@/store/useLabStore';
import { useTheme } from '@/lib/theme';

/**
 * MainMenu
 * --------
 * Tela de entrada e painel de controle da sessão: iniciar, pausar, retomar,
 * exportar o estado num arquivo e carregar um arquivo de volta.
 *
 * O save é um JSON legível contendo tudo que define aquela mosca — a tabela Q
 * que ela aprendeu, o que sente, a carteira, o que comprou, o perfil de gosto
 * do algoritmo e a fila do feed. Carregar um save devolve exatamente aquele
 * animal, com tudo o que ele já tinha descoberto.
 */

function MenuButton({
  icon,
  label,
  hint,
  onClick,
  variant = 'normal',
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  variant?: 'normal' | 'primary';
  disabled?: boolean;
}) {
  const base =
    'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40';
  const style =
    variant === 'primary'
      ? 'border-accent/50 bg-accent/15 text-accent hover:bg-accent/25'
      : 'border-lab-edge bg-lab-panel/80 text-ink hover:border-accent/50';

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${style}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{label}</span>
        {hint && <span className="block text-[10px] leading-snug text-ink-faint">{hint}</span>}
      </span>
    </button>
  );
}

export default function MainMenu() {
  const menuOpen = useLabStore((s) => s.menuOpen);
  const started = useLabStore((s) => s.started);
  const running = useLabStore((s) => s.running);
  const startNew = useLabStore((s) => s.startNew);
  const resume = useLabStore((s) => s.resume);
  const pause = useLabStore((s) => s.pause);
  const closeMenu = useLabStore((s) => s.closeMenu);
  const downloadSave = useLabStore((s) => s.downloadSave);
  const importSave = useLabStore((s) => s.importSave);
  const agentSnapshot = useLabStore((s) => s.agentSnapshot);
  const connectome = useLabStore((s) => s.connectome);

  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);

  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  if (!menuOpen) return null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Limpa o input para que escolher o mesmo arquivo de novo dispare o evento.
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const res = importSave(parsed);
      if (!res.ok) {
        setMessage({ text: res.error ?? 'Arquivo inválido.', bad: true });
        return;
      }
      setMessage({ text: `"${file.name}" carregado.`, bad: false });
    } catch (err) {
      setMessage({ text: `Não deu para ler o arquivo: ${(err as Error).message}`, bad: true });
    }
  }

  const discoveries = agentSnapshot?.discoveries.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-lab-void/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-lab-edge bg-lab-panel/95 p-6 shadow-2xl">
        {/* ---------------- cabeçalho ---------------- */}
        <div className="mb-5 flex items-start gap-3">
          <Bug size={26} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-[0.22em] text-ink">
              FLY<span className="text-accent">TOK</span>
            </h1>
            <p className="text-[11px] leading-snug text-ink-faint">
              Laboratório de design persuasivo sobre o conectoma real de Drosophila melanogaster
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              className="rounded-md border border-lab-edge p-1.5 text-ink-dim transition hover:border-accent/50 hover:text-accent"
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            {started && (
              <button
                onClick={closeMenu}
                title="Fechar o menu"
                className="rounded-md border border-lab-edge p-1.5 text-ink-dim transition hover:border-accent/50 hover:text-accent"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* ---------------- estado atual ---------------- */}
        {started && agentSnapshot && (
          <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-lab-edge sunken p-2.5 text-center">
            <div>
              <span className="block text-lg leading-none">{agentSnapshot.emotion.emoji}</span>
              <span className="mt-1 block text-[9px] uppercase tracking-[0.1em] text-ink-faint">
                {agentSnapshot.emotion.label}
              </span>
            </div>
            <div>
              <span className="block font-mono text-lg leading-none text-amber-500">
                {agentSnapshot.money}
              </span>
              <span className="mt-1 block text-[9px] uppercase tracking-[0.1em] text-ink-faint">
                moedas
              </span>
            </div>
            <div>
              <span className="block font-mono text-lg leading-none text-fuchsia-500">
                {discoveries}
              </span>
              <span className="mt-1 block text-[9px] uppercase tracking-[0.1em] text-ink-faint">
                descobertas
              </span>
            </div>
          </div>
        )}

        {/* ---------------- ações ---------------- */}
        <div className="space-y-2">
          {started ? (
            <>
              <MenuButton
                icon={running ? <Pause size={16} /> : <Play size={16} />}
                label={running ? 'Pausar simulação' : 'Retomar simulação'}
                hint={
                  running
                    ? 'Congela o mundo: necessidades, aprendizado e feed param onde estão.'
                    : 'Volta de onde parou, com tudo que ela já aprendeu.'
                }
                onClick={running ? pause : resume}
                variant="primary"
              />
              <MenuButton
                icon={<RotateCcw size={16} />}
                label="Nova simulação"
                hint="Zera o conectoma, a carteira e tudo que a mosca descobriu."
                onClick={() => {
                  setMessage(null);
                  startNew();
                }}
              />
            </>
          ) : (
            <MenuButton
              icon={<Play size={16} />}
              label="Iniciar simulação"
              hint="Uma mosca nova, sem nada aprendido, diante de um feed infinito."
              onClick={() => {
                setMessage(null);
                startNew();
              }}
              variant="primary"
            />
          )}

          <div className="!my-3 h-px bg-lab-edge" />

          <MenuButton
            icon={<Download size={16} />}
            label="Salvar dados em arquivo"
            hint="Exporta um .json com a tabela Q, as necessidades, a carteira e o feed."
            onClick={downloadSave}
            disabled={!started}
          />
          <MenuButton
            icon={<FolderOpen size={16} />}
            label="Carregar dados de arquivo"
            hint="Restaura uma mosca salva, com tudo que ela já tinha descoberto."
            onClick={() => fileRef.current?.click()}
          />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onFile}
            className="hidden"
          />
        </div>

        {message && (
          <p
            className={`mt-3 rounded-md px-3 py-2 text-[11px] leading-snug ${
              message.bad
                ? 'bg-rose-500/10 text-rose-500'
                : 'bg-emerald-500/10 text-emerald-600'
            }`}
          >
            {message.text}
          </p>
        )}

        {/* ---------------- rodapé ---------------- */}
        <p className="mt-5 text-[10px] leading-snug text-ink-faint">
          {connectome
            ? `${connectome.neuronCount.toLocaleString('pt-BR')} neurônios reais carregados · FlyWire FAFB v783 · CC-BY-4.0`
            : 'Carregando o conectoma do FlyWire…'}
        </p>
      </div>
    </div>
  );
}
