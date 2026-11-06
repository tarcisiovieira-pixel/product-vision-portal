import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, QuadraticBezierLine, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import { latLngToVec, type Hangar, type Vehicle, type WeatherEvent } from "@/lib/ares-data";

const R = 2;
const MARS_RADIUS_KM = 3389.5;

function marsTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#f0e4dc");
  grad.addColorStop(0.06, "#b8532a");
  grad.addColorStop(0.28, "#8f3718");
  grad.addColorStop(0.5, "#a3431f");
  grad.addColorStop(0.72, "#7d3015");
  grad.addColorStop(0.94, "#b8532a");
  grad.addColorStop(1, "#f0e4dc");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);

  // Calotas polares de gelo seco (CO2)
  g.fillStyle = "rgba(240, 248, 255, 0.85)";
  g.beginPath();
  g.ellipse(512, 16, 420, 26, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(512, 496, 380, 24, 0, 0, Math.PI * 2);
  g.fill();

  let s = 19;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // Relevo areográfico, cânions (Valles Marineris) e bacias de impacto
  for (let i = 0; i < 1100; i++) {
    const rad = r() * 26 + 3;
    g.fillStyle = r() > 0.45 ? `rgba(45,15,6,${r() * 0.28})` : `rgba(245,155,100,${r() * 0.19})`;
    g.beginPath();
    g.ellipse(r() * 1024, 40 + r() * 432, rad * 1.8, rad, (r() - 0.5) * 0.5, 0, Math.PI * 2);
    g.fill();
  }

  // Falha estilizada de Valles Marineris
  g.strokeStyle = "rgba(40, 10, 4, 0.4)";
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(320, 280);
  g.bezierCurveTo(400, 275, 480, 290, 560, 285);
  g.stroke();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function earthTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#081b33");
  grad.addColorStop(0.3, "#0d2b52");
  grad.addColorStop(0.7, "#0d2b52");
  grad.addColorStop(1, "#081b33");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);

  let s = 42;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    const x = r() * 1024;
    const y = 80 + r() * 350;
    const rad = r() * 26 + 6;
    g.fillStyle = r() > 0.4 ? "rgba(34, 110, 48, 0.45)" : "rgba(168, 140, 85, 0.4)";
    for (const ox of [-1024, 0, 1024]) {
      const rx = x + ox;
      if (rx + rad * 2 >= 0 && rx - rad * 2 <= 1024) {
        g.beginPath();
        g.ellipse(rx, y, rad * 1.5, rad, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // Calotas polares terrestres
  g.fillStyle = "rgba(240, 248, 255, 0.95)";
  g.beginPath();
  g.ellipse(512, 16, 512, 28, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(512, 496, 512, 28, 0, 0, Math.PI * 2);
  g.fill();

  // Nuvens atmosféricas semitransparentes
  g.fillStyle = "rgba(255, 255, 255, 0.35)";
  for (let i = 0; i < 200; i++) {
    const cx = r() * 1024;
    const cy = 60 + r() * 380;
    const w = r() * 50 + 20;
    const h = r() * 12 + 4;
    g.beginPath();
    g.ellipse(cx, cy, w, h, (r() - 0.5) * 0.4, 0, Math.PI * 2);
    g.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Corredor de Trajetória Interplanetária de Escape Hohmann (Marte -> Terra)
const HOHMANN_START = new THREE.Vector3(1.4, 1.3, 0.9);
const HOHMANN_MID = new THREE.Vector3(4.8, 3.2, -3.2);
const HOHMANN_END = new THREE.Vector3(8.5, 4.2, -7.8);
const HOHMANN_CURVE = new THREE.QuadraticBezierCurve3(HOHMANN_START, HOHMANN_MID, HOHMANN_END);

// ---------------------------------------------------------------------
// Sistema Planetário da Terra (Sol III) no Espaço Interplanetário
// ---------------------------------------------------------------------
function CelestialEarthSystem() {
  const map = useMemo(earthTexture, []);
  const moonGroup = useRef<THREE.Group>(null);
  const earthMesh = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (earthMesh.current) earthMesh.current.rotation.y += delta * 0.05;
    if (moonGroup.current) moonGroup.current.rotation.y += delta * 0.2;
  });

  return (
    <group position={[HOHMANN_END.x, HOHMANN_END.y, HOHMANN_END.z]}>
      {/* Globo Terrestre */}
      <mesh ref={earthMesh}>
        <sphereGeometry args={[0.75, 48, 48]} />
        <meshStandardMaterial map={map} roughness={0.7} metalness={0.1} />
      </mesh>
      {/* Atmosfera Azul Brilhante Rayleigh */}
      <mesh scale={1.05}>
        <sphereGeometry args={[0.75, 32, 32]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.25}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Rótulo HUD Interplanetário */}
      <GlobeLabel text="TERRA · 54,6M KM" color="#93c5fd" position={[0, 1.05, 0]} size={0.2} />

      {/* Lua Orbitando a Terra */}
      <mesh rotation={[Math.PI / 2, 0, 0.1]}>
        <ringGeometry args={[1.78, 1.82, 48]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
      <group ref={moonGroup}>
        <group position={[1.8, 0.2, 0]}>
          <mesh>
            <sphereGeometry args={[0.16, 24, 24]} />
            <meshStandardMaterial color="#c0c4cc" roughness={0.9} />
          </mesh>
          <GlobeLabel text="LUA" position={[0, 0.32, 0]} size={0.12} />
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------
// Trajetória de Escape Interplanetária Hohmann (Marte -> Terra)
// ---------------------------------------------------------------------
function InterplanetaryHohmannArc() {
  return (
    <group>
      <QuadraticBezierLine
        start={[HOHMANN_START.x, HOHMANN_START.y, HOHMANN_START.z]}
        mid={[HOHMANN_MID.x, HOHMANN_MID.y, HOHMANN_MID.z]}
        end={[HOHMANN_END.x, HOHMANN_END.y, HOHMANN_END.z]}
        color="#38bdf8"
        lineWidth={1.2}
        transparent
        opacity={0.5}
      />
      <group position={[HOHMANN_MID.x, HOHMANN_MID.y, HOHMANN_MID.z]}>
        <GlobeLabel text="ROTA HOHMANN" color="#22d3ee" position={[0, 0.2, 0]} size={0.13} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------
// Órbitas e Luas Marcianas: Fobos e Deimos
// ---------------------------------------------------------------------
function MartianMoons() {
  const phobosGroup = useRef<THREE.Group>(null);
  const deimosGroup = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (phobosGroup.current) phobosGroup.current.rotation.y += delta * 0.4;
    if (deimosGroup.current) deimosGroup.current.rotation.y += delta * 0.15;
  });

  return (
    <>
      {/* Órbita de Fobos (~2.9R) */}
      <mesh rotation={[Math.PI / 2, 0, 0.15]}>
        <ringGeometry args={[2.89, 2.91, 64]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
      <group ref={phobosGroup}>
        <group position={[2.9, 0.2, 0]}>
          <mesh>
            <dodecahedronGeometry args={[0.07, 1]} />
            <meshStandardMaterial color="#6b6965" roughness={0.9} metalness={0.2} />
          </mesh>
          <GlobeLabel text="FOBOS" color="#22d3ee" position={[0, 0.16, 0]} size={0.09} />
        </group>
      </group>

      {/* Órbita de Deimos (~3.8R) */}
      <mesh rotation={[Math.PI / 2, 0, -0.2]}>
        <ringGeometry args={[3.79, 3.81, 64]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.05} side={THREE.DoubleSide} />
      </mesh>
      <group ref={deimosGroup}>
        <group position={[-3.8, -0.3, 0]}>
          <mesh>
            <dodecahedronGeometry args={[0.045, 1]} />
            <meshStandardMaterial color="#827f7a" roughness={0.95} metalness={0.1} />
          </mesh>
          <GlobeLabel text="DEIMOS" color="#22d3ee" position={[0, 0.16, 0]} size={0.09} />
        </group>
      </group>
    </>
  );
}

// ---------------------------------------------------------------------
// Tempestade de Poeira em Vórtice 3D com Partículas
// ---------------------------------------------------------------------
function StormVortex({ w }: { w: WeatherEvent }) {
  const pos = useMemo(
    () => new THREE.Vector3(...latLngToVec(w.lat, w.lng, R + 0.02)),
    [w.lat, w.lng],
  );
  const quat = useMemo(
    () =>
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        pos.clone().normalize(),
      ),
    [pos],
  );
  const size = (Number(w.radius_km) / MARS_RADIUS_KM) * R;

  return (
    <group position={pos} quaternion={quat}>
      {/* Disco central semitransparente */}
      <mesh>
        <circleGeometry args={[size, 48]} />
        <meshBasicMaterial
          color="#ffb020"
          transparent
          opacity={0.18 + w.severity * 0.08}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Anel de fronteira da tempestade */}
      <mesh>
        <ringGeometry args={[size * 0.95, size, 48]} />
        <meshBasicMaterial color="#ff5a1f" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* Partículas de turbulência de poeira */}
      <Sparkles
        count={25 * w.severity}
        scale={[size * 1.5, size * 1.5, 0.4]}
        size={2 + w.severity}
        color="#ffaa33"
        speed={1.5 + w.severity * 0.5}
      />
    </group>
  );
}

// ---------------------------------------------------------------------
// Arcos de Rotas de Voo entre os Hangares
// ---------------------------------------------------------------------
function FlightRouteArcs({ hangars }: { hangars: Hangar[] }) {
  const routes = useMemo(() => {
    if (hangars.length < 2) return [];
    const list: Array<{
      start: [number, number, number];
      mid: [number, number, number];
      end: [number, number, number];
    }> = [];
    for (let i = 0; i < hangars.length - 1; i++) {
      const h1 = hangars[i];
      const h2 = hangars[i + 1];
      if (!h1 || !h2) continue;
      const p1 = new THREE.Vector3(...latLngToVec(h1.lat, h1.lng, R + 0.02));
      const p2 = new THREE.Vector3(...latLngToVec(h2.lat, h2.lng, R + 0.02));
      // Corredor de voo atmosférico entre hangares marcianos (baixa altitude geodésica)
      const mid = p1
        .clone()
        .add(p2)
        .multiplyScalar(0.5)
        .normalize()
        .multiplyScalar(R + 0.08);
      list.push({
        start: [p1.x, p1.y, p1.z],
        mid: [mid.x, mid.y, mid.z],
        end: [p2.x, p2.y, p2.z],
      });
    }
    return list;
  }, [hangars]);

  return (
    <>
      {routes.map((r, i) => (
        <QuadraticBezierLine
          key={i}
          start={r.start}
          mid={r.mid}
          end={r.end}
          color="#00f0ff"
          lineWidth={0.8}
          transparent
          opacity={0.35}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------
// Miniatura 3D Procedural da Nave (Carro VTOL, Foguete Starship ou Hauler)
// Coerente: Se estacionada/docada, propulsores estão frios e rotores descansam
// ---------------------------------------------------------------------
// Rótulo desenhado em textura, sempre voltado para a câmera. Substitui o Html do drei,
// que gerava erro do React ao desmontar a cena na troca de rota.
function GlobeLabel({
  text,
  color = "#a1a1aa",
  size,
  position,
}: {
  text: string;
  color?: string;
  size: number;
  position: [number, number, number];
}) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const g = canvas.getContext("2d");
    const font = "bold 40px monospace";
    if (g) g.font = font;
    const width = Math.ceil((g?.measureText?.(text)?.width ?? 200) + 24);
    canvas.width = width;
    canvas.height = 56;
    if (g) {
      g.font = font;
      g.fillStyle = color;
      g.textBaseline = "middle";
      g.fillText(text, 12, 28);
    }
    return { texture: new THREE.CanvasTexture(canvas), aspect: width / 56 };
  }, [text, color]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={position} scale={[size * aspect, size, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

// Faz as naves em voo se moverem: foguetes percorrem a rota Hohmann em loop e
// veículos atmosféricos circulam o planeta na própria latitude.
function FlightMotion({
  mode,
  offset,
  children,
}: {
  mode: "parked" | "orbit" | "hohmann";
  offset: number;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const progress = useRef(0.1 + offset * 0.6);

  useFrame((_, delta) => {
    const group = ref.current;
    if (!group) return;
    if (mode === "orbit") {
      group.rotation.y += Math.min(delta, 0.05) * 0.16;
    } else if (mode === "hohmann") {
      progress.current = (progress.current + Math.min(delta, 0.05) * 0.035) % 1;
      const point = HOHMANN_CURVE.getPoint(progress.current);
      group.position.copy(point).sub(HOHMANN_CURVE.getPoint(0.38));
    }
  });

  return <group ref={ref}>{children}</group>;
}

function GlobeCraftMesh({
  category,
  callsign,
  name,
  sel,
  isAirborne,
}: {
  category: Vehicle["category"];
  callsign?: string;
  name?: string;
  sel: boolean;
  isAirborne: boolean;
}) {
  const flameRef = useRef<THREE.Mesh>(null);
  const rotorRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (flameRef.current && isAirborne) {
      flameRef.current.scale.y = 1 + Math.sin(Date.now() * 0.04) * 0.3;
    }
    if (rotorRef.current && isAirborne) {
      rotorRef.current.rotation.y += delta * 25;
    }
  });

  const ident = `${callsign ?? ""} ${name ?? ""}`.toLowerCase();
  const isApex = ident.includes("apx") || ident.includes("apex") || ident.includes("phantom");
  const isValkyrie = ident.includes("valk") || ident.includes("vmt") || ident.includes("roadster");

  if (isApex) {
    // Miniatura Globe: Apex Phantom Hyper-VTOL (Linha VIP)
    return (
      <group scale={[0.08, 0.08, 0.08]}>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.7, 0.18, 1.3]} />
          <meshStandardMaterial color={sel ? "#00f0ff" : "#101217"} metalness={0.92} />
        </mesh>
        {/* Asas Delta Douradas */}
        {[-1, 1].map((dir, i) => (
          <mesh key={i} position={[dir * 0.5, 0.1, -0.1]}>
            <boxGeometry args={[0.4, 0.03, 0.8]} />
            <meshStandardMaterial color="#d4af37" metalness={0.95} />
          </mesh>
        ))}
        {/* Escape Iônico */}
        {isAirborne && (
          <mesh position={[0, 0.1, -0.75]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.12, 0.2, 8]} />
            <meshBasicMaterial color="#00f0ff" toneMapped={false} />
          </mesh>
        )}
      </group>
    );
  }

  if (isValkyrie) {
    // Miniatura Globe: Valkyrie Martian Roadster GT (Linha Super Sport)
    return (
      <group scale={[0.085, 0.085, 0.085]}>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.68, 0.16, 1.25]} />
          <meshStandardMaterial color={sel ? "#00f0ff" : "#ff5a1f"} metalness={0.88} />
        </mesh>
        {/* Aerofólio Traseiro */}
        <mesh position={[0, 0.26, -0.55]}>
          <boxGeometry args={[0.8, 0.02, 0.15]} />
          <meshStandardMaterial color="#141519" metalness={0.9} />
        </mesh>
        {/* Escape Plasma */}
        {isAirborne && (
          <mesh position={[0, 0.1, -0.7]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.1, 0.35, 8]} />
            <meshBasicMaterial color="#00f0ff" toneMapped={false} />
          </mesh>
        )}
      </group>
    );
  }

  if (category === "interplanetary_rocket") {
    return (
      <group scale={[0.07, 0.07, 0.07]} rotation={isAirborne ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
        {/* Foguete Cilíndrico em Aço Inox */}
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 1.4, 16]} />
          <meshStandardMaterial
            color={sel ? "#00f0ff" : "#f0f3f6"}
            metalness={0.95}
            roughness={0.15}
          />
        </mesh>
        {/* Ogiva Cônica */}
        <mesh position={[0, 1.3, 0]}>
          <coneGeometry args={[0.25, 0.5, 16]} />
          <meshStandardMaterial color="#f0f3f6" metalness={0.95} />
        </mesh>
        {/* Aletas Laranjas */}
        {[-1, 1].map((dir, i) => (
          <mesh key={i} position={[dir * 0.3, 0.1, 0]}>
            <boxGeometry args={[0.2, 0.4, 0.02]} />
            <meshStandardMaterial color="#ff5a1f" metalness={0.8} />
          </mesh>
        ))}
        {/* Chama Azul de Impulso - SOMENTE se estiver em voo ativo */}
        {isAirborne ? (
          <group position={[0, -0.6, 0]}>
            <mesh ref={flameRef} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.22, 1.0, 12, 1, true]} />
              <meshBasicMaterial color="#00f0ff" toneMapped={false} />
            </mesh>
            <pointLight position={[0, -0.3, 0]} color="#00f0ff" intensity={4} distance={2} />
          </group>
        ) : (
          /* Bocal de propulsão frio / pad de apoio */
          <mesh position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.12, 0.16, 0.1, 12]} />
            <meshStandardMaterial color="#2a2b30" metalness={0.9} />
          </mesh>
        )}
      </group>
    );
  }

  if (category === "space_truck") {
    return (
      <group scale={[0.08, 0.08, 0.08]}>
        {/* Cabine Laranja */}
        <mesh position={[0, 0.2, 0.3]}>
          <boxGeometry args={[0.6, 0.4, 0.5]} />
          <meshStandardMaterial color="#ff5a1f" metalness={0.8} />
        </mesh>
        {/* Tanque Cilíndrico */}
        <mesh position={[0, 0.25, -0.3]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.8, 12]} />
          <meshStandardMaterial color="#d4d0c8" metalness={0.85} />
        </mesh>
        {/* Brilho Roxo de Plasma - apenas se em deslocamento */}
        {isAirborne && (
          <mesh position={[0, 0.2, -0.8]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.15, 0.2, 8]} />
            <meshBasicMaterial color="#a855f7" toneMapped={false} />
          </mesh>
        )}
      </group>
    );
  }

  // Carro Voador VTOL (CyberCab)
  return (
    <group scale={[0.085, 0.085, 0.085]}>
      {/* Chassi Aerodinâmico */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.65, 0.2, 1.2]} />
        <meshStandardMaterial
          color={sel ? "#00f0ff" : "#d4d0c8"}
          metalness={0.85}
          roughness={0.2}
        />
      </mesh>
      {/* Cabine Translúcida Ciano */}
      <mesh position={[0, 0.22, 0.05]}>
        <boxGeometry args={[0.45, 0.18, 0.6]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.85} />
      </mesh>
      {/* Rotores Basculantes Tilt-Rotor */}
      <group ref={rotorRef} position={[0, 0.15, 0]}>
        {[-0.45, 0.45].map((x, i) => (
          <mesh key={i} position={[x, 0, 0]}>
            <cylinderGeometry args={[0.22, 0.22, 0.02, 8]} />
            <meshBasicMaterial
              color="#00f0ff"
              wireframe
              transparent
              opacity={isAirborne ? 0.7 : 0.25}
            />
          </mesh>
        ))}
      </group>
      {/* Propulsor de Cauda - apenas quando em voo */}
      {isAirborne && (
        <mesh position={[0, 0.1, -0.65]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.1, 0.3, 8]} />
          <meshBasicMaterial color="#00f0ff" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------
// Componente Principal RadarGlobe
// ---------------------------------------------------------------------
export default function RadarGlobe({
  vehicles,
  hangars,
  weather,
  selected,
  onSelect,
  onChaseVehicle,
  onInspectHangar,
  onOpenMaintenance,
}: {
  vehicles: Vehicle[];
  hangars: Hangar[];
  weather: WeatherEvent[];
  selected?: string | undefined;
  onSelect: (id: string) => void;
  onChaseVehicle?: (v: Vehicle) => void;
  onInspectHangar?: (v: Vehicle) => void;
  onOpenMaintenance?: (v: Vehicle) => void;
}) {
  const map = useMemo(marsTexture, []);

  return (
    <Canvas camera={{ position: [0, 1.8, 6.2], fov: 42 }} dpr={[1, 1.5]}>
      <color attach="background" args={["#050609"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 3, 5]} intensity={2.2} color="#ffe2cc" />
      <directionalLight position={[-5, -2, -3]} intensity={0.4} color="#00f0ff" />
      <Stars radius={70} depth={50} count={3000} factor={4} fade />

      {/* Luas Fobos e Deimos */}
      <MartianMoons />

      {/* Globo do Planeta Marte */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[R, 96, 96]} />
        <meshStandardMaterial map={map} roughness={0.92} metalness={0.08} />
      </mesh>

      {/* Grid areográfico orbital holográfico */}
      <mesh>
        <sphereGeometry args={[R * 1.002, 36, 18]} />
        <meshBasicMaterial color="#00f0ff" wireframe transparent opacity={0.07} />
      </mesh>

      {/* Brilho sutil da atmosfera marciana de CO2 */}
      <mesh scale={1.025}>
        <sphereGeometry args={[R, 64, 64]} />
        <meshBasicMaterial
          color="#ff5a1f"
          transparent
          opacity={0.12}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Arcos 3D de rotas geodésicas atmosféricas */}
      <FlightRouteArcs hangars={hangars} />

      {/* Sistema Planetário Terrestre e Corredor Interplanetário Hohmann */}
      <CelestialEarthSystem />
      <InterplanetaryHohmannArc />

      {/* Tempestades de poeira ativas */}
      {weather
        .filter((w) => w.active)
        .map((w) => (
          <StormVortex key={w.id} w={w} />
        ))}

      {/* Hangares e Portos Espaciais com Cúpulas de Barreira Eletromagnética */}
      {hangars.map((h) => {
        const pos = latLngToVec(h.lat, h.lng, R + 0.015);
        return (
          <group key={h.id} position={pos}>
            {/* Edificação Central do Hangar */}
            <mesh>
              <boxGeometry args={[0.07, 0.07, 0.07]} />
              <meshStandardMaterial
                color={h.storm_alert ? "#ffb020" : "#ff5a1f"}
                emissive={h.storm_alert ? "#ffb020" : "#ff5a1f"}
                emissiveIntensity={0.8}
              />
            </mesh>
            {/* Cúpula de Barreira Eletromagnética contra Tempestades de Areia */}
            <mesh scale={h.storm_alert ? 1.3 : 1.0}>
              <sphereGeometry args={[0.075, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshBasicMaterial
                color={h.storm_alert ? "#ffb020" : "#00f0ff"}
                transparent
                opacity={h.storm_alert ? 0.38 : 0.18}
                side={THREE.DoubleSide}
              />
            </mesh>
            <GlobeLabel text={h.code} position={[0, 0.13, 0]} size={0.08} />
          </group>
        );
      })}

      {/* Veículos em Tempo Real com Status Coerente Físico e Operacional */}
      {vehicles.map((v, index) => {
        const isAirborne = v.status === "in_flight";
        const sel = v.id === selected;

        let p: [number, number, number];
        let quat: THREE.Quaternion;

        if (v.category === "interplanetary_rocket" && isAirborne) {
          // Trajetória de Escape Interplanetária para a Terra (Hohmann Transfer)
          const tPos = 0.38;
          const curvePt = HOHMANN_CURVE.getPoint(tPos);
          p = [curvePt.x, curvePt.y, curvePt.z];
          const tangent = HOHMANN_CURVE.getTangent(tPos).normalize();
          const up = new THREE.Vector3(0, 1, 0);
          const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
          const correctedUp = new THREE.Vector3().crossVectors(tangent, right).normalize();
          const matrix = new THREE.Matrix4().makeBasis(right, correctedUp, tangent);
          quat = new THREE.Quaternion().setFromRotationMatrix(matrix);
        } else {
          const altitudeOffset = isAirborne
            ? (Math.max(0.1, v.altitude_km) / MARS_RADIUS_KM) * R * 4
            : 0.012;
          p = latLngToVec(v.lat, v.lng, R + 0.02 + altitudeOffset);
          const normal = new THREE.Vector3(...p).normalize();

          if (isAirborne) {
            // Orientação de voo atmosférico alinhada à tangente da rota
            const north = new THREE.Vector3(0, 1, 0);
            const east = new THREE.Vector3().crossVectors(north, normal).normalize();
            const heading = east
              .clone()
              .multiplyScalar(0.85)
              .add(north.clone().multiplyScalar(0.4))
              .projectOnPlane(normal)
              .normalize();
            const right = new THREE.Vector3().crossVectors(normal, heading).normalize();
            const matrix = new THREE.Matrix4().makeBasis(right, normal, heading);
            quat = new THREE.Quaternion().setFromRotationMatrix(matrix);
          } else {
            quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
          }
        }

        const assignedHangar = hangars.find((h) => h.id === v.hangar_id);

        const motion = !isAirborne
          ? "parked"
          : v.category === "interplanetary_rocket"
            ? "hohmann"
            : "orbit";

        return (
          <FlightMotion key={v.id} mode={motion} offset={(index % 4) / 4}>
            <group position={p} quaternion={quat}>
              {/* Anel Pulsante de Seleção / Rastreamento */}
              {sel && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.12, 0.16, 24]} />
                  <meshBasicMaterial
                    color="#00f0ff"
                    side={THREE.DoubleSide}
                    transparent
                    opacity={0.8}
                  />
                </mesh>
              )}

              {/* Objeto 3D Interativo do Veículo (Carro VTOL, Foguete ou Hauler) */}
              <group
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(v.id);
                }}
              >
                <GlobeCraftMesh
                  category={v.category}
                  callsign={v.callsign}
                  name={v.name}
                  sel={sel}
                  isAirborne={isAirborne}
                />
              </group>
            </group>
          </FlightMotion>
        );
      })}

      <OrbitControls
        enablePan={false}
        minDistance={2.8}
        maxDistance={10}
        autoRotate={!selected}
        autoRotateSpeed={0.2}
      />
    </Canvas>
  );
}
