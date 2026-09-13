'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { live } from '@/lib/live';
import { createOverlayState, paintContent, paintOverlay } from '@/lib/feedPainter';
import { proxiedMediaUrl } from '@/lib/media';
import { VideoItem } from '@/lib/types';

/**
 * PhoneFeed
 * ---------
 * Smartphone vertical (9:16) em suporte de bancada, posicionado de frente para
 * a mosca. A tela é composta por duas texturas de canvas empilhadas:
 *
 *   · conteúdo — frame do MP4 (quando o servidor permite CORS) ou reconstrução
 *     procedural do clipe;
 *   · overlay  — a UI do app e as partículas de coração do like.
 *
 * Tudo é pintado dentro de `useFrame`, lendo o canal `live`; o componente nunca
 * re-renderiza por causa da simulação.
 */

/** Resolução das texturas de tela — 9:16, suficiente para leitura em close. */
const TEX_W = 396;
const TEX_H = 704;

/** Dimensões físicas do aparelho, em unidades de cena. */
const PHONE_W = 0.62;
const PHONE_H = 1.102;
const SCREEN_W = PHONE_W - 0.045;
const SCREEN_H = PHONE_H - 0.06;

/**
 * Fator que leva os pixels do iframe às unidades de cena. `<Html transform>` da
 * drei desenha o DOM numa escala de 1 px = 0,01 unidade, então dividimos a
 * largura da tela pela largura em pixels e compensamos essa constante.
 */
const EMBED_SCALE = (SCREEN_W / TEX_W) * 100;

function makeCanvasTexture(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { canvas, ctx, texture };
}

interface Props {
  video: VideoItem | null;
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export default function PhoneFeed({ video, position = [0, 0, 0], rotation = [0, 0, 0] }: Props) {
  const content = useMemo(() => makeCanvasTexture(TEX_W, TEX_H), []);
  const overlay = useMemo(() => makeCanvasTexture(TEX_W, TEX_H), []);
  const overlayState = useRef(createOverlayState());
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const imageElRef = useRef<HTMLImageElement | null>(null);
  const screenLight = useRef<THREE.PointLight>(null);
  const clock = useRef(0);

  // Libera as texturas ao desmontar.
  useEffect(() => {
    const c = content.texture;
    const o = overlay.texture;
    return () => {
      c.dispose();
      o.dispose();
    };
  }, [content.texture, overlay.texture]);

  // Elemento <video> oculto para os clipes MP4.
  //
  // A fonte passa pelo proxy same-origin (`/api/video`): sem isso, um MP4
  // hospedado em servidor sem CORS carregaria mas não poderia ser desenhado no
  // canvas — o navegador marca a textura como contaminada e recusa o upload
  // para a GPU. Com o proxy, qualquer .mp4 público aparece de fato na tela.
  useEffect(() => {
    videoElRef.current?.pause();
    videoElRef.current = null;

    if (!video || video.kind !== 'MP4') return;

    const el = document.createElement('video');
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.src = proxiedMediaUrl(video.url);
    el.addEventListener('error', () => {
      // Origem fora do ar ou tipo não suportado: a reconstrução procedural cobre.
      el.dataset.flytokBlocked = '1';
    });
    void el.play().catch(() => {
      /* autoplay bloqueado pelo navegador: o modo procedural cobre a tela */
    });
    videoElRef.current = el;

    return () => {
      el.pause();
      el.removeAttribute('src');
      el.load();
    };
  }, [video]);

  // Imagens (anúncios com foto de mosquito e fotos adicionadas por pessoas)
  // passam pelo mesmo proxy same-origin, pelo mesmo motivo do vídeo.
  useEffect(() => {
    imageElRef.current = null;
    if (!video || video.kind !== 'IMAGE' || !video.url) return;

    const img = new Image();
    img.decoding = 'async';
    img.addEventListener('error', () => {
      img.dataset.flytokBlocked = '1';
    });
    img.src = proxiedMediaUrl(video.url);
    imageElRef.current = img;

    return () => {
      img.src = '';
    };
  }, [video]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    clock.current += dt;

    const el = videoElRef.current;
    if (el) {
      if (live.running && el.paused) void el.play().catch(() => {});
      if (!live.running && !el.paused) el.pause();
    }

    const snap = live.snapshot;

    const media: HTMLVideoElement | HTMLImageElement | null = el ?? imageElRef.current;
    paintContent(content.ctx, TEX_W, TEX_H, video, live.stimulus, clock.current, media, live.running);
    content.texture.needsUpdate = true;

    paintOverlay(overlay.ctx, TEX_W, TEX_H, overlayState.current, {
      video,
      likeCount: live.likeCount,
      likePulse: live.likePulse,
      scrollPulse: live.scrollPulse,
      attention: snap?.attention ?? 0,
      dopamine: snap?.dopamine ?? 0,
      dt,
      t: clock.current,
      adRemaining: live.adRemaining,
      watching: live.watching,
      commentEmoji: live.lastComment,
      commentPulse: live.commentPulse,
    });
    overlay.texture.needsUpdate = true;

    // Decaimento dos pulsos — o PhoneFeed é o dono do relógio dessas animações.
    live.likePulse = Math.max(0, live.likePulse - dt * 1.6);
    live.scrollPulse = Math.max(0, live.scrollPulse - dt * 1.9);
    live.commentPulse = Math.max(0, live.commentPulse - dt * 0.8);
    live.consumePulse = Math.max(0, live.consumePulse - dt * 1.1);

    // A luz da tela acompanha o brilho do conteúdo e pulsa no like.
    if (screenLight.current) {
      const base = 0.5 + (live.stimulus.brightness ?? 0) * 1.5 * (live.running ? 1 : 0.15);
      screenLight.current.intensity = base + live.likePulse * 2.4;
      screenLight.current.color.setHex(live.likePulse > 0.05 ? 0xff4d79 : 0x9fd8ff);
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* ------- suporte de bancada ------- */}
      <mesh position={[0, -0.62, -0.06]} castShadow receiveShadow>
        <cylinderGeometry args={[0.3, 0.34, 0.035, 40]} />
        <meshStandardMaterial color="#11161f" metalness={0.85} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.36, -0.11]} rotation={[0.12, 0, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.034, 0.54, 20]} />
        <meshStandardMaterial color="#1b2331" metalness={0.9} roughness={0.28} />
      </mesh>
      <mesh position={[0, -0.09, -0.055]} rotation={[0.12, 0, 0]} castShadow>
        <boxGeometry args={[0.22, 0.05, 0.1]} />
        <meshStandardMaterial color="#222c3d" metalness={0.8} roughness={0.4} />
      </mesh>

