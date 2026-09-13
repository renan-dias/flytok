import type { Config } from 'tailwindcss';

/**
 * As cores da interface são variáveis CSS (ver app/globals.css), não valores
 * fixos: é isso que permite trocar entre o tema escuro e o claro sem duplicar
 * nenhuma classe nos componentes. As cores dos neurônios ficam de fora — elas
 * são o código semântico do experimento e não mudam com o tema.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lab: {
          void: 'rgb(var(--lab-void) / <alpha-value>)',
          panel: 'rgb(var(--lab-panel) / <alpha-value>)',
          edge: 'rgb(var(--lab-edge) / <alpha-value>)',
          sunken: 'rgb(var(--lab-sunken) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          dim: 'rgb(var(--ink-dim) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
        },
        neuro: {
          rest: '#1f47a8',
          visual: '#22d3ee',
          dopamine: '#c8f13a',
          aversion: '#f2385a',
          central: '#a855f7',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
