import { Canvas } from "@react-three/fiber";
import {
  Float,
  ContactShadows,
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import { VehicleModel } from "./VehicleModel";
import type { Vehicle } from "@/lib/ares-data";

export default function HangarScene({
  category,
  callsign,
  name,
  selectedHotspot,
  onSelectHotspot,
  showHotspots = false,
}: {
  category: Vehicle["category"];
  callsign?: string | undefined;
  name?: string | undefined;
  selectedHotspot?: string | null | undefined;
  onSelectHotspot?: ((hotspotId: string) => void) | undefined;
  showHotspots?: boolean | undefined;
}) {
  return (
    <Canvas
      camera={{ position: [4.5, 2.6, 5], fov: 40 }}
      dpr={[1, 1.5]}
      onCreated={({ gl }) => gl.domElement.parentElement?.setAttribute("data-scene-ready", "")}
    >
      <color attach="background" args={["#0a0b10"]} />
      <ambientLight intensity={0.4} />
      <spotLight position={[4, 8, 4]} angle={0.5} penumbra={0.6} intensity={70} color="#ffe2cc" />
      <directionalLight position={[-5, 2, -3]} intensity={1.1} color="#00f0ff" />
      <directionalLight position={[0, -2, 0]} intensity={0.2} color="#ff5a1f" />

      <Environment resolution={128}>
        <Lightformer
          intensity={2}
          position={[0, 5, 0]}
          scale={[10, 10, 1]}
          rotation-x={Math.PI / 2}
        />
        <Lightformer
          intensity={1.5}
          color="#ff7a40"
          position={[-5, 1, -1]}
          rotation-y={Math.PI / 2}
          scale={[20, 1, 1]}
        />
        <Lightformer
          intensity={1.0}
          color="#66e0ff"
          position={[5, 1, 1]}
          rotation-y={-Math.PI / 2}
          scale={[20, 1, 1]}
        />
      </Environment>

      {/* Plataforma de Pouso Hexagonal / Pad de Estacionamento */}
      <group position={[0, -0.84, 0]}>
        {/* Anel Externo Holográfico do Pad */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.7, 2.76, 36]} />
          <meshBasicMaterial color="#00f0ff" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
        {/* Círculo Interno com Linhas Amarelas de Alerta */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.8, 1.84, 36]} />
          <meshBasicMaterial color="#ff5a1f" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Pairando sobre o pad: com hotspot selecionado fica firme para leitura. */}
      <Float
        speed={selectedHotspot ? 0 : 1.8}
        rotationIntensity={0.12}
        floatIntensity={0.45}
        floatingRange={[0, 0.22]}
      >
        <VehicleModel
          category={category}
          callsign={callsign}
          name={name}
          selectedHotspot={selectedHotspot}
          onSelectHotspot={onSelectHotspot}
          showHotspots={showHotspots}
        />
      </Float>

      <ContactShadows position={[0, -0.85, 0]} opacity={0.7} scale={11} blur={2.2} />
      <Grid
        position={[0, -0.86, 0]}
        args={[20, 20]}
        cellColor="#2a2220"
        sectionColor="#ff5a1f"
        fadeDistance={18}
        infiniteGrid
      />
      <OrbitControls
        enablePan={false}
        minDistance={3.0}
        maxDistance={12}
        autoRotate={!selectedHotspot}
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 2.05}
      />
    </Canvas>
  );
}
