import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { inferModelKey } from "@shared/fleet";
import type { Vehicle } from "@/lib/ares-data";

const HULL_COLOR = "#d4d0c8";
const TITANIUM_DARK = "#2a2b30";
const ACCENT_ORANGE = "#ff5a1f";
const GLOW_CYAN = "#00f0ff";
const PLASMA_PURPLE = "#a855f7";
const HEAT_SHIELD_BLACK = "#151619";
const TITANIUM_GOLD = "#d4af37";
const OBSIDIAN_BLACK = "#101217";

interface VehicleModelProps {
  category: Vehicle["category"];
  modelKey?: string | null | undefined;
  callsign?: string | undefined;
  name?: string | undefined;
  selectedHotspot?: string | null | undefined;
  onSelectHotspot?: ((hotspotId: string) => void) | undefined;
  showHotspots?: boolean | undefined;
}

// ---------------------------------------------------------------------
// Componente de Hotspot 3D Clicável
// ---------------------------------------------------------------------
function Hotspot({
  position,
  id,
  name,
  selected,
  onSelect,
}: {
  position: [number, number, number];
  id: string;
  name: string;
  selected: boolean;
  onSelect?: ((id: string) => void) | undefined;
}) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 2;
      const s = 1 + Math.sin(Date.now() * 0.005) * 0.15;
      ringRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group position={position}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(id);
        }}
      >
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial
          color={selected ? "#00f0ff" : "#ff5a1f"}
          emissive={selected ? "#00f0ff" : "#ff5a1f"}
          emissiveIntensity={selected ? 2.5 : 1.2}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.24, 24]} />
        <meshBasicMaterial
          color={selected ? "#00f0ff" : "#ffb020"}
          side={THREE.DoubleSide}
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------
// 1. Apex Phantom Hyper-VTOL (Linha Executiva VIP Premium)
// Design hiperaerodinâmico coeso, chassi em cunha, cúpula fumê e detalhes ouro-titânio
// ---------------------------------------------------------------------
function ApexPhantomVtol({
  selectedHotspot,
  onSelectHotspot,
  showHotspots,
}: Omit<VehicleModelProps, "category" | "modelKey">) {
  const turbineRefs = useRef<THREE.Group[]>([]);
  const rearGlow = useRef<THREE.PointLight>(null);

  useFrame((_, delta) => {
    turbineRefs.current.forEach((t) => {
      if (t) t.rotation.y += Math.min(delta, 0.05) * 32;
    });
    if (rearGlow.current) {
      rearGlow.current.intensity = 2.0 + Math.sin(Date.now() * 0.008) * 0.4;
    }
  });

  return (
    <group position={[0, -0.15, 0]}>
      {/* 1. CHASSI PRINCIPAL MONOCOQUE EM FIBRA DE CARBONO PRETO ÔNIX */}
      <mesh castShadow position={[0, 0.15, 0]}>
        <boxGeometry args={[1.45, 0.28, 2.8]} />
        <meshStandardMaterial color={OBSIDIAN_BLACK} metalness={0.92} roughness={0.18} />
      </mesh>

      {/* 2. CAPÔ FRONTAL EM CUNHA CHANFRADA (Nariz aerodinâmico esportivo) */}
      <mesh position={[0, 0.07, 1.3]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[1.32, 0.2, 0.95]} />
        <meshStandardMaterial color="#141720" metalness={0.94} roughness={0.16} />
      </mesh>

      {/* 3. SPLITTER DIANTEIRO EM CARBONO & FAROL LASER DE HORIZONTE */}
      <group position={[0, -0.05, 1.78]}>
        <mesh>
          <boxGeometry args={[1.4, 0.04, 0.32]} />
          <meshStandardMaterial color="#08090b" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.025, 0.15]}>
          <boxGeometry args={[1.2, 0.02, 0.03]} />
          <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
        </mesh>
      </group>

      {/* 4. CANÓPEA AERODINÂMICA EM VIDRO DE QUARTZO IONIZADO ESCURECIDO */}
      <group position={[0, 0.34, 0.15]}>
        <mesh position={[0, 0, 0]} rotation={[0.07, 0, 0]}>
          <boxGeometry args={[0.92, 0.24, 1.4]} />
          <meshPhysicalMaterial
            color="#081826"
            metalness={0.2}
            roughness={0.05}
            transmission={0.8}
            thickness={0.5}
            reflectivity={0.9}
          />
        </mesh>
        {/* Teto central em carbono */}
        <mesh position={[0, 0.13, -0.1]}>
          <boxGeometry args={[0.72, 0.02, 1.05]} />
          <meshStandardMaterial color={OBSIDIAN_BLACK} metalness={0.92} />
        </mesh>
      </group>

      {/* 5. FRISOS LATERAIS LUXUOSOS EM OURO-TITÂNIO (GOLD BLADES) */}
      {[-0.74, 0.74].map((x, i) => (
        <group key={i} position={[x, 0.15, 0]}>
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.035, 0.05, 2.2]} />
            <meshStandardMaterial color={TITANIUM_GOLD} metalness={0.96} roughness={0.12} />
          </mesh>
          {/* Tomada de ar lateral chanfrada */}
          <mesh
            position={[-Math.sign(x) * 0.08, -0.05, -0.4]}
            rotation={[0, Math.sign(x) * 0.2, 0]}
          >
            <boxGeometry args={[0.12, 0.12, 0.7]} />
            <meshStandardMaterial color="#08090b" roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* 6. TURBINAS DE LEVITAÇÃO MAGLEV EMBUTIDAS COM ANÉIS DOURADOS */}
      {[-1.15, 1.15].map((x, i) => (
        <group key={i} position={[x, 0.12, -0.15]}>
          <mesh position={[-Math.sign(x) * 0.18, 0, 0]}>
            <boxGeometry args={[0.35, 0.06, 1.1]} />
            <meshStandardMaterial color={OBSIDIAN_BLACK} metalness={0.9} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.42, 0.045, 16, 32]} />
            <meshStandardMaterial color={TITANIUM_GOLD} metalness={0.95} roughness={0.15} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.38, 0.015, 8, 32]} />
            <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
          </mesh>
          <group
            ref={(el) => {
              if (el) turbineRefs.current[i] = el;
            }}
          >
            {[0, Math.PI / 3, (Math.PI * 2) / 3].map((ang, idx) => (
              <mesh key={idx} rotation={[0, ang, 0]}>
                <boxGeometry args={[0.74, 0.015, 0.06]} />
                <meshStandardMaterial color="#1c1d24" metalness={0.8} />
              </mesh>
            ))}
          </group>
        </group>
      ))}

      {/* 7. WINGLETS TRASEIROS AERODINÂMICOS EM OURO-TITÂNIO */}
      {[-0.78, 0.78].map((x, i) => (
        <mesh key={i} position={[x, 0.32, -1.15]} rotation={[0, 0, Math.sign(x) * -0.22]}>
          <boxGeometry args={[0.04, 0.34, 0.65]} />
          <meshStandardMaterial color={TITANIUM_GOLD} metalness={0.95} roughness={0.15} />
        </mesh>
      ))}

      {/* 8. DIFUSOR TRASEIRO & DUPLO ESCAPAMENTO IÔNICO */}
      <group position={[0, 0.12, -1.45]}>
        <mesh position={[0, -0.08, 0]}>
          <boxGeometry args={[1.2, 0.05, 0.32]} />
          <meshStandardMaterial color="#08090b" roughness={0.7} />
        </mesh>
        {[-0.3, 0.3].map((x, i) => (
          <mesh key={i} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.15, 0.18, 20]} />
            <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
          </mesh>
        ))}
        <pointLight
          ref={rearGlow}
          position={[0, 0, -0.3]}
          color={GLOW_CYAN}
          intensity={2.2}
          distance={3}
        />
      </group>

      {/* 9. PATINS MAGNÉTICOS DE SOLO */}
      {[-0.6, 0.6].map((x, i) => (
        <mesh key={i} position={[x, -0.05, 0]}>
          <boxGeometry args={[0.08, 0.04, 2.4]} />
          <meshStandardMaterial color={TITANIUM_DARK} metalness={0.9} />
        </mesh>
      ))}

      {/* Hotspots de Manutenção */}
      {showHotspots && (
        <>
          <Hotspot
            position={[0, 0.45, 0.1]}
            id="o2"
            name="Cabine Pressurizada VIP & Climatização"
            selected={selectedHotspot === "o2"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0.05, 0.4]}
            id="battery"
            name="Células Ultracapacitoras Graphene-Platinum"
            selected={selectedHotspot === "battery"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0.15, -1.5]}
            id="thruster"
            name="Bipulsor Iônico Supersônico"
            selected={selectedHotspot === "thruster"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0.1, 1.7]}
            id="dust"
            name="Filtro Eletrostático de Rególito Fino"
            selected={selectedHotspot === "dust"}
            onSelect={onSelectHotspot}
          />
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------
// 2. Valkyrie Martian Roadster GT (Linha Super Sport GT)
// Hiperesportivo de alta velocidade, spoiler traseiro tipo swan-neck e acabamento Laranja Vulcânico
// ---------------------------------------------------------------------
function ValkyrieRoadsterGt({
  selectedHotspot,
  onSelectHotspot,
  showHotspots,
}: Omit<VehicleModelProps, "category" | "modelKey">) {
  const rotorRefs = useRef<THREE.Group[]>([]);
  const flameRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    rotorRefs.current.forEach((r) => {
      if (r) r.rotation.y += Math.min(delta, 0.05) * 40;
    });
    if (flameRef.current) {
      flameRef.current.scale.y = 1 + Math.sin(Date.now() * 0.04) * 0.25;
    }
  });

  const rotorPositions: [number, number, number][] = [
    [1.3, 0.12, 0.95],
    [-1.3, 0.12, 0.95],
    [1.3, 0.12, -0.95],
    [-1.3, 0.12, -0.95],
  ];

  return (
    <group position={[0, -0.15, 0]}>
      {/* Chassi aerodinâmico hiperesportivo em Laranja Vulcânico ARES */}
      <mesh castShadow position={[0, 0.12, 0]}>
        <boxGeometry args={[1.4, 0.3, 2.7]} />
        <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.88} roughness={0.2} />
      </mesh>

      {/* Capô dianteiro em cunha afilada com faixa central preta */}
      <mesh position={[0, 0.05, 1.25]} rotation={[-0.14, 0, 0]}>
        <boxGeometry args={[1.28, 0.18, 0.9]} />
        <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.88} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.16, 0.4]}>
        <boxGeometry args={[0.32, 0.02, 2.2]} />
        <meshStandardMaterial color="#141519" roughness={0.8} />
      </mesh>

      {/* Splitter dianteiro em fibra de carbono com farol laser */}
      <group position={[0, -0.06, 1.7]}>
        <mesh>
          <boxGeometry args={[1.42, 0.04, 0.32]} />
          <meshStandardMaterial color="#141519" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.025, 0.15]}>
          <boxGeometry args={[1.18, 0.02, 0.03]} />
          <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
        </mesh>
      </group>

      {/* Cockpit de perfil baixo em vidro fumê escuro */}
      <mesh position={[0, 0.32, 0.15]} rotation={[0.06, 0, 0]}>
        <boxGeometry args={[0.88, 0.22, 1.2]} />
        <meshPhysicalMaterial
          color="#062024"
          metalness={0.2}
          roughness={0.06}
          transmission={0.8}
          thickness={0.4}
        />
      </mesh>

      {/* Aerofólio Traseiro Ativo GT com pilares tipo pescoço de cisne (Swan-Neck) */}
      <group position={[0, 0.42, -1.25]}>
        <mesh rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[1.6, 0.035, 0.32]} />
          <meshStandardMaterial color="#141519" metalness={0.85} roughness={0.3} />
        </mesh>
        {[-0.45, 0.45].map((x, i) => (
          <mesh key={i} position={[x, -0.18, 0]}>
            <boxGeometry args={[0.035, 0.38, 0.06]} />
            <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.9} />
          </mesh>
        ))}
      </group>

      {/* 4 Rotores Basculantes Tilt-Rotor com aros esportivos laranja */}
      {rotorPositions.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.42, 0.04, 16, 28]} />
            <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.85} roughness={0.25} />
          </mesh>
          <group
            ref={(el) => {
              if (el) rotorRefs.current[i] = el;
            }}
          >
            <mesh>
              <boxGeometry args={[0.78, 0.015, 0.06]} />
              <meshStandardMaterial color="#1c1d22" roughness={0.7} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[0.78, 0.015, 0.06]} />
              <meshStandardMaterial color="#1c1d22" roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.03, 0]}>
              <coneGeometry args={[0.07, 0.1, 16]} />
              <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Naceles duplas de pós-combustão com chama de plasma */}
      <group position={[0, 0.08, -1.4]}>
        {[-0.28, 0.28].map((x, i) => (
          <group key={i} position={[x, 0, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.13, 0.18, 0.22, 20]} />
              <meshStandardMaterial color="#141519" metalness={0.9} />
            </mesh>
            <mesh position={[0, 0, -0.16]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.1, 0.32, 16, 1, true]} />
              <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Hotspots de Manutenção */}
      {showHotspots && (
        <>
          <Hotspot
            position={[0, 0.4, 0.2]}
            id="o2"
            name="Suporte Atmosférico Cockpit Sport"
            selected={selectedHotspot === "o2"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0.05, 0.4]}
            id="battery"
            name="Células Graphene Racing de Alta Descarga"
            selected={selectedHotspot === "battery"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0.1, -1.45]}
            id="thruster"
            name="Pós-Combustores Plasma Twin-Vector"
            selected={selectedHotspot === "thruster"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0.05, 1.6]}
            id="dust"
            name="Admissão Ativa Ram-Air & Filtro Sílica"
            selected={selectedHotspot === "dust"}
            onSelect={onSelectHotspot}
          />
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------
// 3. CyberCab VTOL Sport (Linha Sport com Widebody & Aletas Altas)
// ---------------------------------------------------------------------
function CyberCabVtolSport({
  selectedHotspot,
  onSelectHotspot,
  showHotspots,
}: Omit<VehicleModelProps, "category" | "modelKey">) {
  const rotorRefs = useRef<THREE.Group[]>([]);
  const glowLightRef = useRef<THREE.PointLight>(null);

  useFrame((_, delta) => {
    rotorRefs.current.forEach((r) => {
      if (r) r.rotation.y += Math.min(delta, 0.05) * 32;
    });
    if (glowLightRef.current) {
      glowLightRef.current.intensity = 2.0 + Math.sin(Date.now() * 0.01) * 0.5;
    }
  });

  const rotorPositions: [number, number, number][] = [
    [1.4, 0.15, 1.1],
    [-1.4, 0.15, 1.1],
    [1.4, 0.15, -1.1],
    [-1.4, 0.15, -1.1],
  ];

  return (
    <group position={[0, -0.1, 0]}>
      {/* Fuselagem angular principal com acabamento titânio escuro */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[1.36, 0.66, 2.85]} />
        <meshStandardMaterial color="#2d3036" metalness={0.88} roughness={0.2} />
      </mesh>

      {/* Nariz chanfrado com difusor dianteiro laranja */}
      <mesh position={[0, -0.06, 1.68]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[1.15, 0.44, 0.95]} />
        <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Tomada de ar de teto (Roof Scoop) */}
      <mesh position={[0, 0.58, -0.2]}>
        <boxGeometry args={[0.3, 0.12, 0.6]} />
        <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.85} />
      </mesh>

      {/* Cockpit com canópea azul ciano espelhada */}
      <mesh position={[0, 0.42, 0.4]}>
        <sphereGeometry args={[0.56, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#00f0ff"
          metalness={0.3}
          roughness={0.08}
          transmission={0.7}
          thickness={0.5}
        />
      </mesh>

      {/* Aletas traseiras duplas aerodinâmicas ampliadas */}
      <mesh position={[0.7, 0.48, -1.3]} rotation={[0, 0, 0.28]}>
        <boxGeometry args={[0.08, 0.72, 0.9]} />
        <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[-0.7, 0.48, -1.3]} rotation={[0, 0, -0.28]}>
        <boxGeometry args={[0.08, 0.72, 0.9]} />
        <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.8} roughness={0.3} />
      </mesh>

      {/* 4 Pods Basculantes com Rotores */}
      {rotorPositions.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.48, 0.06, 16, 32]} />
            <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.44, 0.015, 8, 32]} />
            <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
          </mesh>
          <group
            ref={(el) => {
              if (el) rotorRefs.current[i] = el;
            }}
          >
            <mesh>
              <boxGeometry args={[0.9, 0.02, 0.08]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[0.9, 0.02, 0.08]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.04, 0]}>
              <coneGeometry args={[0.08, 0.12, 16]} />
              <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Propulsor de cauda duplo esportivo */}
      <group position={[0, 0, -1.45]}>
        {[-0.2, 0.2].map((x, i) => (
          <mesh key={i} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.18, 0.16, 20]} />
            <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
          </mesh>
        ))}
        <pointLight
          ref={glowLightRef}
          position={[0, 0, -0.4]}
          color={GLOW_CYAN}
          intensity={2.2}
          distance={3}
        />
      </group>

      {/* Hotspots de Manutenção */}
      {showHotspots && (
        <>
          <Hotspot
            position={[0, 0.45, 0]}
            id="o2"
            name="Filtro e Pressurização O₂"
            selected={selectedHotspot === "o2"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, -0.3, 0.3]}
            id="battery"
            name="Células de Bateria de Grafeno"
            selected={selectedHotspot === "battery"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0, -1.5]}
            id="thruster"
            name="Impulsor Vetorial de Cauda"
            selected={selectedHotspot === "thruster"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0.1, 1.7]}
            id="dust"
            name="Filtro Ciclônico de Sílica"
            selected={selectedHotspot === "dust"}
            onSelect={onSelectHotspot}
          />
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------
// 4. CyberCab VTOL X2 (Carro Voador Standard Commuter)
// ---------------------------------------------------------------------
function CyberCabVtol({
  selectedHotspot,
  onSelectHotspot,
  showHotspots,
}: Omit<VehicleModelProps, "category" | "modelKey">) {
  const rotorRefs = useRef<THREE.Group[]>([]);
  const glowLightRef = useRef<THREE.PointLight>(null);

  useFrame((_, delta) => {
    rotorRefs.current.forEach((r) => {
      if (r) r.rotation.y += Math.min(delta, 0.05) * 28;
    });
    if (glowLightRef.current) {
      glowLightRef.current.intensity = 1.8 + Math.sin(Date.now() * 0.008) * 0.4;
    }
  });

  const rotorPositions: [number, number, number][] = [
    [1.4, 0.15, 1.1],
    [-1.4, 0.15, 1.1],
    [1.4, 0.15, -1.1],
    [-1.4, 0.15, -1.1],
  ];

  return (
    <group position={[0, -0.1, 0]}>
      {/* Fuselagem angular principal */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[1.3, 0.65, 2.8]} />
        <meshStandardMaterial color={HULL_COLOR} metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Nariz chanfrado aerodinâmico */}
      <mesh position={[0, -0.05, 1.65]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[1.1, 0.45, 0.9]} />
        <meshStandardMaterial color={TITANIUM_DARK} metalness={0.9} roughness={0.3} />
      </mesh>

      {/* Cockpit com canópea translúcida pressurizada */}
      <mesh position={[0, 0.42, 0.4]}>
        <sphereGeometry args={[0.56, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial
          color="#06121e"
          metalness={0.1}
          roughness={0.05}
          transmission={0.85}
          thickness={0.5}
          reflectivity={0.9}
        />
      </mesh>

      {/* Aletas traseiras */}
      <mesh position={[0.65, 0.4, -1.3]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.08, 0.6, 0.8]} />
        <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[-0.65, 0.4, -1.3]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.08, 0.6, 0.8]} />
        <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Trem de pouso magnético / patins */}
      {[-0.55, 0.55].map((x, i) => (
        <group key={i} position={[x, -0.42, 0]}>
          <mesh>
            <boxGeometry args={[0.08, 0.08, 2.6]} />
            <meshStandardMaterial color={TITANIUM_DARK} metalness={0.9} roughness={0.4} />
          </mesh>
        </group>
      ))}

      {/* 4 Pods Basculantes com Rotores Ciano */}
      {rotorPositions.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh position={[-x * 0.35, 0, 0]}>
            <boxGeometry args={[Math.abs(x) * 0.7, 0.1, 0.2]} />
            <meshStandardMaterial color={TITANIUM_DARK} metalness={0.8} roughness={0.4} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.48, 0.06, 16, 32]} />
            <meshStandardMaterial color={HULL_COLOR} metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.44, 0.015, 8, 32]} />
            <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
          </mesh>
          <group
            ref={(el) => {
              if (el) rotorRefs.current[i] = el;
            }}
          >
            <mesh>
              <boxGeometry args={[0.9, 0.02, 0.08]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[0.9, 0.02, 0.08]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.04, 0]}>
              <coneGeometry args={[0.08, 0.12, 16]} />
              <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.7} />
            </mesh>
          </group>
          <pointLight color={GLOW_CYAN} intensity={0.8} distance={2.2} />
        </group>
      ))}

      {/* Propulsor de cauda linear */}
      <mesh position={[0, 0, -1.42]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.15, 24]} />
        <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
      </mesh>
      <pointLight
        ref={glowLightRef}
        position={[0, 0, -1.6]}
        color={GLOW_CYAN}
        intensity={1.8}
        distance={3}
      />

      {/* Faixas luminosas decorativas da fuselagem */}
      <mesh position={[0, 0.34, 1.4]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.8, 0.03, 0.05]} />
        <meshBasicMaterial color={GLOW_CYAN} toneMapped={false} />
      </mesh>

      {/* Hotspots de Manutenção */}
      {showHotspots && (
        <>
          <Hotspot
            position={[0, 0.45, 0]}
            id="o2"
            name="Filtro e Pressurização O₂"
            selected={selectedHotspot === "o2"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, -0.3, 0.3]}
            id="battery"
            name="Células de Bateria de Grafeno"
            selected={selectedHotspot === "battery"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0, -1.5]}
            id="thruster"
            name="Impulsor Vetorial de Cauda"
            selected={selectedHotspot === "thruster"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0.1, 1.7]}
            id="dust"
            name="Filtro Ciclônico de Sílica"
            selected={selectedHotspot === "dust"}
            onSelect={onSelectHotspot}
          />
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------
// 5. Ares Hauler (Caminhão Espacial Pesado)
// ---------------------------------------------------------------------
function AresHauler({
  selectedHotspot,
  onSelectHotspot,
  showHotspots,
}: Omit<VehicleModelProps, "category" | "modelKey">) {
  const thrusterPulseRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (thrusterPulseRef.current) {
      const s = 0.95 + Math.sin(Date.now() * 0.015) * 0.08;
      thrusterPulseRef.current.scale.set(s, s, s);
    }
  });

  return (
    <group position={[0, -0.1, 0]}>
      {/* Cabine frontal blindada facetada */}
      <mesh castShadow position={[0, 0.45, 1.5]}>
        <boxGeometry args={[1.7, 1.1, 1.3]} />
        <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.7} roughness={0.35} />
      </mesh>

      {/* Visores blindados anti-radiação */}
      <mesh position={[0, 0.65, 2.16]}>
        <boxGeometry args={[1.35, 0.38, 0.04]} />
        <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.8} />
      </mesh>

      {/* Chassi reforçado de viga I de titânio */}
      <mesh position={[0, -0.25, 0]}>
        <boxGeometry args={[1.5, 0.35, 4.6]} />
        <meshStandardMaterial color={TITANIUM_DARK} metalness={0.9} roughness={0.4} />
      </mesh>

      {/* Tanque cilíndrico criogênico */}
      <mesh position={[0, 0.65, -0.7]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.78, 0.78, 2.4, 32]} />
        <meshStandardMaterial color={HULL_COLOR} metalness={0.85} roughness={0.2} />
      </mesh>

      {/* Anéis de fixação estrutural e isolamento */}
      {[-1.6, -0.7, 0.2].map((z, i) => (
        <mesh key={i} position={[0, 0.65, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.82, 0.06, 16, 32]} />
          <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.8} />
        </mesh>
      ))}

      {/* 8 Rodas/Esteiras magnéticas todo-terreno */}
      {[-0.9, 0.9].map((x, side) =>
        [-1.6, -0.5, 0.6, 1.6].map((z, row) => (
          <mesh key={`${side}-${row}`} position={[x, -0.4, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.38, 0.38, 0.32, 24]} />
            <meshStandardMaterial color="#1a1a1c" roughness={0.9} metalness={0.2} />
          </mesh>
        )),
      )}

      {/* Escapamentos de plasma traseiros com pulso roxo */}
      <group ref={thrusterPulseRef} position={[0, 0.45, -2.1]}>
        {[-0.45, 0.45].map((x, i) => (
          <group key={i} position={[x, 0, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.22, 0.3, 0.4, 20]} />
              <meshStandardMaterial color={TITANIUM_DARK} metalness={0.95} />
            </mesh>
            <mesh position={[0, 0, -0.25]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.18, 0.22, 0.2, 16]} />
              <meshBasicMaterial color={PLASMA_PURPLE} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Hotspots de Manutenção */}
      {showHotspots && (
        <>
          <Hotspot
            position={[0, 0.8, 1.5]}
            id="o2"
            name="Módulo de Pressurização da Cabine"
            selected={selectedHotspot === "o2"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, -0.1, 0.8]}
            id="battery"
            name="Baterias Industriais de Lítio-Enxofre"
            selected={selectedHotspot === "battery"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0.45, -2.2]}
            id="thruster"
            name="Propulsores de Plasma Kr-Xe"
            selected={selectedHotspot === "thruster"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0.9, 0.6, 0.2]}
            id="dust"
            name="Filtro de Despoeiramento Eletrostático"
            selected={selectedHotspot === "dust"}
            onSelect={onSelectHotspot}
          />
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------
// 6. Starship Hopper (Foguete Interplanetário Monocilíndrico)
// ---------------------------------------------------------------------
function StarshipHopper({
  selectedHotspot,
  onSelectHotspot,
  showHotspots,
}: Omit<VehicleModelProps, "category" | "modelKey">) {
  const flameRef = useRef<THREE.Mesh>(null);
  const glowLight = useRef<THREE.PointLight>(null);

  useFrame(() => {
    if (flameRef.current) {
      const scaleY = 1 + Math.sin(Date.now() * 0.03) * 0.25 + Math.random() * 0.1;
      const scaleXZ = 1 + Math.cos(Date.now() * 0.02) * 0.1;
      flameRef.current.scale.set(scaleXZ, scaleY, scaleXZ);
    }
    if (glowLight.current) {
      glowLight.current.intensity = 4 + Math.sin(Date.now() * 0.04) * 1.5;
    }
  });

  return (
    <group position={[0, -1.6, 0]}>
      {/* Fuselagem cilíndrica de aço inox espelhado */}
      <mesh castShadow position={[0, 2.2, 0]}>
        <cylinderGeometry args={[0.72, 0.72, 3.8, 48]} />
        <meshStandardMaterial color="#f0f2f5" metalness={0.96} roughness={0.12} />
      </mesh>

      {/* Escudo térmico cerâmico negro */}
      <mesh position={[0.01, 2.2, 0]}>
        <cylinderGeometry args={[0.725, 0.725, 3.8, 24, 1, false, -Math.PI / 2, Math.PI]} />
        <meshStandardMaterial color={HEAT_SHIELD_BLACK} roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Ogiva cônica superior */}
      <mesh position={[0, 4.7, 0]}>
        <coneGeometry args={[0.72, 1.2, 48]} />
        <meshStandardMaterial color="#f0f2f5" metalness={0.96} roughness={0.12} />
      </mesh>

      {/* Anel de estocagem pressurizada */}
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[0.73, 0.73, 0.25, 36]} />
        <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Aletas aerodinâmicas superiores (Canards) */}
      {[-1, 1].map((dir, i) => (
        <mesh key={i} position={[dir * 0.85, 4.3, 0]} rotation={[0, 0, -dir * 0.35]}>
          <boxGeometry args={[0.45, 0.5, 0.04]} />
          <meshStandardMaterial color={HEAT_SHIELD_BLACK} metalness={0.8} roughness={0.3} />
        </mesh>
      ))}

      {/* Aletas aerodinâmicas inferiores gigantes */}
      {[0, 1, 2].map((idx) => {
        const angle = (idx * Math.PI * 2) / 3;
        const x = Math.cos(angle) * 0.85;
        const z = Math.sin(angle) * 0.85;
        return (
          <group key={idx} position={[x, 0.7, z]} rotation={[0, -angle, 0]}>
            <mesh rotation={[0, 0, 0.25]}>
              <boxGeometry args={[0.6, 1.5, 0.06]} />
              <meshStandardMaterial color={ACCENT_ORANGE} metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh position={[0.2, -0.7, 0]}>
              <boxGeometry args={[0.3, 0.1, 0.2]} />
              <meshStandardMaterial color={TITANIUM_DARK} metalness={0.9} />
            </mesh>
          </group>
        );
      })}

      {/* Cluster de 3 Motores Raptor na base */}
      {[0, 1, 2].map((idx) => {
        const angle = (idx * Math.PI * 2) / 3;
        const x = Math.cos(angle) * 0.28;
        const z = Math.sin(angle) * 0.28;
        return (
          <mesh key={idx} position={[x, 0.15, z]} rotation={[Math.PI, 0, 0]}>
            <cylinderGeometry args={[0.18, 0.1, 0.45, 20]} />
            <meshStandardMaterial color={TITANIUM_DARK} metalness={0.95} roughness={0.3} />
          </mesh>
        );
      })}

      {/* Pluma de Ignição Raptor Animada */}
      <group position={[0, -0.4, 0]}>
        <mesh ref={flameRef} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.45, 1.4, 32, 1, true]} />
          <meshBasicMaterial color={GLOW_CYAN} side={THREE.DoubleSide} transparent opacity={0.85} />
        </mesh>
        <pointLight
          ref={glowLight}
          position={[0, -0.2, 0]}
          color={GLOW_CYAN}
          intensity={4}
          distance={6}
        />
      </group>

      {/* Hotspots de Manutenção */}
      {showHotspots && (
        <>
          <Hotspot
            position={[0, 4.6, 0.5]}
            id="o2"
            name="Módulo de Comando & Suporte O₂"
            selected={selectedHotspot === "o2"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0.7, 2.2, 0]}
            id="heat"
            name="Escudo Térmico Cerâmico PICA-X"
            selected={selectedHotspot === "heat"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 0, 0]}
            id="thruster"
            name="Cluster 3x Motores Raptor"
            selected={selectedHotspot === "thruster"}
            onSelect={onSelectHotspot}
          />
          <Hotspot
            position={[0, 1.5, 0.75]}
            id="battery"
            name="Células Criogênicas de Ignição"
            selected={selectedHotspot === "battery"}
            onSelect={onSelectHotspot}
          />
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------
// Componente de Exportação Principal com Identificação Automática de Modelo
// ---------------------------------------------------------------------
export function VehicleModel({
  category,
  modelKey,
  callsign,
  name,
  selectedHotspot,
  onSelectHotspot,
  showHotspots = false,
}: VehicleModelProps) {
  const props = { selectedHotspot, onSelectHotspot, showHotspots };
  // model_key manda; sem ele (banco antigo ou demo) o modelo é deduzido do indicativo e do nome.
  switch (inferModelKey({ model_key: modelKey, category, callsign, name })) {
    case "apex_phantom":
      return <ApexPhantomVtol {...props} />;
    case "valkyrie_gt":
      return <ValkyrieRoadsterGt {...props} />;
    case "cybercab_sport":
      return <CyberCabVtolSport {...props} />;
    case "cybercab_x2":
      return <CyberCabVtol {...props} />;
    case "ares_hauler":
      return <AresHauler {...props} />;
    case "starship_hopper":
      return <StarshipHopper {...props} />;
  }
}
