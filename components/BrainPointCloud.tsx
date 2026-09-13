'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { live } from '@/lib/live';
import { ConnectomeData, loadConnectome } from '@/lib/connectome';
import { useTheme } from '@/lib/theme';
import { ClusterId } from '@/lib/types';

/**
 * BrainPointCloud
 * ---------------
 * O conectoma **real** da Drosophila: 139.248 neurônios do FlyWire FAFB v783,
 * cada ponto na coordenada em que o neurônio de fato está no volume, com a
 * população atribuída pela anotação de tipo celular publicada.
 *
 * Tudo em um único BufferGeometry, uma draw call. Cor e tamanho saem do vertex
 * shader a partir de uniforms de ativação — atualizar o cérebro inteiro custa
 * cinco floats por frame, e nenhum atributo volta para a GPU.
 *
 * Dados: Schlegel et al. 2024, Nature 634:139-152 (CC-BY-4.0).
 * Gerados por `scripts/build-connectome.mjs`.
 */

/** Ordem das populações = valor do atributo aCluster. Espelha o script de build. */
const CLUSTER_ORDER: ClusterId[] = ['visualLobula', 'pamDopamine', 'ppl1Aversion', 'centralComplex'];

/** Cor de pico de cada população quando totalmente ativa. */
const CLUSTER_COLOR: Record<ClusterId, string> = {
  visualLobula: '#22d3ee', // ciano — processamento visual
  pamDopamine: '#c8f13a', // amarelo/verde — dopamina / recompensa
  ppl1Aversion: '#f2385a', // vermelho — aversão / tédio
  centralComplex: '#a855f7', // violeta — decisão motora
};

/**
 * Repouso e tecido de fundo dependem do tema.
 *
 * No escuro os pontos se somam (blending aditivo) e o cérebro brilha. Em fundo
 * claro a soma aditiva satura para branco e o cérebro desaparece — então lá o
 * blending é normal e as cores precisam ser escuras para marcar contra a página.
 */
