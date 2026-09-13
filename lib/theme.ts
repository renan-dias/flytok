'use client';

import { create } from 'zustand';

/**
 * Tema da interface.
 *
 * A classe `theme-light` vive no <html> e é aplicada por um script inline no
 * layout antes da primeira pintura — sem isso a página pisca escura antes de
 * hidratar. Este store apenas espelha esse estado para o React e para a cena 3D,
 * que precisa trocar blending e cores (soma aditiva some em fundo claro).
 */

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'flytok.theme';

function applyToDocument(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('theme-light', theme === 'light');
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  /** Lê o que o script inline já aplicou e sincroniza o store. */
  hydrate: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: 'dark',

  setTheme: (theme) => {
    applyToDocument(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* modo privativo: o tema simplesmente não persiste */
    }
    set({ theme });
  },

  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

  hydrate: () => {
    if (typeof document === 'undefined') return;
    const theme: Theme = document.documentElement.classList.contains('theme-light')
      ? 'light'
      : 'dark';
    set({ theme });
  },
}));

/** Script inline do <head>: aplica o tema salvo antes da primeira pintura. */
export const THEME_BOOTSTRAP_SCRIPT = `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='light')document.documentElement.classList.add('theme-light')}catch(e){}`;
