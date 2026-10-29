import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { latLngToVec, type Hangar, type Vehicle, type WeatherEvent } from "@/lib/ares-data";

const R = 2;
const MARS_RADIUS_KM = 3390;

function marsTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#e8d8cc"); grad.addColorStop(0.08, "#b8532a"); grad.addColorStop(0.5, "#a3431f"); grad.addColorStop(0.92, "#8a3a1c"); grad.addColorStop(1, "#e8d8cc");
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const rad = r() * 24 + 2;
    g.fillStyle = r() > 0.5 ? `rgba(60,20,8,${r() * 0.25})` : `rgba(230,140,90,${r() * 0.18})`;
    g.beginPath(); g.ellipse(r() * 1024, 40 + r() * 432, rad * 1.6, rad, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Storm({ w }: { w: WeatherEvent }) {
  const pos = useMemo(() => new THREE.Vector3(...latLngToVec(w.lat, w.lng, R + 0.01)), [w]);
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize()), [pos]);
  const size = (Number(w.radius_km) / MARS_RADIUS_KM) * R;
  return (
    <mesh position={pos} quaternion={quat}>
      <circleGeometry args={[size, 48]} />
      <meshBasicMaterial color="#ffb020" transparent opacity={0.15 + w.severity * 0.07} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export default function RadarGlobe({ vehicles, hangars, weather, selected, onSelect }: {
  vehicles: Vehicle[]; hangars: Hangar[]; weather: WeatherEvent[]; selected?: string | undefined; onSelect: (id: string) => void;
}) {
  const map = useMemo(marsTexture, []);
  return (
    <Canvas camera={{ position: [0, 1.5, 5.5], fov: 45 }} dpr={[1, 1.5]}>
      <color attach="background" args={["#07080c"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 2, 4]} intensity={2} color="#ffe2cc" />
      <Stars radius={60} depth={40} count={2000} factor={3} fade />
      <mesh><sphereGeometry args={[R, 96, 96]} /><meshStandardMaterial map={map} roughness={0.95} /></mesh>
      <mesh><sphereGeometry args={[R * 1.002, 36, 18]} /><meshBasicMaterial color="#00f0ff" wireframe transparent opacity={0.06} /></mesh>
      {weather.filter((w) => w.active).map((w) => <Storm key={w.id} w={w} />)}
      {hangars.map((h) => (
        <mesh key={h.id} position={latLngToVec(h.lat, h.lng, R + 0.01)}>
          <boxGeometry args={[0.06, 0.06, 0.06]} />
          <meshBasicMaterial color={h.storm_alert ? "#ffb020" : "#ff5a1f"} />
        </mesh>
      ))}
      {vehicles.map((v) => {
        const p = latLngToVec(v.lat, v.lng, R + 0.04 + (v.altitude_km / MARS_RADIUS_KM) * R * 4);
        const sel = v.id === selected;
        return (
          <group key={v.id} position={p}>
            <mesh onClick={(e) => { e.stopPropagation(); onSelect(v.id); }}>
              <sphereGeometry args={[sel ? 0.05 : 0.035, 12, 12]} />
              <meshBasicMaterial color={v.status === "storm_hold" ? "#ffb020" : "#00f0ff"} toneMapped={false} />
            </mesh>
            {sel && (
              <Html distanceFactor={6} center style={{ pointerEvents: "none" }}>
                <div className="whitespace-nowrap border border-telemetry/60 bg-background/80 px-2 py-1 font-mono text-[10px] text-telemetry">{v.callsign}</div>
              </Html>
            )}
          </group>
        );
      })}
      <OrbitControls enablePan={false} minDistance={3} maxDistance={9} autoRotate autoRotateSpeed={0.3} />
    </Canvas>
  );
}
