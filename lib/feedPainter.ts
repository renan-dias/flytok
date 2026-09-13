import { Category, Palette, VideoItem, VideoStimulus } from './types';

/**
 * Pintor 2D do feed.
 *
 * Dois canvases alimentam a tela do celular 3D:
 *   1. **conteúdo** — o frame do MP4 quando disponível, ou uma reconstrução
 *      procedural do clipe (usada para embeds, cujos pixels são inacessíveis
 *      por CORS);
 *   2. **overlay**  — a interface do app (ícones, legenda, barra de progresso)
 *      e as partículas de coração disparadas quando a mosca curte.
 *
 * Separar as camadas evita "sujar" (taint) o canvas de conteúdo com o vídeo
 * cross-origin e permite animar a UI em 60 FPS independentemente do vídeo.
 */

const PALETTE_RAMP: Record<Palette, [string, string, string]> = {
  WARM: ['#2b0d05', '#c2410c', '#fbbf24'],
  COLD: ['#04121f', '#0e7490', '#67e8f9'],
  NEON: ['#180322', '#d946ef', '#22d3ee'],
  MONOCHROME: ['#0a0a0a', '#4b4b4b', '#e5e5e5'],
};

// ---------------------------------------------------------------------------
// Camada de conteúdo
// ---------------------------------------------------------------------------

