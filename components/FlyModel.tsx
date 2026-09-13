'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { live } from '@/lib/live';

/**
 * FlyModel
 * --------
 * Drosophila estilizada e articulada: abdômen, tórax, cabeça, olhos compostos,
 * asas com batimento e seis patas de dois segmentos (fêmur + tíbia).
 *
 * As patas dianteiras são dirigidas pelos pulsos do canal `live`:
 *   · `likePulse`   → a pata toca a tela (gesto de curtir);
 *   · `scrollPulse` → a pata sobe arrastando a tela (gesto de rolar o feed).
 *
 * Toda a animação roda em `useFrame` sobre refs — nenhum estado do React é
 * tocado, então a cena mantém 60 FPS independentemente da taxa da simulação.
 */

const CHITIN = '#23242e';
const CHITIN_HI = '#3c4052';

/** Posições das seis coxas no tórax: [x, y, z] com x espelhado por lado. */
const LEG_ANCHORS: Array<{ z: number; spread: number; pitch: number }> = [
  { z: 0.14, spread: 0.55, pitch: -0.35 }, // dianteiras
  { z: -0.02, spread: 0.95, pitch: 0.1 }, // medianas
  { z: -0.18, spread: 0.8, pitch: 0.6 }, // traseiras
];

const FEMUR = 0.3;
const TIBIA = 0.28;

interface LegProps {
  side: 1 | -1;
  pair: 0 | 1 | 2;
  /** Ref exposto para as patas dianteiras, animadas pelos pulsos. */
  hipRef?: React.MutableRefObject<THREE.Group | null>;
  kneeRef?: React.MutableRefObject<THREE.Group | null>;
}

