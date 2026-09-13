'use client';

import { Suspense, memo, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import BrainPointCloud from './BrainPointCloud';
import EnvironmentProps from './EnvironmentProps';
import FlyModel from './FlyModel';
import PhoneFeed from './PhoneFeed';
import { live } from '@/lib/live';
import { useLabStore } from '@/store/useLabStore';
import { useTheme } from '@/lib/theme';

/**
 * FlyScene
 * --------
 * Bancada virtual: mosca articulada, smartphone em suporte exibindo o feed e o
 * conectoma flutuando acima da cabeça do animal como um holograma.
 *
 * Nenhum componente aqui dentro assina o snapshot da simulação — todos leem o
 * canal `live` dentro de `useFrame`, então o Canvas nunca re-renderiza a 10 Hz.
 */

/**
 * Paleta da bancada por tema. No modo claro a cena vira um laboratório iluminado:
 * fundo claro, névoa clara e luzes bem mais fortes, já que não há mais o contraste
 * gratuito de um ambiente preto.
 */
const SCENE_THEME = {
  dark: {
    background: '#04060b',
    fog: ['#04060b', 3.5, 11] as [string, number, number],
    floor: '#080b12',
    gridCell: '#14263f',
    gridSection: '#1d4e6b',
    ambient: 0.25,
    ambientColor: '#6f8cff',
    hemi: 0.6,
    key: 0.35,
    rim: 16,
  },
  light: {
    background: '#e8eef6',
    fog: ['#e8eef6', 5, 14] as [string, number, number],
    floor: '#d7e0ec',
    gridCell: '#b3c2d6',
    gridSection: '#8aa3c0',
    ambient: 0.9,
    ambientColor: '#ffffff',
    hemi: 1.5,
    key: 1.6,
    rim: 8,
  },
} as const;

type ScenePalette = (typeof SCENE_THEME)[keyof typeof SCENE_THEME];

/**
 * Ciclo dia/noite.
 *
 * Roda sobre a paleta do tema: o tema é a interface, o ciclo é o mundo. De dia
 * a bancada é iluminada por uma luz quente vinda de cima; à noite a única fonte
 * relevante é a tela do celular — que é exatamente quando ela mais domina.
 */
function DayNight({ palette }: { palette: ScenePalette }) {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const base = useMemo(() => new THREE.Color(palette.background), [palette.background]);
  const nightTint = useMemo(() => new THREE.Color('#050912'), []);
  const duskTint = useMemo(() => new THREE.Color('#2a1630'), []);
  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const phase = live.dayPhase;
    // Curva de luz do dia: 0 à meia-noite, 1 ao meio-dia.
    const light = Math.max(0, Math.sin((phase - 0.25) * Math.PI * 2) * 0.5 + 0.5);
    // Quão "crepuscular" está: pico no amanhecer e no entardecer.
    const dusk = Math.max(0, 1 - Math.abs(light - 0.35) * 4);

    if (ambient.current) ambient.current.intensity = palette.ambient * (0.22 + 0.78 * light);
    if (sun.current) {
      sun.current.intensity = palette.key * (0.1 + 1.5 * light);
      // Alaranjado nas bordas do dia, branco-azulado no meio.
      sun.current.color.setHSL(0.09 + light * 0.5 * 0.11, 0.55 - light * 0.35, 0.55 + light * 0.2);
      sun.current.position.set(Math.cos(phase * Math.PI * 2) * 4, 1 + light * 4, 2);
    }

    // Fundo e névoa acompanham a hora.
    scratch.copy(base).lerp(nightTint, (1 - light) * 0.85).lerp(duskTint, dusk * 0.35);
    if (scene.background instanceof THREE.Color) scene.background.copy(scratch);
    if (scene.fog) scene.fog.color.copy(scratch);
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={palette.ambient} color={palette.ambientColor} />
      <directionalLight ref={sun} position={[3, 4, 2]} intensity={palette.key} castShadow />
    </>
  );
}

/** Anel holográfico que envolve o cérebro e pulsa com a decisão motora. */
function BrainHalo() {
  const ring = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, delta) => {
    const snap = live.snapshot;
    if (ring.current) ring.current.rotation.z += delta * 0.4;
    if (mat.current && snap) {
      const central = snap.clusters.centralComplex;
      mat.current.opacity = 0.12 + central * 0.4;
      mat.current.color.setHSL(0.72 - central * 0.15, 0.8, 0.55);
    }
  });

  return (
    <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.62, 0.006, 8, 96]} />
      <meshBasicMaterial ref={mat} color="#7c5cff" transparent opacity={0.25} />
    </mesh>
  );
}

