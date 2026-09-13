'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useLabStore } from '@/store/useLabStore';
import { ITEM_BY_ID } from '@/lib/world';

/**
 * EnvironmentProps
 * ----------------
 * Os objetos que existem de fato na bancada. O que a mosca possui aparece aqui;
 * o que ela não comprou simplesmente não está no mundo — é essa ausência que
 * cria a necessidade que a publicidade explora.
 *
 * Assina só a lista de itens (que muda raramente, quando algo é entregue ou
 * consumido); toda a animação por frame lê refs.
 */

/** Posições fixas na bancada, ao redor da mosca. */
const SLOTS: [number, number, number][] = [
  [-0.95, -0.06, -0.35],
  [0.95, -0.06, -0.4],
  [-0.72, -0.06, -1.05],
  [0.75, -0.06, -1.0],
  [-1.25, -0.06, -0.8],
  [1.25, -0.06, -0.75],
  [0, -0.06, -1.35],
  [-0.3, -0.06, -1.5],
];

function Bob({ children, speed = 1 }: { children: React.ReactNode; speed?: number }) {
  const g = useRef<THREE.Group>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = Math.sin(clock.elapsedTime * speed + phase) * 0.012;
  });
  return <group ref={g}>{children}</group>;
}

/** Geometria simples e legível para cada item do catálogo. */
function Prop({ id }: { id: string }) {
  const spin = useRef<THREE.Group>(null);
  useFrame((_, d) => {
    if (spin.current) spin.current.rotation.y += d * 0.9;
  });

  switch (id) {
    case 'orvalho':
      return (
        <Bob speed={1.4}>
          <mesh position={[0, 0.06, 0]} castShadow>
            <sphereGeometry args={[0.09, 20, 16]} />
            <meshPhysicalMaterial
              color="#bfe8ff"
              transparent
              opacity={0.65}
              roughness={0.05}
              transmission={0.9}
              thickness={0.1}
            />
          </mesh>
        </Bob>
      );

    case 'poleiro':
      return (
        <group>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.09, 0.06, 0]} castShadow>
              <cylinderGeometry args={[0.006, 0.006, 0.13, 8]} />
              <meshStandardMaterial color="#6b7280" metalness={0.9} roughness={0.35} />
            </mesh>
          ))}
          <mesh position={[0, 0.125, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.007, 0.007, 0.2, 8]} />
            <meshStandardMaterial color="#9aa3b2" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>
      );

    case 'melado':
      return (
        <mesh position={[0, 0.025, 0]} scale={[1, 0.45, 1]} castShadow>
          <sphereGeometry args={[0.1, 20, 14]} />
          <meshStandardMaterial color="#c8801a" roughness={0.25} metalness={0.1} />
        </mesh>
      );

    case 'fruta':
      return (
        <Bob speed={0.8}>
          <mesh position={[0, 0.1, 0]} castShadow>
            <sphereGeometry args={[0.11, 22, 18]} />
            <meshStandardMaterial color="#c2410c" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.21, 0]} rotation={[0.3, 0, 0.2]}>
            <cylinderGeometry args={[0.006, 0.008, 0.06, 6]} />
            <meshStandardMaterial color="#3f2d16" />
          </mesh>
        </Bob>
      );

    case 'acucar':
      return (
        <group ref={spin}>
          <mesh position={[0, 0.08, 0]} castShadow>
            <octahedronGeometry args={[0.095, 0]} />
            <meshPhysicalMaterial
              color="#f8fafc"
              roughness={0.1}
              transmission={0.55}
              thickness={0.2}
              metalness={0}
            />
          </mesh>
        </group>
      );

    case 'ninho':
      return (
        <mesh position={[0, 0.05, 0]} scale={[1, 0.6, 1]} castShadow>
          <dodecahedronGeometry args={[0.13, 0]} />
          <meshStandardMaterial color="#e8e3d8" roughness={0.95} />
        </mesh>
      );

    case 'espelho':
      return (
        <group ref={spin}>
          <mesh position={[0, 0.14, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.09, 0.01, 24]} />
            <meshStandardMaterial color="#dbeafe" metalness={1} roughness={0.04} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.008, 0.012, 0.16, 8]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      );

    case 'flor':
      return (
        <Bob speed={0.6}>
          <mesh position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.005, 0.007, 0.18, 6]} />
            <meshStandardMaterial color="#3f6212" />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh
              key={i}
              position={[
                Math.cos((i / 5) * Math.PI * 2) * 0.055,
                0.19,
                Math.sin((i / 5) * Math.PI * 2) * 0.055,
              ]}
              rotation={[0.5, (i / 5) * Math.PI * 2, 0]}
              castShadow
            >
              <sphereGeometry args={[0.04, 12, 8]} />
              <meshStandardMaterial color="#f9a8d4" roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.028, 12, 10]} />
            <meshStandardMaterial color="#fde047" emissive="#a16207" emissiveIntensity={0.3} />
          </mesh>
        </Bob>
      );

    default:
      return null;
  }
}

export default function EnvironmentProps() {
  // Só a lista de ids importa para a cena — assinar o snapshot inteiro faria o
  // Canvas re-renderizar a 10 Hz.
  const ids = useLabStore((s) => (s.agentSnapshot?.owned ?? []).map((o) => o.id).join(','));
  const list = ids ? ids.split(',') : [];

  return (
    <group>
      {list.map((id, i) => {
        const spec = ITEM_BY_ID[id];
        if (!spec) return null;
        const slot = SLOTS[i % SLOTS.length];
        return (
          <group key={id} position={slot}>
            <Prop id={id} />
          </group>
        );
      })}
    </group>
  );
}
