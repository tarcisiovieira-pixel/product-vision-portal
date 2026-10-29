import { Canvas } from "@react-three/fiber";
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from "@react-three/drei";
import { VehicleModel } from "./VehicleModel";
import type { Vehicle } from "@/lib/ares-data";

export default function HangarScene({ category }: { category: Vehicle["category"] }) {
  return (
    <Canvas camera={{ position: [4.5, 2.6, 5], fov: 40 }} dpr={[1, 1.5]} onCreated={({ gl }) => gl.domElement.parentElement?.setAttribute("data-scene-ready", "")}>
      <color attach="background" args={["#0a0b10"]} />
      <ambientLight intensity={0.3} />
      <spotLight position={[4, 8, 4]} angle={0.5} penumbra={0.6} intensity={60} color="#ffe2cc" />
      <directionalLight position={[-5, 2, -3]} intensity={0.8} color="#00f0ff" />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1.2} color="#ff7a40" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        <Lightformer intensity={0.8} color="#66e0ff" position={[5, 1, 1]} rotation-y={-Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>
      <VehicleModel category={category} />
      <ContactShadows position={[0, -0.85, 0]} opacity={0.6} scale={10} blur={2.4} />
      <Grid position={[0, -0.86, 0]} args={[20, 20]} cellColor="#3a2a22" sectionColor="#ff5a1f" fadeDistance={18} infiniteGrid />
      <OrbitControls enablePan={false} minDistance={3.5} maxDistance={11} autoRotate autoRotateSpeed={0.8} maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