const THEME_PALETTE = {
  dark: { rest: '#1f47a8', background: '#12306e', bgAlpha: 0.12, bgSize: 0.5 },
  light: { rest: '#1e3a8a', background: '#64748b', bgAlpha: 0.3, bgSize: 0.55 },
} as const;

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec4  uAct;        // ativação [0,1] dos 4 clusters modelados
  uniform vec3  uRest;
  uniform vec3  uC0;
  uniform vec3  uC1;
  uniform vec3  uC2;
  uniform vec3  uC3;
  uniform vec3  uC4;         // tecido de fundo (demais neurônios)
  uniform float uSize;
  uniform float uPixelRatio;
  /** Tamanho e opacidade relativos dos neurônios de fundo. */
  uniform float uBgSize;
  uniform float uBgAlpha;

  attribute float aCluster;  // 0..4
  attribute float aSeed;

  varying vec3  vColor;
  varying float vGlow;
  varying float vAlpha;

  void main() {
    // Pesos one-hot sem branching: w[i] = 1 quando aCluster == i.
    float w0 = 1.0 - min(abs(aCluster - 0.0), 1.0);
    float w1 = 1.0 - min(abs(aCluster - 1.0), 1.0);
    float w2 = 1.0 - min(abs(aCluster - 2.0), 1.0);
    float w3 = 1.0 - min(abs(aCluster - 3.0), 1.0);
    float w4 = 1.0 - min(abs(aCluster - 4.0), 1.0);

    float act    = w0 * uAct.x + w1 * uAct.y + w2 * uAct.z + w3 * uAct.w;
    vec3  target = w0 * uC0 + w1 * uC1 + w2 * uC2 + w3 * uC3 + w4 * uC4;

    // Disparo individual: cada neurônio pulsa na sua própria frequência, então
    // a população cintila em vez de acender como um bloco sólido.
    float spike = pow(0.5 + 0.5 * sin(uTime * (2.0 + aSeed * 7.0) + aSeed * 31.4), 6.0);
    float intensity = clamp(act * (0.28 + 0.72 * spike), 0.0, 1.0);

    // O tecido de fundo não participa da simulação: fica em brilho baixo
    // constante, só o suficiente para desenhar a anatomia.
    vColor = mix(mix(uRest, target, clamp(intensity * 1.45, 0.0, 1.0)), uC4, w4);
    vGlow  = intensity * (1.0 - w4);
    vAlpha = mix(0.34 + 0.66 * intensity, uBgAlpha, w4);

    // Respiração sutil do tecido, para o cérebro nunca parecer estático.
    vec3 pos = position;
    pos += normalize(position + 0.001) * sin(uTime * 0.8 + aSeed * 12.0) * 0.005;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sizeMul = mix(0.85 + 1.5 * intensity, uBgSize, w4);
    gl_PointSize = uSize * uPixelRatio * sizeMul * (1.0 / max(0.25, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  varying vec3  vColor;
  varying float vGlow;
  varying float vAlpha;

  void main() {
    // Disco com falloff suave — evita o quadrado duro do gl_PointCoord.
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.06, d);
    gl_FragColor = vec4(vColor * (0.8 + 1.15 * vGlow), alpha * vAlpha);
  }
`;

interface Props {
  scale?: number;
  position?: [number, number, number];
  /** Tamanho base do ponto. */
  pointSize?: number;
  /** Chamado quando os dados reais terminam de carregar (ou falham). */
  onLoad?: (data: ConnectomeData | null, error?: string) => void;
}

export default function BrainPointCloud({
  scale = 1,
  position = [0, 0, 0],
  pointSize = 15,
  onLoad,
}: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const [data, setData] = useState<ConnectomeData | null>(null);
  const theme = useTheme((s) => s.theme);

  // Carregamento imperativo, de propósito: um `Suspense` aqui deixaria a cena
  // inteira em branco e sem log se o fetch nunca resolvesse.
  useEffect(() => {
    let alive = true;
    loadConnectome()
      .then((d) => {
        if (!alive) return;
        setData(d);
        onLoad?.(d);
      })
      .catch((err: Error) => {
        if (!alive) return;
        console.error('[flytok] conectoma não carregou:', err.message);
        onLoad?.(null, err.message);
      });
    return () => {
      alive = false;
    };
    // `onLoad` é intencionalmente omitido: o fetch é memoizado e só roda uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geometria montada uma única vez a partir dos dados reais.
  const geometry = useMemo(() => {
    if (!data) return null;
    const n = data.meta.neuronCount;

    const seeds = new Float32Array(n);
    const clusters = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // Fase determinística por índice: o cintilar é estável entre recargas.
      seeds[i] = ((i * 2654435761) % 1000) / 1000;
      clusters[i] = data.clusters[i];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('aCluster', new THREE.BufferAttribute(clusters, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.computeBoundingSphere();
    return geo;
  }, [data]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAct: { value: new THREE.Vector4(0.05, 0.05, 0.05, 0.05) },
      uRest: { value: new THREE.Color(THEME_PALETTE.dark.rest) },
      uC0: { value: new THREE.Color(CLUSTER_COLOR.visualLobula) },
      uC1: { value: new THREE.Color(CLUSTER_COLOR.pamDopamine) },
      uC2: { value: new THREE.Color(CLUSTER_COLOR.ppl1Aversion) },
      uC3: { value: new THREE.Color(CLUSTER_COLOR.centralComplex) },
      uC4: { value: new THREE.Color(THEME_PALETTE.dark.background) },
      uSize: { value: pointSize },
      uPixelRatio: { value: 1 },
      uBgSize: { value: 0.5 },
      uBgAlpha: { value: 0.12 },
    }),
    [pointSize]
  );

  // Repinta a paleta quando o tema muda. São quatro uniforms — nada é
  // reconstruído, a geometria de 139 mil pontos permanece intacta na GPU.
  useEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    const p = THEME_PALETTE[theme];
    (mat.uniforms.uRest.value as THREE.Color).set(p.rest);
    (mat.uniforms.uC4.value as THREE.Color).set(p.background);
    mat.uniforms.uBgAlpha.value = p.bgAlpha;
    mat.uniforms.uBgSize.value = p.bgSize;
    mat.blending = theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.needsUpdate = true;
  }, [theme, data]);

  useFrame((state, delta) => {
    const mat = matRef.current;
    if (!mat) return;

    mat.uniforms.uTime.value += delta;
    mat.uniforms.uPixelRatio.value = state.gl.getPixelRatio();

    // Lê o canal quente: sem setState, sem re-render.
    const snap = live.snapshot;
    if (snap) {
      const a = mat.uniforms.uAct.value as THREE.Vector4;
      // Suavização extra além da do modelo, para o brilho não "piscar" entre
      // os ticks de 100 ms.
      const k = Math.min(1, delta * 9);
      a.x += (snap.clusters.visualLobula - a.x) * k;
      a.y += (snap.clusters.pamDopamine - a.y) * k;
      a.z += (snap.clusters.ppl1Aversion - a.z) * k;
      a.w += (snap.clusters.centralComplex - a.w) * k;
    }

    if (groupRef.current) groupRef.current.rotation.y += delta * 0.18;
  });

  if (!geometry) return null;

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

export { CLUSTER_COLOR, CLUSTER_ORDER };