/** Feixe que liga a cabeça da mosca ao holograma do cérebro. */
function NeuralLink() {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const snap = live.snapshot;
    const act = snap ? snap.clusters.visualLobula : 0;
    mat.current.opacity = 0.06 + act * 0.22 + Math.sin(clock.elapsedTime * 6) * 0.03;
  });
  return (
    <mesh position={[0, 0.55, 0]}>
      <cylinderGeometry args={[0.012, 0.1, 1.1, 12, 1, true]} />
      <meshBasicMaterial
        ref={mat}
        color="#39d0ff"
        transparent
        opacity={0.12}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Bancada e chão do laboratório. */
function Bench({ theme }: { theme: ScenePalette }) {
  return (
    <group>
      <mesh position={[0, -0.12, -0.3]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 6]} />
        <meshStandardMaterial color={theme.floor} roughness={0.85} metalness={0.15} />
      </mesh>
      <Grid
        position={[0, -0.115, -0.3]}
        args={[7, 6]}
        cellSize={0.2}
        cellThickness={0.5}
        cellColor={theme.gridCell}
        sectionSize={1}
        sectionThickness={1}
        sectionColor={theme.gridSection}
        fadeDistance={9}
        fadeStrength={1.4}
        infiniteGrid={false}
      />
    </group>
  );
}

function SceneContents() {
  // Únicas assinaturas do store na árvore 3D: mudam só ao trocar de clipe ou tema.
  const video = useLabStore((s) => s.queue[0] ?? null);
  const setConnectome = useLabStore((s) => s.setConnectome);
  const theme = useTheme((s) => s.theme);
  const t = SCENE_THEME[theme];

  return (
    <>
      <color attach="background" args={[t.background]} />
      <fog attach="fog" args={t.fog} />

      {/* Iluminação toda local: nada de HDR remoto, que travaria o Suspense
          da cena inteira se o CDN estivesse indisponível. */}
      <hemisphereLight args={['#2a4a7f', theme === 'dark' ? '#050709' : '#c9d6e6', t.hemi]} />
      <DayNight palette={t} />
      <pointLight position={[-2.2, 1.4, -2.4]} intensity={8} color="#1b6fd0" distance={7} />
      <pointLight position={[2.4, 0.9, -2.6]} intensity={2.4} color="#a021b8" distance={6} />
      {/* Contraluz que recorta a silhueta da mosca contra o fundo. */}
      <spotLight
        position={[-1.1, 1.5, -2.3]}
        target-position={[0, 0.2, -0.62]}
        angle={0.7}
        penumbra={0.8}
        intensity={t.rim}
        distance={7}
        color="#7fd4ff"
      />

      <Bench theme={t} />
      <EnvironmentProps />

      {/* Celular: tela voltada para a mosca (-Z). */}
      <PhoneFeed video={video} position={[0, 0.5, 0]} rotation={[0, Math.PI, 0]} />

      {/* Mosca de frente para a tela. */}
      <FlyModel position={[0, 0.11, -0.52]} scale={0.82} />

      {/* Conectoma pairando acima da cabeça. */}
      <group position={[0, 1.18, -0.72]}>
        <NeuralLink />
        <BrainPointCloud
          scale={0.56}
          pointSize={15}
          onLoad={(data, error) => setConnectome(data?.meta ?? null, error)}
        />
        <BrainHalo />
      </group>

      <OrbitControls
        target={[0, 0.5, -0.3]}
        enablePan={false}
        minDistance={1.4}
        maxDistance={6}
        maxPolarAngle={Math.PI * 0.58}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

/**
 * O <Canvas> do R3F só cria a cena depois que o react-use-measure entrega a
 * primeira medição do contêiner. Quando o componente entra na página por import
 * dinâmico, essa primeira notificação do ResizeObserver pode simplesmente não
 * chegar em alguns navegadores — e o canvas fica em branco para sempre.
 * Um evento de resize logo após a montagem força a medição; é idempotente e
 * custa um frame.
 */
function useForceInitialMeasure() {
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);
}

function FlyScene() {
  useForceInitialMeasure();

  return (
    <Canvas
      // O contêiner do Canvas precisa de um tamanho que não dependa da
      // resolução do flex: sem isso o ResizeObserver do react-use-measure pode
      // não entregar a medida inicial e a cena nunca chega a ser criada.
      resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [3.7, 1.55, -3.55], fov: 33 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <Suspense fallback={null}>
        <SceneContents />
      </Suspense>
    </Canvas>
  );
}

export default memo(FlyScene);