      {/* ------- corpo do aparelho ------- */}
      <RoundedBox args={[PHONE_W, PHONE_H, 0.032]} radius={0.03} smoothness={4} castShadow>
        <meshStandardMaterial color="#0b0f16" metalness={0.75} roughness={0.32} />
      </RoundedBox>

      {/* ------- tela: conteúdo ------- */}
      <mesh position={[0, 0, 0.0175]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={content.texture} toneMapped={false} />
      </mesh>

      {/* ------- tela: overlay (UI + corações) ------- */}
      <mesh position={[0, 0, 0.0185]}>
        <planeGeometry args={[SCREEN_W, SCREEN_H]} />
        <meshBasicMaterial map={overlay.texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>

      {/* Sem plano de vidro por cima da tela: `transmission` lavava a textura
          e apagava o conteúdo do feed. O brilho especular fica por conta do
          corpo do aparelho e da vinheta pintada no próprio canvas. */}

      {/* ------- embeds (Shorts / TikTok / Reels) -------
          Pixels de um iframe de terceiros são inacessíveis ao WebGL, então o
          player real é montado como DOM ancorado na superfície da tela. Ele
          toca de verdade; em compensação, por ser DOM, desenha por cima da
          cena e não recebe oclusão das patas da mosca. */}
      {video?.kind === 'EMBED' && video.embedUrl && (
        <Html
          transform
          position={[0, 0, 0.019]}
          scale={EMBED_SCALE}
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <iframe
            key={video.id}
            src={video.embedUrl}
            title={video.title}
            width={TEX_W}
            height={TEX_H}
            style={{ border: 0, display: 'block', background: '#000' }}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </Html>
      )}

      {/* Luz emitida pela tela — é ela que ilumina a mosca. */}
      <pointLight ref={screenLight} position={[0, 0, 0.5]} distance={4} intensity={1} color="#9fd8ff" />
    </group>
  );
}

export { PHONE_W, PHONE_H, SCREEN_W, SCREEN_H };