function Leg({ side, pair, hipRef, kneeRef }: LegProps) {
  const anchor = LEG_ANCHORS[pair];
  const localHip = useRef<THREE.Group>(null);
  const localKnee = useRef<THREE.Group>(null);
  const hip = hipRef ?? localHip;
  const knee = kneeRef ?? localKnee;

  return (
    <group position={[side * 0.15, -0.04, anchor.z]}>
      {/* Quadril: spread lateral fixo + pitch animado. */}
      <group
        ref={hip as React.Ref<THREE.Group>}
        rotation={[anchor.pitch, 0, side * anchor.spread]}
      >
        <mesh position={[0, -FEMUR / 2, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.016, FEMUR, 8]} />
          <meshStandardMaterial color={CHITIN} roughness={0.55} metalness={0.2} />
        </mesh>
        {/* Joelho */}
        <group ref={knee as React.Ref<THREE.Group>} position={[0, -FEMUR, 0]} rotation={[0, 0, -side * 0.9]}>
          <mesh position={[0, -TIBIA / 2, 0]} castShadow>
            <cylinderGeometry args={[0.014, 0.008, TIBIA, 8]} />
            <meshStandardMaterial color={CHITIN_HI} roughness={0.5} metalness={0.25} />
          </mesh>
          {/* Tarso — a "ponta do dedo" que encosta no vidro. */}
          <mesh position={[0, -TIBIA - 0.02, 0]}>
            <sphereGeometry args={[0.016, 10, 10]} />
            <meshStandardMaterial color="#3d4252" roughness={0.4} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export default function FlyModel({
  position = [0, 0, 0] as [number, number, number],
  scale = 1,
}: {
  position?: [number, number, number];
  scale?: number;
}) {
  const body = useRef<THREE.Group>(null);
  const wingL = useRef<THREE.Group>(null);
  const wingR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyeMat = useRef<THREE.MeshStandardMaterial>(null);

  // Patas dianteiras: controladas pelos gestos.
  const hipL = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const hipR = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);

  const t = useRef(0);
  /** 0 = de frente para a tela, 1 = virada para a bancada. */
  const away = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    t.current += dt;
    const time = t.current;

    const snap = live.snapshot;
    const arousal = snap ? snap.clusters.visualLobula : 0;
    const like = live.likePulse;
    const scroll = live.scrollPulse;
    const comment = live.commentPulse;
    const consume = live.consumePulse;
    // Gesto ativo: 1 quando alguma das patas está na tela.
    // Comentar também é um gesto na tela — a mosca datilografa com a pata.
    const reach = Math.max(like, scroll, comment * 0.8);

    // Quando o agente não está no feed, a mosca vira o corpo para a bancada.
    const awayTarget = live.watching ? 0 : 1;
    away.current += (awayTarget - away.current) * Math.min(1, dt * 2.2);

    // -- corpo: respiração + empinada ao alcançar a tela --------------------
    if (body.current) {
      // Consumir abaixa o corpo até o objeto; comentar e curtir levantam.
      body.current.position.y =
        Math.sin(time * 2.1) * 0.006 + reach * 0.05 - consume * 0.06;
      body.current.rotation.x =
        -reach * 0.32 + consume * 0.35 + Math.sin(time * 1.3) * 0.012;
      // Agitação lateral proporcional à excitação visual.
      body.current.rotation.z = Math.sin(time * 6.5) * 0.02 * arousal;
      // Vira de lado quando sai do feed para cuidar da própria vida.
      body.current.rotation.y = away.current * 1.15;
    }

    // -- cabeça: acompanha a tela, com micro-sacadas ------------------------
    if (head.current) {
      head.current.rotation.y = Math.sin(time * 3.7) * 0.09 * arousal;
      head.current.rotation.x = -0.1 - arousal * 0.12;
    }

    // -- olhos compostos: brilham com a taxa de disparo visual --------------
    if (eyeMat.current) {
      eyeMat.current.emissiveIntensity = 0.35 + arousal * 2.2;
    }

    // -- asas: zumbido proporcional à excitação -----------------------------
    const buzz = 0.25 + arousal * 0.9;
    const flap = Math.sin(time * (24 + arousal * 60)) * buzz;
    if (wingL.current) wingL.current.rotation.z = 0.35 + flap;
    if (wingR.current) wingR.current.rotation.z = -0.35 - flap;

    // -- patas dianteiras ---------------------------------------------------
    // Pose de repouso → pose de alcance, interpolada pelo pulso ativo.
    // O like é um toque curto; o scroll é um arrasto que sobe a tela.
    const tap = like;
    const swipe = scroll;
    const lift = Math.max(tap, swipe);

    // Pata direita executa o toque (like).
    if (hipR.current && kneeR.current) {
      // Durante o comentário a pata martela a tela num ritmo rápido.
      const typing = comment > 0.02 ? (0.5 + 0.5 * Math.sin(time * 22)) * comment : 0;
      const target = -0.35 - tap * 1.35 - swipe * 0.55 - typing * 1.1;
      hipR.current.rotation.x += (target - hipR.current.rotation.x) * Math.min(1, dt * 14);
      hipR.current.rotation.z += (-0.55 + lift * 0.42 - hipR.current.rotation.z) * Math.min(1, dt * 14);
      const knee = 0.9 - tap * 0.75 - swipe * 0.3;
      kneeR.current.rotation.z += (knee - kneeR.current.rotation.z) * Math.min(1, dt * 14);
    }

    // Pata esquerda executa o arrasto (scroll) — sobe durante o pulso.
    if (hipL.current && kneeL.current) {
      const target = -0.35 - swipe * 1.5 - tap * 0.25;
      hipL.current.rotation.x += (target - hipL.current.rotation.x) * Math.min(1, dt * 14);
      hipL.current.rotation.z += (0.55 - lift * 0.42 - hipL.current.rotation.z) * Math.min(1, dt * 14);
      const knee = -0.9 + swipe * 0.8 + tap * 0.2;
      kneeL.current.rotation.z += (knee - kneeL.current.rotation.z) * Math.min(1, dt * 14);
    }
  });

  return (
    <group ref={body} position={position} scale={scale}>
      {/* ---------- abdômen ---------- */}
      <mesh position={[0, 0, -0.34]} castShadow>
        <sphereGeometry args={[0.22, 28, 22]} />
        <meshStandardMaterial color="#2e2819" roughness={0.42} metalness={0.4} />
      </mesh>
      {/* Faixas do abdômen */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, 0, -0.26 - i * 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2 - i * 0.025, 0.012, 8, 28]} />
          <meshStandardMaterial color="#0a0906" roughness={0.6} />
        </mesh>
      ))}

      {/* ---------- tórax ---------- */}
      <mesh castShadow>
        <sphereGeometry args={[0.2, 28, 22]} />
        <meshStandardMaterial color="#3b3524" roughness={0.38} metalness={0.45} />
      </mesh>
      {/* Cerdas dorsais */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.07, 0.17, -0.03]} rotation={[-0.5, 0, s * 0.3]}>
          <cylinderGeometry args={[0.004, 0.001, 0.12, 5]} />
          <meshStandardMaterial color="#0c0b08" />
        </mesh>
      ))}

      {/* ---------- cabeça ---------- */}
      <group ref={head} position={[0, 0.06, 0.2]}>
        <mesh castShadow>
          <sphereGeometry args={[0.145, 26, 20]} />
          <meshStandardMaterial color="#3f3823" roughness={0.42} />
        </mesh>
        {/* Olhos compostos — o vermelho característico de D. melanogaster. */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.095, 0.02, 0.03]} scale={[0.85, 1.05, 0.9]}>
            <sphereGeometry args={[0.088, 20, 16]} />
            <meshStandardMaterial
              ref={s === 1 ? eyeMat : undefined}
              color="#8c1220"
              emissive="#ff2d4a"
              emissiveIntensity={0.4}
              roughness={0.25}
              metalness={0.1}
            />
          </mesh>
        ))}
        {/* Probóscide */}
        <mesh position={[0, -0.08, 0.09]} rotation={[0.6, 0, 0]}>
          <cylinderGeometry args={[0.028, 0.038, 0.08, 12]} />
          <meshStandardMaterial color="#3a3422" roughness={0.6} />
        </mesh>
        {/* Antenas */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.04, -0.02, 0.12]} rotation={[0.9, 0, s * 0.2]}>
            <capsuleGeometry args={[0.009, 0.05, 4, 8]} />
            <meshStandardMaterial color="#4a422c" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* ---------- asas ---------- */}
      {[
        { ref: wingL, side: -1 },
        { ref: wingR, side: 1 },
      ].map(({ ref, side }) => (
        <group key={side} ref={ref} position={[side * 0.07, 0.14, -0.12]}>
          <mesh position={[side * 0.26, 0.02, -0.16]} rotation={[0.1, side * -0.25, 0]} scale={[1, 0.06, 0.42]}>
            <sphereGeometry args={[0.3, 18, 12]} />
            <meshPhysicalMaterial
              color="#cfe8ff"
              transparent
              opacity={0.24}
              roughness={0.1}
              metalness={0}
              transmission={0.85}
              thickness={0.02}
              iridescence={1}
              iridescenceIOR={1.3}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}

      {/* ---------- halteres (órgãos de equilíbrio) ---------- */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.11, 0.02, -0.19]}>
          <sphereGeometry args={[0.022, 10, 8]} />
          <meshStandardMaterial color="#5a5132" roughness={0.6} />
        </mesh>
      ))}

      {/* ---------- patas ---------- */}
      <Leg side={-1} pair={0} hipRef={hipL} kneeRef={kneeL} />
      <Leg side={1} pair={0} hipRef={hipR} kneeRef={kneeR} />
      <Leg side={-1} pair={1} />
      <Leg side={1} pair={1} />
      <Leg side={-1} pair={2} />
      <Leg side={1} pair={2} />
    </group>
  );
}
