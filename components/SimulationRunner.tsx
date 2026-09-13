'use client';

import { useEffect } from 'react';
import { useLabStore } from '@/store/useLabStore';

/**
 * SimulationRunner
 * ----------------
 * Relógio da simulação. Monta uma única vez e dispara `tick(100)` a cada 100 ms,
 * exatamente como especificado no modelo. Não renderiza nada.
 *
 * O intervalo usa o tempo real decorrido (não 100 ms fixos) para que a
 * simulação não desacelere quando a aba é suspensa pelo navegador.
 */
export default function SimulationRunner() {
  useEffect(() => {
    // Handle de depuração no console do navegador, só em desenvolvimento:
    //   __flytok.getState().exportSave()
    if (process.env.NODE_ENV === 'development') {
      (window as unknown as Record<string, unknown>).__flytok = useLabStore;
    }

    // A primeira fila do feed é gerada aqui, e não no módulo do store: ela usa
    // números aleatórios e precisa existir só no cliente.
    useLabStore.getState().bootstrap();
    useLabStore.getState().loadConfig();

    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      // Limita o passo a 250 ms: voltar de uma aba em segundo plano não deve
      // provocar um salto gigante na integração.
      const dt = Math.min(250, now - last);
      last = now;
      useLabStore.getState().tick(dt);
    }, 100);

    return () => window.clearInterval(id);
  }, []);

  return null;
}
