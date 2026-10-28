import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";

function makeMarsTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#d9a07a");
  grad.addColorStop(0.08, "#b8532a");
  grad.addColorStop(0.5, "#a3431f");
  grad.addColorStop(0.92, "#8a3a1c");
  grad.addColorStop(1, "#e8d8cc");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  // seeded pseudo-random
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const x = r() * 1024, y = 40 + r() * 432, rad = r() * 26 + 2;
    g.fillStyle = r() > 0.5 ? `rgba(60,20,8,${r() * 0.25})` : `rgba(230,140,90,${r() * 0.18})`;
    g.beginPath();
    g.ellipse(x, y, rad * 1.6, rad, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Valles Marineris scar
  g.strokeStyle = "rgba(40,12,5,0.5)";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(380, 270);
  g.bezierCurveTo(480, 285, 560, 262, 680, 280);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Planet() {
  const ref = useRef<THREE.Group>(null);
  const map = useMemo(makeMarsTexture, []);
  const pins = useMemo(
    () =>
      ([
        [18, -133], [-18, 77], [-8, -70], [40, 10], [-30, 150],
      ] as [number, number][]).map(([lat, lon]) => {
        const phi = ((90 - lat) * Math.PI) / 180, th = ((lon + 180) * Math.PI) / 180;
        return new THREE.Vector3(-Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)).multiplyScalar(2.02);
      }),
    [],
  );
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += Math.min(d, 0.05) * 0.06;
  });
  return (
    <group ref={ref} rotation={[0.25, 0, 0.1]}>
      <mesh>
        <sphereGeometry args={[2, 96, 96]} />
        <meshStandardMaterial map={map} roughness={0.95} />
      </mesh>
      <mesh scale={1.06}>
        <sphereGeometry args={[2, 64, 64]} />
        <meshBasicMaterial color="#ff4d00" transparent opacity={0.12} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {pins.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.03, 12, 12]} />
          <meshBasicMaterial color="#00f0ff" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function MarsGlobe({ position = [0, 0, 0] as [number, number, number] }) {
  return (
    <Canvas camera={{ position: [0, 0, 6.2], fov: 45 }} dpr={[1, 1.5]}>
      <color attach="background" args={["#07080c"]} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 2, 4]} intensity={2.4} color="#ffe2cc" />
      <directionalLight position={[-6, -1, -3]} intensity={0.4} color="#00f0ff" />
      <Stars radius={60} depth={40} count={2500} factor={3} fade speed={0.4} />
      <group position={position}>
        <Planet />
      </group>
    </Canvas>
  );
}
