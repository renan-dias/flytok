import type { Metadata, Viewport } from 'next';
import { THEME_BOOTSTRAP_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'FlyTok · Laboratório de Design Persuasivo',
  description:
    'Conectoma real de Drosophila melanogaster (FlyWire FAFB v783) exposto a um feed de vídeo curto. Ajuste os pesos sinápticos e observe dopamina, tédio e retenção em tempo real.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#04060b' },
    { media: '(prefers-color-scheme: light)', color: '#ecf1f7' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Aplica o tema salvo antes da primeira pintura, evitando o flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
