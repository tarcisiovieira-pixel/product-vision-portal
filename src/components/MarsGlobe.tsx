import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";

/**
 * Generates an equirectangular texture for Mars.
 * Horizontally periodic wrapping is applied to craters and features
 * to completely eliminate visible vertical seams when UV-mapped to a sphere.
 */
function makeMarsTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;

  // Martian atmospheric/altitude gradient
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#d9a07a"); // North pole ice/frost haze
  grad.addColorStop(0.08, "#b8532a"); // Sub-polar red regolith
  grad.addColorStop(0.5, "#a3431f"); // Equatorial rust
  grad.addColorStop(0.92, "#8a3a1c"); // South highlands
  grad.addColorStop(1, "#e8d8cc"); // South polar cap
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);

  // Seeded pseudo-random for deterministic rendering
  let s = 19;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);

  // Craters and geological basins (with seamless periodic wrapping)
  for (let i = 0; i < 900; i++) {
    const x = r() * 1024;
    const y = 35 + r() * 442;
    const rad = r() * 26 + 2;
    g.fillStyle = r() > 0.5 ? `rgba(60,20,8,${r() * 0.28})` : `rgba(230,140,90,${r() * 0.2})`;

    // Replicate across borders for seamless wrapping across u=0 / u=1
    for (const ox of [-1024, 0, 1024]) {
      const rx = x + ox;
      if (rx + rad * 2 >= 0 && rx - rad * 2 <= 1024) {
        g.beginPath();
        g.ellipse(rx, y, rad * 1.6, rad, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // Valles Marineris canyon complex (safely contained away from border edges)
  g.strokeStyle = "rgba(45,14,6,0.55)";
  g.lineWidth = 6;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(380, 270);
  g.bezierCurveTo(480, 285, 560, 262, 680, 280);
  g.stroke();

  // Secondary canyon branch
  g.strokeStyle = "rgba(35,10,4,0.4)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(420, 280);
  g.bezierCurveTo(510, 298, 590, 278, 660, 288);
  g.stroke();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function Planet() {
  const ref = useRef<THREE.Group>(null);
  const map = useMemo(makeMarsTexture, []);

  // Real Martian Surface Outposts
  const pins = useMemo(
    () =>
      ([
        [18.65, -133.8], // Olympus Mons Hub
        [18.38, 77.58], // Jezero Crater Station
        [-8.0, -70.0], // Valles Marineris Dock
        [46.7, -22.0], // Acidalia Outpost
        [-5.4, 137.8], // Gale Crater Base
      ] as [number, number][]).map(([lat, lon]) => {
        const phi = ((90 - lat) * Math.PI) / 180;
        const th = ((lon + 180) * Math.PI) / 180;
        return new THREE.Vector3(
          -Math.sin(phi) * Math.cos(th),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(th),
        ).multiplyScalar(2.02);
      }),
    [],
  );

  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += Math.min(d, 0.05) * 0.05;
  });

  return (
    <group ref={ref} rotation={[0.25, 0, 0.1]}>
      {/* Planetary Body */}
      <mesh>
        <sphereGeometry args={[2, 96, 96]} />
        <meshStandardMaterial map={map} roughness={0.92} metalness={0.05} />
      </mesh>

      {/* Atmospheric Haze (Thin CO2 glow) */}
      <mesh scale={1.06}>
        <sphereGeometry args={[2, 64, 64]} />
        <meshBasicMaterial
          color="#ff4400"
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Surface Outpost Beacons */}
      {pins.map((p, i) => (
        <group key={i} position={p}>
          <mesh>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshBasicMaterial color="#00f0ff" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function MarsGlobe({
  position = [0, 0, 0] as [number, number, number],
}: {
  position?: [number, number, number];
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 6.2], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 2, 4]} intensity={2.6} color="#ffe2cc" />
      <directionalLight position={[-6, -1, -3]} intensity={0.45} color="#00f0ff" />
      <Stars radius={60} depth={40} count={2200} factor={3} fade speed={0.4} />
      <group position={position}>
        <Planet />
      </group>
    </Canvas>
  );
}