/** Desenha o frame do vídeo em modo "cover", preservando o aspecto 9:16. */
function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, w: number, h: number) {
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Motivo procedural específico de cada categoria de conteúdo. */
function paintMotif(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  category: Category,
  ramp: [string, string, string],
  t: number,
  pace: number
) {
  const [, mid, hi] = ramp;

  switch (category) {
    case 'FOOD_SUGAR': {
      // Gotas viscosas escorrendo — sinal de açúcar, o reforço primário.
      for (let i = 0; i < 7; i++) {
        const x = ((i + 0.5) / 7) * w;
        const drip = ((t * (30 + i * 9) + i * 140) % (h + 220)) - 110;
        const r = 26 + 14 * Math.sin(t * 1.4 + i);
        ctx.fillStyle = i % 2 === 0 ? mid : hi;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(x, drip, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - r * 0.35, drip - 150, r * 0.7, 150);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'SHARP_MOTION': {
      // Barras diagonais varrendo a tela em alta velocidade.
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(0.5 + 0.2 * Math.sin(t * 0.7));
      for (let i = 0; i < 14; i++) {
        const off = ((t * (260 + pace * 700) + i * 120) % (h * 2)) - h;
        ctx.fillStyle = i % 3 === 0 ? hi : mid;
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 6 + i);
        ctx.fillRect(-w, off, w * 2, 22);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      break;
    }
    case 'DANCE': {
      // Silhueta oscilando sobre halos concêntricos.
      const bob = Math.sin(t * 4.2) * 22;
      for (let i = 5; i > 0; i--) {
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = hi;
        ctx.beginPath();
        ctx.arc(w / 2, h * 0.55, i * 52 + Math.sin(t * 3 + i) * 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#05060a';
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.4 + bob, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(w / 2 - 34, h * 0.44 + bob, 68, 170);
      ctx.save();
      ctx.translate(w / 2, h * 0.5 + bob);
      ctx.rotate(Math.sin(t * 4.2) * 0.8);
      ctx.fillRect(-110, -12, 220, 24);
      ctx.restore();
      ctx.globalAlpha = 1;
      break;
    }
    case 'CHAOTIC_NOISE':
    default: {
      // Blocos aleatórios de alta frequência — sobrecarga sensorial.
      const blocks = 46;
      for (let i = 0; i < blocks; i++) {
        const seed = Math.sin(i * 12.9898 + Math.floor(t * 14) * 78.233) * 43758.5453;
        const rnd = seed - Math.floor(seed);
        const rnd2 = (Math.sin(i * 4.1 + Math.floor(t * 14)) + 1) / 2;
        ctx.fillStyle = rnd > 0.5 ? hi : mid;
        ctx.globalAlpha = 0.35 + 0.5 * rnd2;
        ctx.fillRect(rnd * w, rnd2 * h, 30 + rnd * 130, 14 + rnd2 * 70);
      }
      ctx.globalAlpha = 1;
      break;
    }
  }
}

/**
 * Pinta a camada de conteúdo. Se `videoEl` estiver decodificando quadros,
 * usa o vídeo real; caso contrário gera o clipe proceduralmente.
 */
export function paintContent(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  video: VideoItem | null,
  stim: VideoStimulus,
  t: number,
  media: HTMLVideoElement | HTMLImageElement | null,
  running: boolean
) {
  ctx.clearRect(0, 0, w, h);

  if (!video) {
    // Playlist vazia: tela morta com uma linha de status.
    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e3a5f';
    ctx.font = '600 26px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SEM SINAL', w / 2, h / 2);
    ctx.textAlign = 'left';
    return;
  }

  const ramp = PALETTE_RAMP[video.palette];

  // Dimensões naturais da mídia, seja ela <video> ou <img>.
  const isVideo = media instanceof HTMLVideoElement;
  const mw = media ? (isVideo ? media.videoWidth : media.naturalWidth) : 0;
  const mh = media ? (isVideo ? media.videoHeight : media.naturalHeight) : 0;
  const ready = media ? (isVideo ? media.readyState >= 2 : media.complete) : false;
  const usableMedia = Boolean(media && ready && mw > 0 && !media.dataset.flytokBlocked);

  if (usableMedia && media) {
    try {
      drawCover(ctx, media, mw, mh, w, h);
    } catch {
      // Canvas contaminado por mídia cross-origin: marca e cai para o procedural.
      media.dataset.flytokBlocked = '1';
    }
  }

  if (!usableMedia || media?.dataset.flytokBlocked) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, ramp[0]);
    g.addColorStop(1, '#04060b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    paintMotif(ctx, w, h, video.category, ramp, t, stim.pace);
  }

  // ---- camada de anúncio ----
  if (video.isAd) {
    // Gradiente inferior para o texto ter contraste sobre qualquer foto.
    const g2 = ctx.createLinearGradient(0, h * 0.45, 0, h);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, h * 0.45, w, h * 0.55);

    // Pulsação de borda: o anúncio pisca para roubar a atenção.
    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    ctx.strokeStyle = `rgba(255,214,10,${0.45 + 0.45 * pulse})`;
    ctx.lineWidth = 7;
    ctx.strokeRect(3.5, 3.5, w - 7, h - 7);
  }

  // Flash de corte: bate na retina na frequência declarada de edição.
  if (running) {
    const cutHz = 0.4 + stim.pace * 3.2;
    const phase = (t * cutHz) % 1;
    if (phase < 0.08) {
      ctx.fillStyle = `rgba(255,255,255,${(0.08 - phase) * 3.2 * stim.pace})`;
      ctx.fillRect(0, 0, w, h);
    }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '600 22px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSADO', w / 2, h / 2);
    ctx.textAlign = 'left';
  }

  // Vinheta para o clipe encaixar melhor no vidro do celular.
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Camada de overlay (UI + partículas)
// ---------------------------------------------------------------------------

interface Heart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  hue: number;
}

export interface OverlayState {
  hearts: Heart[];
  lastLikeSeen: number;
}

export function createOverlayState(): OverlayState {
  return { hearts: [], lastLikeSeen: -1 };
}

/** Quebra `text` em linhas que cabem em `maxWidth`. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(' ');
  let line = '';
  let cursor = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursor);
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.bezierCurveTo(-14, -5, -8, -18, 0, -9);
  ctx.bezierCurveTo(8, -18, 14, -5, 0, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * Pinta a UI do app e avança as partículas de coração.
 * `likeCount` é monotônico: cada incremento gera uma nova explosão.
 */
export function paintOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: OverlayState,
  opts: {
    video: VideoItem | null;
    likeCount: number;
    likePulse: number;
    scrollPulse: number;
    attention: number;
    dopamine: number;
    dt: number;
    t: number;
    /** Segundos restantes do anúncio; 0 quando não é anúncio. */
    adRemaining: number;
    /** A mosca está olhando para a tela? */
    watching: boolean;
    /** Último emoji comentado, e o pulso que o faz subir na tela. */
    commentEmoji: string;
    commentPulse: number;
  }
) {
  ctx.clearRect(0, 0, w, h);
  const {
    video,
    likeCount,
    likePulse,
    scrollPulse,
    attention,
    dopamine,
    dt,
    t,
    adRemaining,
    watching,
    commentEmoji,
    commentPulse,
  } = opts;

  // -- spawn de corações ----------------------------------------------------
  if (likeCount !== state.lastLikeSeen) {
    state.lastLikeSeen = likeCount;
    if (likeCount > 0) {
      for (let i = 0; i < 26; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
        const sp = 90 + Math.random() * 210;
        state.hearts.push({
          x: w * 0.78 + (Math.random() - 0.5) * 30,
          y: h * 0.62,
          vx: Math.cos(ang) * sp * 0.55,
          vy: Math.sin(ang) * sp,
          life: 1,
          size: 18 + Math.random() * 26,
          hue: 335 + Math.random() * 30,
        });
      }
    }
  }

  // -- integração das partículas -------------------------------------------
  for (let i = state.hearts.length - 1; i >= 0; i--) {
    const p = state.hearts[i];
    p.life -= dt * 0.75;
    if (p.life <= 0) {
      state.hearts.splice(i, 1);
      continue;
    }
    p.vy += 120 * dt; // gravidade leve, para os corações caírem de volta
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    drawHeart(ctx, p.x, p.y, p.size * (0.6 + 0.4 * p.life), `hsl(${p.hue} 90% 62%)`, Math.min(1, p.life * 1.4));
  }

  if (!video) return;

  // -- anúncio: selo, chamada, contagem e crédito da foto -------------------
  if (video.isAd) {
    const total = video.adDurationSeconds ?? 5;

    // Selo "patrocinado".
    ctx.fillStyle = 'rgba(255,214,10,0.92)';
    ctx.fillRect(20, 22, 132, 30);
    ctx.fillStyle = '#191400';
    ctx.font = '800 15px ui-monospace, monospace';
    ctx.fillText('PATROCINADO', 28, 43);

    // Contagem regressiva — anúncios de 1, 3, 5 ou 10 s.
    const label = `${Math.ceil(adRemaining)}s`;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.arc(w - 44, 38, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(w - 44, 38, 22, -Math.PI / 2, -Math.PI / 2 + (adRemaining / total) * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 15px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, w - 44, 44);
    ctx.textAlign = 'left';

    // Chamada publicitária e botão de compra.
    ctx.fillStyle = '#fff';
    ctx.font = '800 27px ui-monospace, monospace';
    ctx.fillText(video.title, 24, h - 150);
    ctx.font = '400 18px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    wrapText(ctx, video.adCopy ?? '', 24, h - 122, w - 48, 23);

    ctx.fillStyle = '#ffd60a';
    ctx.fillRect(24, h - 74, w - 48, 40);
    ctx.fillStyle = '#191400';
    ctx.font = '800 17px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('COMPRAR AGORA', w / 2, h - 48);
    ctx.textAlign = 'left';

    // Crédito da foto — exigido pelas licenças CC.
    if (video.photoCredit) {
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = '400 10px ui-monospace, monospace';
      ctx.fillText(video.photoCredit.slice(0, 62), 24, h - 14);
    }
    return;
  }

  // -- a mosca saiu da tela -------------------------------------------------
  if (!watching) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(190,215,255,0.85)';
    ctx.font = '600 19px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('a mosca está ocupada', w / 2, h / 2 - 8);
    ctx.font = '400 14px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(190,215,255,0.55)';
    ctx.fillText('o feed continua rodando', w / 2, h / 2 + 16);
    ctx.textAlign = 'left';
  }

  // -- emoji do comentário subindo pela tela --------------------------------
  if (commentPulse > 0.02) {
    const p = 1 - commentPulse;
    ctx.globalAlpha = Math.min(1, commentPulse * 1.6);
    ctx.font = '600 54px system-ui, "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(commentEmoji, w * 0.3, h * 0.72 - p * 170);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // -- coluna direita de ações ---------------------------------------------
  const cx = w * 0.86;
  const heartY = h * 0.62;
  const beat = 1 + likePulse * 0.6;
  drawHeart(ctx, cx, heartY, 44 * beat, likePulse > 0.05 ? '#ff2d55' : 'rgba(255,255,255,0.9)', 1);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 18px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(likeCount), cx, heartY + 40);

  // Ícones de comentário e compartilhar (estilizados).
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.roundRect?.(cx - 20, heartY + 62, 40, 34, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 18, heartY + 140);
  ctx.lineTo(cx + 18, heartY + 124);
  ctx.lineTo(cx - 18, heartY + 108);
  ctx.closePath();
  ctx.stroke();
  ctx.textAlign = 'left';

  // -- legenda --------------------------------------------------------------
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '700 22px ui-monospace, monospace';
  ctx.fillText('@drosophila.lab', 26, h - 116);
  ctx.font = '400 19px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  const caption = video.title.length > 30 ? `${video.title.slice(0, 29)}…` : video.title;
  ctx.fillText(caption, 26, h - 86);
  ctx.fillStyle = 'rgba(125,211,252,0.9)';
  ctx.font = '500 17px ui-monospace, monospace';
  ctx.fillText(`#${video.category.toLowerCase()} #${video.pace.toLowerCase()}`, 26, h - 58);

  // -- barras de estado do animal ------------------------------------------
  const barW = w - 52;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(26, h - 36, barW, 5);
  ctx.fillStyle = '#c8f13a';
  ctx.fillRect(26, h - 36, barW * Math.min(1, dopamine), 5);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(26, h - 24, barW, 5);
  ctx.fillStyle = '#22d3ee';
  ctx.fillRect(26, h - 24, barW * Math.min(1, attention), 5);

  // -- indicador de swipe ---------------------------------------------------
  if (scrollPulse > 0.02) {
    const a = scrollPulse;
    ctx.globalAlpha = a * 0.9;
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 5;
    const y = h * 0.5 + (1 - a) * 90;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 34, y + 30);
    ctx.lineTo(w / 2, y - 16);
    ctx.lineTo(w / 2 + 34, y + 30);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Scanline sutil: reforça a leitura de "tela" em vez de textura chapada.
  ctx.fillStyle = 'rgba(120,180,255,0.045)';
  for (let y = (t * 40) % 6; y < h; y += 6) ctx.fillRect(0, y, w, 1);
}
