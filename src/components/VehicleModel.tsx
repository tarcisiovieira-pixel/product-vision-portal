import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vehicle } from "@/lib/ares-data";

const HULL = "#d9d4cc";
const ACCENT = "#ff5a1f";
const GLOW = "#00f0ff";

function Metal({ color = HULL }: { color?: string }) {
  return <meshStandardMaterial color={color} metalness={0.7} roughness={0.35} />;
}

function Vtol() {
  const rotors = useRef<THREE.Group[]>([]);
  useFrame((_, d) => rotors.current.forEach((r) => r && (r.rotation.y += Math.min(d, 0.05) * 18)));
  const arms: [number, number][] = [[1.3, 1], [-1.3, 1], [1.3, -1], [-1.3, -1]];
  return (
    <group>
      <mesh castShadow><capsuleGeometry args={[0.55, 1.6, 8, 24]} /><Metal /></mesh>
      <mesh position={[0, 0.25, 0.55]} rotation={[0.3, 0, 0]}><sphereGeometry args={[0.45, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#112" metalness={0.9} roughness={0.05} /></mesh>
      {arms.map(([x, z], i) => (
        <group key={i} position={[x, 0.1, z]}>
          <mesh position={[-x / 2, 0, 0]}><boxGeometry args={[Math.abs(x), 0.08, 0.15]} /><Metal color={ACCENT} /></mesh>
          <mesh><torusGeometry args={[0.45, 0.05, 8, 32]} /><Metal /></mesh>
          <group ref={(g) => { if (g) rotors.current[i] = g; }}>
            <mesh><boxGeometry args={[0.85, 0.02, 0.08]} /><meshStandardMaterial color="#333" /></mesh>
          </group>
          <pointLight color={GLOW} intensity={0.6} distance={1.5} />
        </group>
      ))}
    </group>
  );
}

function Truck() {
  return (
    <group position={[0, -0.2, 0]}>
      <mesh position={[0, 0.3, 1.2]}><boxGeometry args={[1.4, 1, 1]} /><Metal color={ACCENT} /></mesh>
      <mesh position={[0, 0.45, 1.71]}><boxGeometry args={[1.1, 0.4, 0.02]} /><meshStandardMaterial color={GLOW} emissive={GLOW} emissiveIntensity={0.6} /></mesh>
      <mesh position={[0, 0.4, -0.6]}><boxGeometry args={[1.6, 1.2, 2.4]} /><Metal /></mesh>
      {[-1, 0, 1].map((z) =>
        [-0.85, 0.85].map((x) => (
          <mesh key={`${x}${z}`} position={[x, -0.3, z * 0.9]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.35, 0.35, 0.3, 20]} /><meshStandardMaterial color="#222" roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Rocket() {
  return (
    <group position={[0, -1.4, 0]}>
      <mesh position={[0, 1.6, 0]}><cylinderGeometry args={[0.5, 0.5, 3.2, 32]} /><Metal /></mesh>
      <mesh position={[0, 3.6, 0]}><coneGeometry args={[0.5, 0.9, 32]} /><Metal /></mesh>
      <mesh position={[0, 2.6, 0]}><cylinderGeometry args={[0.505, 0.505, 0.12, 32]} /><Metal color={ACCENT} /></mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos((i * Math.PI) / 2) * 0.6, 0.3, Math.sin((i * Math.PI) / 2) * 0.6]} rotation={[0, -(i * Math.PI) / 2, 0]}>
          <boxGeometry args={[0.4, 0.8, 0.05]} /><Metal color={ACCENT} />
        </mesh>
      ))}
      <mesh position={[0, -0.1, 0]}><coneGeometry args={[0.35, 0.4, 24, 1, true]} /><meshStandardMaterial color={GLOW} emissive={GLOW} emissiveIntensity={1.2} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

export function VehicleModel({ category }: { category: Vehicle["category"] }) {
  if (category === "car_vtol") return <Vtol />;
  if (category === "space_truck") return <Truck />;
  return <Rocket />;
}
