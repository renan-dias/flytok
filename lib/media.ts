import { MediaKind } from './types';

/**
 * Normaliza a URL colada pelo usuário.
 *
 * · Arquivos de vídeo diretos (.mp4/.webm/.ogv) viram textura real no celular 3D.
 * · Shorts / TikTok / YouTube viram um <iframe> no painel esquerdo; a tela 3D
 *   exibe uma reconstrução procedural, já que embeds de terceiros são
 *   sandboxed e seus pixels não podem ser lidos por CORS.
 */
export function parseMediaUrl(raw: string): { kind: MediaKind; embedUrl?: string; ok: boolean } {
  const url = raw.trim();
  if (!url) return { kind: 'EMBED', ok: false };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'EMBED', ok: false };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { kind: 'EMBED', ok: false };
  }

  if (/\.(mp4|webm|ogv|ogg|mov)(\?.*)?$/i.test(parsed.pathname)) {
    return { kind: 'MP4', ok: true };
  }

  const host = parsed.hostname.replace(/^www\./, '');

  // YouTube: watch?v=, youtu.be/ID, /shorts/ID
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    let id = '';
    if (host === 'youtu.be') id = parsed.pathname.slice(1);
    else if (parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.split('/')[2] ?? '';
    else if (parsed.pathname.startsWith('/embed/')) id = parsed.pathname.split('/')[2] ?? '';
    else id = parsed.searchParams.get('v') ?? '';
    if (id) {
      return {
        kind: 'EMBED',
        // autoplay só é permitido pelo navegador quando o vídeo entra mudo.
        embedUrl: `https://www.youtube.com/embed/${id}?rel=0&playsinline=1&autoplay=1&mute=1&loop=1&playlist=${id}`,
        ok: true,
      };
    }
  }

  // TikTok: /@user/video/ID
  if (host.endsWith('tiktok.com')) {
    const m = parsed.pathname.match(/\/video\/(\d+)/);
    if (m) return { kind: 'EMBED', embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}`, ok: true };
  }

  // Instagram Reels / posts
  if (host.endsWith('instagram.com')) {
    const m = parsed.pathname.match(/\/(reel|reels|p)\/([\w-]+)/);
    if (m) return { kind: 'EMBED', embedUrl: `https://www.instagram.com/p/${m[2]}/embed`, ok: true };
  }

  // Qualquer outra URL: tenta embed direto.
  return { kind: 'EMBED', embedUrl: url, ok: true };
}

/**
 * URL same-origin para um arquivo de mídia remoto (vídeo ou imagem).
 *
 * O canvas WebGL recusa quadros de mídia cross-origin sem cabeçalhos CORS —
 * o arquivo carregaria, mas não poderia ser desenhado na tela do celular 3D.
 * Passando pelo proxy do próprio app, vira uma textura legítima.
 */
export function proxiedMediaUrl(url: string): string {
  return `/api/media?url=${encodeURIComponent(url)}`;
}

/** Formata milissegundos como 12.4s / 1m 05s. */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`;
}
