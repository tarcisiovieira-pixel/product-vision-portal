import { useRef, useMemo, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";
import {
  categoryLabel,
  statusLabel,
  type Hangar,
  type Vehicle,
} from "@/lib/ares-data";
import {
  Building2,
  Flame,
  Navigation,
  Plane,
  Radio,
  Rocket,
  ShieldCheck,
  Truck,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";

const R = 2.4; // Raio da esfera de Marte no visualizador de recuo

// ---------------------------------------------------------------------
// Geradores de Texturas Procedurais de Alta Definição (100% Seguros p/ SSR/jsdom)
// ---------------------------------------------------------------------
function makeMarsSurfaceTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  try {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const g = c.getContext?.("2d");
    if (!g) return new THREE.Texture();

    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#f2e6de");
    grad.addColorStop(0.08, "#b8532a");
    grad.addColorStop(0.5, "#9e3f1c");
    grad.addColorStop(0.92, "#8a3517");
    grad.addColorStop(1, "#f2e6de");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 512);

    let s = 23;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1200; i++) {
      const x = r() * 1024;
      const y = 35 + r() * 442;
      const rad = r() * 24 + 2;
      g.fillStyle = r() > 0.5 ? `rgba(45,14,5,${r() * 0.28})` : `rgba(240,150,95,${r() * 0.2})`;
      for (const ox of [-1024, 0, 1024]) {
        const rx = x + ox;
        if (rx + rad * 2 >= 0 && rx - rad * 2 <= 1024) {
          g.beginPath();
          g.ellipse(rx, y, rad * 1.6, rad, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Falha de Valles Marineris
    g.strokeStyle = "rgba(40,12,5,0.6)";
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(340, 275);
    g.bezierCurveTo(440, 285, 520, 260, 640, 278);
    g.stroke();

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  } catch {
    return new THREE.Texture();
  }
}

function makeEarthSurfaceTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  try {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const g = c.getContext?.("2d");
    if (!g) return new THREE.Texture();

    // Oceanos azuis profundos
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#081b33");
    grad.addColorStop(0.3, "#0d2b52");
    grad.addColorStop(0.7, "#0d2b52");
    grad.addColorStop(1, "#081b33");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 512);

    let s = 42;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // Continentes terrestres
    for (let i = 0; i < 900; i++) {
      const x = r() * 1024;
      const y = 80 + r() * 350;
      const rad = r() * 26 + 6;
      g.fillStyle = r() > 0.4 ? "rgba(34, 110, 48, 0.55)" : "rgba(168, 140, 85, 0.45)";
      for (const ox of [-1024, 0, 1024]) {
        const rx = x + ox;
        if (rx + rad * 2 >= 0 && rx - rad * 2 <= 1024) {
          g.beginPath();
          g.ellipse(rx, y, rad * 1.5, rad, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Calotas polares
    g.fillStyle = "rgba(240, 248, 255, 0.95)";
    g.beginPath();
    g.ellipse(512, 16, 512, 28, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(512, 496, 512, 28, 0, 0, Math.PI * 2);
    g.fill();

    // Faixas de nuvens atmosféricas brancas
    g.fillStyle = "rgba(255, 255, 255, 0.38)";
    for (let i = 0; i < 220; i++) {
      const cx = r() * 1024;
      const cy = 60 + r() * 380;
      const w = r() * 60 + 20;
      const h = r() * 14 + 4;
      g.beginPath();
      g.ellipse(cx, cy, w, h, (r() - 0.5) * 0.4, 0, Math.PI * 2);
      g.fill();
    }

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    return t;
  } catch {
    return new THREE.Texture();
  }
}

function makeMartianTerrainTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  try {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext?.("2d");
    if (!g) return new THREE.Texture();

    // Fundo avermelhado de rególito
    g.fillStyle = "#8a3116";
    g.fillRect(0, 0, 512, 512);

    let s = 77;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // Ondulações de dunas e sedimentos minerais
    for (let i = 0; i < 400; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const w = r() * 60 + 10;
      const h = r() * 12 + 2;
      g.fillStyle = r() > 0.5 ? "rgba(45, 12, 4, 0.25)" : "rgba(220, 110, 60, 0.22)";
      g.beginPath();
      g.ellipse(x, y, w, h, 0.1, 0, Math.PI * 2);
      g.fill();
    }

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 18);
    return t;
  } catch {
    return new THREE.Texture();
  }
}

function makePhobosTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  try {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext?.("2d");
    if (!g) return new THREE.Texture();

    g.fillStyle = "#4a4744";
    g.fillRect(0, 0, 512, 256);

    let s = 89;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 300; i++) {
      const x = r() * 512;
      const y = r() * 256;
      const rad = r() * 16 + 2;
      g.fillStyle = r() > 0.5 ? "rgba(20, 19, 18, 0.35)" : "rgba(120, 115, 110, 0.25)";
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  } catch {
    return new THREE.Texture();
  }
}

function makeEuropaTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  try {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext?.("2d");
    if (!g) return new THREE.Texture();

    g.fillStyle = "#e2e8f0";
    g.fillRect(0, 0, 512, 256);

    let s = 101;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // Fissuras lineares na crosta de gelo (Lineae)
    g.strokeStyle = "rgba(148, 77, 43, 0.4)";
    for (let i = 0; i < 30; i++) {
      g.lineWidth = r() * 3 + 1;
      g.beginPath();
      g.moveTo(r() * 512, r() * 256);
      g.bezierCurveTo(r() * 512, r() * 256, r() * 512, r() * 256, r() * 512, r() * 256);
      g.stroke();
    }

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  } catch {
    return new THREE.Texture();
  }
}

// ---------------------------------------------------------------------
// Web Audio API: Síntese de Áudio Espacial Procedural (Zero dependências externas)
// ---------------------------------------------------------------------
class SpaceSynthEngine {
  private ctx: AudioContext | null = null;
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private isPlaying = false;

  start() {
    if (this.isPlaying) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.setValueAtTime(220, this.ctx.currentTime);

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.04, this.ctx.currentTime);

      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = "sawtooth";
      this.osc1.frequency.setValueAtTime(55, this.ctx.currentTime);

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = "sine";
      this.osc2.frequency.setValueAtTime(110, this.ctx.currentTime);

      this.osc1.connect(this.filter);
      this.osc2.connect(this.filter);
      this.filter.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);

      this.osc1.start();
      this.osc2.start();
      this.isPlaying = true;
    } catch {
      // AudioContext blocked by browser policy until user click
    }
  }

  setBoost(boosting: boolean) {
    if (!this.ctx || !this.filter || !this.gainNode || !this.osc1) return;
    const now = this.ctx.currentTime;
    if (boosting) {
      this.filter.frequency.setTargetAtTime(850, now, 0.1);
      this.osc1.frequency.setTargetAtTime(95, now, 0.1);
      this.gainNode.gain.setTargetAtTime(0.08, now, 0.1);
    } else {
      this.filter.frequency.setTargetAtTime(220, now, 0.2);
      this.osc1.frequency.setTargetAtTime(55, now, 0.2);
      this.gainNode.gain.setTargetAtTime(0.04, now, 0.2);
    }
  }

  stop() {
    if (!this.isPlaying) return;
    try {
      this.osc1?.stop();
      this.osc2?.stop();
      this.ctx?.close();
    } catch {
      // ignore
    }
    this.isPlaying = false;
  }
}

// ---------------------------------------------------------------------
// Barreira Eletromagnética contra Tempestades de Areia & Corredor de Voo
// Substitui completamente o aro circular antigo por túnel de força e balizas
// ---------------------------------------------------------------------
function StormDefenseBarrierCorridor({
  isBoosting,
  isMoving,
}: {
  isBoosting: boolean;
  isMoving: boolean;
}) {
  const gatesRef = useRef<THREE.Group[]>([]);
  const count = 6;
  const spacing = 5.0;

  useFrame((_, delta) => {
    if (!isMoving) return;
    const speed = (isBoosting ? 6.5 : 3.0) * delta;
    gatesRef.current.forEach((g) => {
      if (g) {
        g.position.z += speed;
        if (g.position.z > 5.0) {
          g.position.z -= count * spacing;
        }
      }
    });
  });

  return (
    <group>
      {/* Luz guia central do corredor no solo */}
      <mesh position={[0, -1.82, -15]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 70]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.18} />
      </mesh>

      {Array.from({ length: count }).map((_, i) => {
        const initZ = -i * spacing;
        return (
          <group
            key={i}
            ref={(el) => (gatesRef.current[i] = el!)}
            position={[0, 0, initZ]}
          >
            {/* Pilone Esquerdo da Barreira de Tempestade */}
            <group position={[-3.2, -1.8, 0]}>
              <mesh position={[0, 1.5, 0]}>
                <cylinderGeometry args={[0.07, 0.1, 3.0, 12]} />
                <meshStandardMaterial color="#22252a" metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh position={[0, 3.0, 0]}>
                <sphereGeometry args={[0.14, 16, 16]} />
                <meshBasicMaterial color="#00f0ff" toneMapped={false} />
              </mesh>
            </group>

            {/* Pilone Direito da Barreira de Tempestade */}
            <group position={[3.2, -1.8, 0]}>
              <mesh position={[0, 1.5, 0]}>
                <cylinderGeometry args={[0.07, 0.1, 3.0, 12]} />
                <meshStandardMaterial color="#22252a" metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh position={[0, 3.0, 0]}>
                <sphereGeometry args={[0.14, 16, 16]} />
                <meshBasicMaterial color="#00f0ff" toneMapped={false} />
              </mesh>
            </group>

            {/* Arco Superior de Energia Simétrico da Barreira Eletromagnética */}
            <mesh position={[0, -1.8, 0]} rotation={[0, 0, 0]}>
              <torusGeometry args={[3.2, 0.028, 12, 32, Math.PI]} />
              <meshBasicMaterial color="#00f0ff" transparent opacity={0.65} toneMapped={false} />
            </mesh>

            {/* Cúpula / Meio-Cilindro Translúcido do Campo de Força Defletor */}
            <mesh position={[0, -1.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[3.2, 3.2, spacing * 0.98, 20, 1, true, 0, Math.PI]} />
              <meshBasicMaterial
                color="#00f0ff"
                transparent
                opacity={0.065}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>

            {/* Balizas Laterais de Solo */}
            {[-3.2, 3.2].map((x, idx) => (
              <mesh key={idx} position={[x, -1.75, 0]}>
                <boxGeometry args={[0.2, 0.1, 0.3]} />
                <meshBasicMaterial color="#ff5a1f" toneMapped={false} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------
// Efeito de Fibras de Hiper-Espaço / Warp Drive no Turbo Espacial
// ---------------------------------------------------------------------
function WarpStarStreaks({ active }: { active: boolean }) {
  const count = 90;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const starData = useMemo(() => {
    let seed = 31;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: count }, () => ({
      x: (rnd() - 0.5) * 26,
      y: (rnd() - 0.5) * 16,
      z: -28 + rnd() * 36,
      speed: 30 + rnd() * 40,
      len: 1.8 + rnd() * 2.5,
    }));
  }, [count]);

  useFrame((_, delta) => {
    if (!meshRef.current || !active) return;
    for (let i = 0; i < count; i++) {
      const s = starData[i];
      s.z += s.speed * delta;
      if (s.z > 6) s.z = -30;
      dummy.position.set(s.x, s.y, s.z);
      dummy.scale.set(0.04, 0.04, s.len);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#a5f3fc" transparent opacity={0.85} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------
// Superfície e Atmosfera Aberta de Marte
// Substitui os blocos vermelhos antigos por relevo natural e tempestades externas
// ---------------------------------------------------------------------
function MartianSurfaceAtmosphere({
  isMoving,
  isBoosting,
}: {
  isMoving: boolean;
  isBoosting: boolean;
}) {
  const terrainTex = useMemo(makeMartianTerrainTexture, []);
  const speed = isBoosting ? 3.0 : isMoving ? 1.5 : 0.0;

  useFrame((_, delta) => {
    if (speed > 0 && terrainTex) {
      terrainTex.offset.y -= speed * delta * 0.12;
    }
  });

  return (
    <group>
      {/* Terreno Areográfico Contínuo de Rególito */}
      <mesh position={[0, -1.9, -15]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[110, 160, 32, 32]} />
        <meshStandardMaterial
          map={terrainTex}
          roughness={0.92}
          metalness={0.08}
          color="#be4f23"
        />
      </mesh>

      {/* Tempestade de Areia Marciana Rodopiando do Lado de Fora da Barreira */}
      <Sparkles
        count={isBoosting ? 90 : 45}
        scale={[18, 6, 30]}
        position={[-12, 1, -10]}
        size={3}
        color="#ff7a33"
        speed={isBoosting ? 7 : 4}
      />

      <Sparkles
        count={isBoosting ? 90 : 45}
        scale={[18, 6, 30]}
        position={[12, 1, -10]}
        size={3}
        color="#ff7a33"
        speed={isBoosting ? 7 : 4}
      />

      <Sparkles
        count={isBoosting ? 70 : 35}
        scale={[28, 4, 30]}
        position={[0, 4.5, -10]}
        size={2.5}
        color="#ff9944"
        speed={isBoosting ? 6 : 3}
      />

      {/* Silhueta de Cadeias Montanhosas Marcianas ao Fundo */}
      {[-32, -16, 0, 18, 35].map((x, i) => (
        <group key={i} position={[x, -0.6, -55]}>
          <mesh>
            <coneGeometry args={[10 + Math.abs(x) * 0.2, 5.5, 5]} />
            <meshBasicMaterial color="#541b0b" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------
// Sistema Planetário Destino 3D (Terra c/ Lua, Fobos ou Europa)
// ---------------------------------------------------------------------
function DestinationCelestialSystem3D({
  destination,
}: {
  destination: "earth" | "phobos" | "europa";
}) {
  const earthTex = useMemo(makeEarthSurfaceTexture, []);
  const phobosTex = useMemo(makePhobosTexture, []);
  const europaTex = useMemo(makeEuropaTexture, []);
  const moonGroup = useRef<THREE.Group>(null);
  const planetMesh = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (planetMesh.current) planetMesh.current.rotation.y += delta * 0.06;
    if (moonGroup.current) moonGroup.current.rotation.y += delta * 0.22;
  });

  return (
    <group position={[0, 0.8, -26.0]}>
      {destination === "earth" && (
        <>
          {/* Globo Terrestre em 3D */}
          <mesh ref={planetMesh}>
            <sphereGeometry args={[3.2, 64, 64]} />
            <meshStandardMaterial map={earthTex} roughness={0.65} metalness={0.12} />
          </mesh>
          {/* Atmosfera Rayleigh Azul Brilhante */}
          <mesh scale={1.05}>
            <sphereGeometry args={[3.2, 48, 48]} />
            <meshBasicMaterial
              color="#38bdf8"
              transparent
              opacity={0.32}
              side={THREE.BackSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {/* Lua em Órbita */}
          <group ref={moonGroup}>
            <group position={[6.0, 0.4, 0]}>
              <mesh>
                <sphereGeometry args={[0.5, 32, 32]} />
                <meshStandardMaterial color="#c4c7cc" roughness={0.9} />
              </mesh>
            </group>
          </group>
        </>
      )}

      {destination === "phobos" && (
        <group ref={planetMesh}>
          <mesh>
            <dodecahedronGeometry args={[2.2, 2]} />
            <meshStandardMaterial map={phobosTex} roughness={0.92} metalness={0.15} />
          </mesh>
          {/* Balizas da Estação de Mineração Orbital */}
          {[-0.8, 0.6].map((x, i) => (
            <mesh key={i} position={[x, 1.2, 0.8]}>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshBasicMaterial color="#00f0ff" toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}

      {destination === "europa" && (
        <>
          {/* Europa com crosta congelada e fissuras lineares */}
          <mesh ref={planetMesh}>
            <sphereGeometry args={[2.5, 48, 48]} />
            <meshStandardMaterial map={europaTex} roughness={0.5} metalness={0.25} color="#e0f2fe" />
          </mesh>
          {/* Júpiter gigante ao fundo */}
          <group position={[18, -4, -30]}>
            <mesh>
              <sphereGeometry args={[8.0, 48, 48]} />
              <meshStandardMaterial color="#c29158" roughness={0.85} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------
// Planeta Marte Recuando na Popa da Starship
// ---------------------------------------------------------------------
function MarsAftView({ marsTex }: { marsTex: THREE.Texture }) {
  const marsRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (marsRef.current) marsRef.current.rotation.y += delta * 0.03;
  });

  return (
    <group position={[0, -4.0, 18.0]}>
      {/* Planeta Marte ficando para trás na popa */}
      <mesh ref={marsRef}>
        <sphereGeometry args={[3.6, 64, 64]} />
        <meshStandardMaterial map={marsTex} roughness={0.92} metalness={0.08} />
      </mesh>
      {/* Atmosfera fina de CO2 */}
      <mesh scale={1.03}>
        <sphereGeometry args={[3.6, 48, 48]} />
        <meshBasicMaterial
          color="#ff5a1f"
          transparent
          opacity={0.22}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------
// Modelo 3D da Nave Voadora no Percurso (Carro VTOL ou Starship ou Caminhão)
// Orientação Correta: Nariz aponta para Frente (-Z), Motores para Trás (+Z)
// ---------------------------------------------------------------------
function FlightCraftModel({
  category,
  callsign,
  name,
  isBoosting,
}: {
  category: Vehicle["category"];
  callsign?: string;
  name?: string;
  speedKmh: number;
  isBoosting: boolean;
}) {
  const rotorsRef = useRef<THREE.Group[]>([]);
  const flameRef = useRef<THREE.Mesh>(null);
  const thrusterGlow = useRef<THREE.PointLight>(null);

  useFrame((_, delta) => {
    // Rotação dos motores/rotores do carro voador (mais rápido com boost)
    const rotorMultiplier = isBoosting ? 65 : 32;
    rotorsRef.current.forEach((r) => {
      if (r) r.rotation.y += Math.min(delta, 0.05) * rotorMultiplier;
    });

    // Animação da chama do foguete Starship
    if (flameRef.current) {
      const boostScale = isBoosting ? 2.2 : 1.0;
      const pulse =
        (1 + Math.sin(Date.now() * 0.04) * 0.25 + Math.random() * 0.15) * boostScale;
      flameRef.current.scale.set(
        (1 + Math.sin(Date.now() * 0.02) * 0.1) * (isBoosting ? 1.4 : 1),
        pulse,
        1,
      );
    }

    if (thrusterGlow.current) {
      thrusterGlow.current.intensity =
        (isBoosting ? 8 : 4) + Math.sin(Date.now() * 0.05) * 1.5;
    }
  });

  if (category === "interplanetary_rocket") {
    // -------------------------------------------------------------
    // FOGUETE CLASSE STARSHIP - PROPULSÃO RAPTOR COM MACH DIAMONDS
    // Nariz apontando para frente (-Z), Chamas para trás (+Z)
    // -------------------------------------------------------------
    return (
      <group scale={[0.24, 0.24, 0.24]} rotation={[-Math.PI / 2, 0, 0]}>
        {/* Campo de Força Defletor contra Tempestades e Detritos */}
        <mesh position={[0, 1.2, 0]}>
          <sphereGeometry args={[2.2, 20, 20]} />
          <meshBasicMaterial
            color="#00f0ff"
            transparent
            opacity={isBoosting ? 0.15 : 0.06}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Fuselagem Inox Espelhada */}
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 2.4, 32]} />
          <meshStandardMaterial color="#f0f3f6" metalness={0.96} roughness={0.12} />
        </mesh>

        {/* Ogiva Cônica Superior (Nosecone) */}
        <mesh position={[0, 2.8, 0]}>
          <coneGeometry args={[0.42, 0.8, 32]} />
          <meshStandardMaterial color="#f0f3f6" metalness={0.96} roughness={0.12} />
        </mesh>

        {/* Aletas Canard Aerodinâmicas Superiores */}
        {[-1, 1].map((dir, i) => (
          <mesh key={i} position={[dir * 0.5, 2.4, 0]} rotation={[0, 0, -dir * 0.4]}>
            <boxGeometry args={[0.3, 0.35, 0.03]} />
            <meshStandardMaterial color="#1a1c20" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}

        {/* Aletas Principais na Base */}
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, i) => (
          <group key={i} rotation={[0, angle, 0]}>
            <mesh position={[0.55, 0.3, 0]} rotation={[0, 0, 0.25]}>
              <boxGeometry args={[0.4, 1.0, 0.04]} />
              <meshStandardMaterial color="#ff5a1f" metalness={0.85} roughness={0.25} />
            </mesh>
          </group>
        ))}

        {/* Cluster de 3 Motores Raptor Vacuum */}
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, i) => (
          <group key={i} rotation={[0, angle, 0]}>
            <mesh position={[0.15, -0.1, 0]} rotation={[Math.PI, 0, 0]}>
              <cylinderGeometry args={[0.12, 0.08, 0.28, 16]} />
              <meshStandardMaterial color="#2a2b30" metalness={0.95} />
            </mesh>
          </group>
        ))}

        {/* Pluma de Ignição / Plasma Raptor com Mach Diamonds */}
        <group position={[0, -0.6, 0]}>
          <mesh ref={flameRef} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.34, 1.6, 24, 1, true]} />
            <meshBasicMaterial
              color={isBoosting ? "#ffffff" : "#00f0ff"}
              side={THREE.DoubleSide}
              transparent
              opacity={0.88}
            />
          </mesh>
          {/* Mach Shock Diamonds no núcleo do plasma */}
          {[0.3, 0.65, 1.0].map((y, idx) => (
            <mesh key={idx} position={[0, -y, 0]} scale={[(1 - idx * 0.25), (1 - idx * 0.25), (1 - idx * 0.25)]}>
              <octahedronGeometry args={[0.12, 0]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
          ))}
          <pointLight
            ref={thrusterGlow}
            position={[0, -0.4, 0]}
            color={isBoosting ? "#ffffff" : "#00f0ff"}
            intensity={isBoosting ? 9 : 4.5}
            distance={6}
          />
          <Sparkles
            count={isBoosting ? 90 : 45}
            scale={[0.9, 2.2, 0.9]}
            size={isBoosting ? 4.5 : 3}
            color={isBoosting ? "#e0f2fe" : "#38bdf8"}
            speed={isBoosting ? 9 : 5}
          />
        </group>
      </group>
    );
  }

  // Modelos de Veículos Terrestres/Atmosféricos rotacionados 180° para apontar para Frente (-Z)
  if (category === "space_truck") {
    // -------------------------------------------------------------
    // CAMINHÃO ESPACIAL PESADO (ARES HAULER)
    // -------------------------------------------------------------
    return (
      <group scale={[0.32, 0.32, 0.32]} rotation={[0, Math.PI, 0]}>
        {/* Escudo Defletor contra Tempestades */}
        <mesh position={[0, 0.35, 0]}>
          <sphereGeometry args={[1.5, 18, 18]} />
          <meshBasicMaterial
            color="#00f0ff"
            transparent
            opacity={isBoosting ? 0.16 : 0.07}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        {/* Cabine Blindada Laranja */}
        <mesh position={[0, 0.3, 0.7]}>
          <boxGeometry args={[1.1, 0.7, 0.9]} />
          <meshStandardMaterial color="#ff5a1f" metalness={0.7} roughness={0.35} />
        </mesh>
        {/* Visor Anti-Radiação Ciano */}
        <mesh position={[0, 0.45, 1.16]}>
          <boxGeometry args={[0.9, 0.25, 0.04]} />
          <meshStandardMaterial color="#00f0ff" emissive="#00f0ff" emissiveIntensity={0.8} />
        </mesh>
        {/* Contêiner Pressurizado de Carga */}
        <mesh position={[0, 0.45, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.55, 0.55, 1.6, 20]} />
          <meshStandardMaterial color="#d4d0c8" metalness={0.85} roughness={0.25} />
        </mesh>
        {/* Propulsores de Plasma Traseiros */}
        <group position={[0, 0.3, -1.4]}>
          {[-0.3, 0.3].map((x, i) => (
            <mesh key={i} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.12, 0.16, 0.25, 12]} />
              <meshBasicMaterial
                color={isBoosting ? "#00f0ff" : "#a855f7"}
                toneMapped={false}
              />
            </mesh>
          ))}
          <Sparkles
            count={isBoosting ? 50 : 25}
            scale={[0.8, 0.5, 0.8]}
            size={2.5}
            color={isBoosting ? "#00f0ff" : "#a855f7"}
            speed={isBoosting ? 6 : 3}
          />
        </group>
      </group>
    );
  }

  const ident = `${callsign ?? ""} ${name ?? ""}`.toLowerCase();
  const isApex = ident.includes("apx") || ident.includes("apex") || ident.includes("phantom");
  const isValkyrie = ident.includes("valk") || ident.includes("vmt") || ident.includes("roadster");

  if (isApex) {
    // -------------------------------------------------------------
    // APEX PHANTOM HYPER-VTOL (LINHA EXECUTIVA VIP PREMIUM)
    // -------------------------------------------------------------
    return (
      <group scale={[0.32, 0.32, 0.32]} rotation={[0, Math.PI, 0]}>
        {/* Escudo Defletor contra Tempestades */}
        <mesh position={[0, 0.2, 0]}>
          <sphereGeometry args={[1.6, 18, 18]} />
          <meshBasicMaterial
            color="#00f0ff"
            transparent
            opacity={isBoosting ? 0.16 : 0.07}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[1.2, 0.38, 2.6]} />
          <meshStandardMaterial color="#101217" metalness={0.94} roughness={0.16} />
        </mesh>
        {[-0.62, 0.62].map((x, i) => (
          <mesh key={i} position={[x, 0.14, 0.1]}>
            <boxGeometry args={[0.04, 0.08, 2.0]} />
            <meshStandardMaterial color="#d4af37" metalness={0.96} roughness={0.12} />
          </mesh>
        ))}
        {[-1, 1].map((dir, i) => (
          <group key={i} position={[dir * 1.05, 0.1, -0.2]}>
            <mesh>
              <boxGeometry args={[1.1, 0.04, 1.4]} />
              <meshStandardMaterial color="#101217" metalness={0.92} roughness={0.18} />
            </mesh>
            <mesh position={[dir * 0.55, 0.2, 0]}>
              <boxGeometry args={[0.04, 0.4, 0.5]} />
              <meshStandardMaterial color="#d4af37" metalness={0.96} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.36, 0.2]}>
          <boxGeometry args={[0.65, 0.26, 1.1]} />
          <meshPhysicalMaterial color="#071728" transmission={0.7} roughness={0.05} metalness={0.2} />
        </mesh>
        <group position={[0, 0.12, -1.35]}>
          {[-0.25, 0.25].map((x, i) => (
            <mesh key={i} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.12, 0.16, 0.22, 16]} />
              <meshBasicMaterial color="#00f0ff" toneMapped={false} />
            </mesh>
          ))}
          <pointLight position={[0, 0, -0.3]} color="#00f0ff" intensity={isBoosting ? 8 : 4} distance={4} />
          <Sparkles count={isBoosting ? 60 : 30} scale={[0.8, 0.6, 1.2]} size={3} color="#00f0ff" speed={isBoosting ? 9 : 5} />
        </group>
      </group>
    );
  }

  if (isValkyrie) {
    // -------------------------------------------------------------
    // VALKYRIE MARTIAN ROADSTER GT (LINHA SUPER SPORT GT)
    // -------------------------------------------------------------
    return (
      <group scale={[0.33, 0.33, 0.33]} rotation={[0, Math.PI, 0]}>
        {/* Escudo Defletor contra Tempestades */}
        <mesh position={[0, 0.2, 0]}>
          <sphereGeometry args={[1.6, 18, 18]} />
          <meshBasicMaterial
            color="#00f0ff"
            transparent
            opacity={isBoosting ? 0.16 : 0.07}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[1.25, 0.32, 2.5]} />
          <meshStandardMaterial color="#ff5a1f" metalness={0.88} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.27, 0]}>
          <boxGeometry args={[0.3, 0.02, 2.3]} />
          <meshStandardMaterial color="#141519" roughness={0.8} />
        </mesh>
        <group position={[0, 0.42, -1.15]}>
          <mesh>
            <boxGeometry args={[1.5, 0.03, 0.28]} />
            <meshStandardMaterial color="#141519" metalness={0.85} />
          </mesh>
          {[-0.4, 0.4].map((x, i) => (
            <mesh key={i} position={[x, -0.16, 0]}>
              <boxGeometry args={[0.03, 0.32, 0.06]} />
              <meshStandardMaterial color="#ff5a1f" />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 0.08, 1.26]}>
          <boxGeometry args={[1.0, 0.03, 0.03]} />
          <meshBasicMaterial color="#00f0ff" toneMapped={false} />
        </mesh>
        <group position={[0, 0.1, -1.3]}>
          {[-0.26, 0.26].map((x, i) => (
            <mesh key={i} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.14, 0.55, 16, 1, true]} />
              <meshBasicMaterial color={isBoosting ? "#ffffff" : "#00f0ff"} toneMapped={false} />
            </mesh>
          ))}
          <pointLight position={[0, 0, -0.4]} color="#00f0ff" intensity={isBoosting ? 9 : 5} distance={5} />
          <Sparkles count={isBoosting ? 70 : 35} scale={[0.9, 0.6, 1.4]} size={3.5} color="#38bdf8" speed={isBoosting ? 10 : 6} />
        </group>
      </group>
    );
  }

  // -------------------------------------------------------------
  // CARRO VOADOR VTOL (CYBERCAB VTOL)
  // -------------------------------------------------------------
  const rotorPositions: [number, number, number][] = [
    [0.9, 0.1, 0.7],
    [-0.9, 0.1, 0.7],
    [0.9, 0.1, -0.7],
    [-0.9, 0.1, -0.7],
  ];

  return (
    <group scale={[0.34, 0.34, 0.34]} rotation={[0, Math.PI, 0]}>
      {/* Escudo Defletor Iônico contra Tempestades */}
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[1.5, 18, 18]} />
        <meshBasicMaterial
          color="#00f0ff"
          transparent
          opacity={isBoosting ? 0.16 : 0.07}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Fuselagem Angular Aerodinâmica */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[1.1, 0.35, 2.1]} />
        <meshStandardMaterial color="#d4d0c8" metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Cabine Translúcida Pressurizada com Brilho Ciano */}
      <mesh position={[0, 0.38, 0.1]}>
        <boxGeometry args={[0.75, 0.32, 1.1]} />
        <meshPhysicalMaterial
          color="#00f0ff"
          emissive="#00f0ff"
          emissiveIntensity={0.6}
          transmission={0.4}
          roughness={0.1}
          metalness={0.2}
        />
      </mesh>

      {/* Faróis Laser Dianteiros */}
      {[-0.35, 0.35].map((x, i) => (
        <mesh key={i} position={[x, 0.15, 1.06]}>
          <boxGeometry args={[0.12, 0.04, 0.04]} />
          <meshBasicMaterial color="#00f0ff" toneMapped={false} />
        </mesh>
      ))}

      {/* 4 Rotores Basculantes Tilt-Rotor com Anéis */}
      {rotorPositions.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          {/* Suporte da Asa */}
          <mesh position={[-x * 0.2, 0, 0]}>
            <boxGeometry args={[0.35, 0.05, 0.12]} />
            <meshStandardMaterial color="#2a2b30" metalness={0.9} />
          </mesh>
          {/* Anel do Rotor */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.3, 0.025, 12, 24]} />
            <meshStandardMaterial color="#ff5a1f" metalness={0.8} />
          </mesh>
          {/* Pás Giratórias do Rotor */}
          <group ref={(el) => (rotorsRef.current[i] = el!)}>
            <mesh rotation={[0, 0, 0]}>
              <boxGeometry args={[0.55, 0.015, 0.05]} />
              <meshBasicMaterial color="#00f0ff" toneMapped={false} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <boxGeometry args={[0.55, 0.015, 0.05]} />
              <meshBasicMaterial color="#00f0ff" toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Propulsor de Cauda Vetorial */}
      <mesh position={[0, 0.15, -1.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 0.2, 16]} />
        <meshBasicMaterial
          color={isBoosting ? "#ffffff" : "#00f0ff"}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        ref={thrusterGlow}
        position={[0, 0.15, -1.3]}
        color={isBoosting ? "#ffffff" : "#00f0ff"}
        intensity={isBoosting ? 6 : 3}
        distance={3}
      />
      <Sparkles
        count={isBoosting ? 50 : 25}
        scale={[0.6, 0.6, 0.8]}
        size={isBoosting ? 3 : 2}
        color={isBoosting ? "#38bdf8" : "#00f0ff"}
        speed={isBoosting ? 8 : 4}
      />
    </group>
  );
}

// ---------------------------------------------------------------------
// Cena Interna R3F: Imersão Dupla (Atmosfera de Marte vs Espaço Interplanetário)
// ---------------------------------------------------------------------
function FlightScene({
  vehicle,
  cameraMode,
  isBoosting,
  isActualFlight,
  currentSpeed,
  destinationPlanet,
}: {
  vehicle: Vehicle;
  cameraMode: "chase" | "cockpit" | "orbit";
  isBoosting: boolean;
  isActualFlight: boolean;
  currentSpeed: number;
  destinationPlanet: "earth" | "phobos" | "europa";
}) {
  const isMoving = isActualFlight || isBoosting;
  const isStarship = vehicle.category === "interplanetary_rocket";
  const marsTex = useMemo(makeMarsSurfaceTexture, []);
  const craftGroupRef = useRef<THREE.Group>(null);

  // Efeito dinâmico de oscilação giroscópica e controle de câmera
  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    if (craftGroupRef.current) {
      const shake = isBoosting ? (Math.random() - 0.5) * 0.016 : 0;
      craftGroupRef.current.position.y = 0.06 * Math.sin(t * 1.8) + shake;
      craftGroupRef.current.rotation.z = 0.04 * Math.sin(t * 1.2) + shake * 0.4;
      craftGroupRef.current.rotation.x = -0.02 + 0.02 * Math.cos(t * 1.5);
    }

    // Configuração de Câmeras Dinâmicas
    if (cameraMode === "chase") {
      const targetPos = isBoosting
        ? new THREE.Vector3(0, 1.0, 3.4)
        : new THREE.Vector3(0, 1.05, 3.0);
      state.camera.position.lerp(targetPos, 0.08);
      state.camera.lookAt(0, 0.25, -6.0);
    } else if (cameraMode === "cockpit") {
      state.camera.position.lerp(new THREE.Vector3(0, 0.42, -0.2), 0.1);
      state.camera.lookAt(0, 0.35, -15.0);
    }
  });

  return (
    <>
      <ambientLight intensity={isStarship ? 0.3 : 0.6} />
      <directionalLight position={[6, 4, 3]} intensity={2.6} color="#ffe2cc" />
      <directionalLight position={[-4, -2, -2]} intensity={0.5} color="#00f0ff" />
      <Stars radius={90} depth={50} count={isStarship ? 4500 : 2500} factor={4} fade speed={0.4} />

      {/* AMBIENTE 1: VOO ATMOSFÉRICO EM MARTE COM BARREIRAS ANTI-TEMPESTADE */}
      {!isStarship && (
        <>
          <fog attach="fog" args={["#160804", 16, 58]} />
          <StormDefenseBarrierCorridor isBoosting={isBoosting} isMoving={isMoving} />
          <MartianSurfaceAtmosphere isMoving={isMoving} isBoosting={isBoosting} />
        </>
      )}

      {/* AMBIENTE 2: VIAGEM ESPACIAL INTERPLANETÁRIA (STARSHIPS SSH-S1/S2) */}
      {isStarship && (
        <>
          {/* Fibras de velocidade da luz / dobra no Turbo Boost */}
          <WarpStarStreaks active={isBoosting} />

          {/* Marte ficando para trás na popa */}
          <MarsAftView marsTex={marsTex} />

          {/* Sistema Planetário de Destino na Frente (Terra, Fobos ou Europa) */}
          <DestinationCelestialSystem3D destination={destinationPlanet} />
        </>
      )}

      {/* Nave 3D Centralizada no Percurso */}
      <group ref={craftGroupRef} position={[0, 0, 0]}>
        <FlightCraftModel
          category={vehicle.category}
          callsign={vehicle.callsign}
          name={vehicle.name}
          speedKmh={currentSpeed}
          isBoosting={isBoosting}
        />
      </group>

      {cameraMode === "orbit" && (
        <OrbitControls enablePan={false} minDistance={1.8} maxDistance={8} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// Componente Modal/Painel: Acompanhar Nave em 3D no Percurso
// ---------------------------------------------------------------------
export function FlightChaseViewer3D({
  vehicle,
  allVehicles,
  hangars,
  onClose,
  onSelectVehicle,
  onNavigateHangar,
}: {
  vehicle: Vehicle;
  allVehicles: Vehicle[];
  hangars: Hangar[];
  onClose: () => void;
  onSelectVehicle?: (v: Vehicle) => void;
  onNavigateHangar?: (v: Vehicle) => void;
}) {
  let navigate: ReturnType<typeof useNavigate> | null = null;
  try {
    navigate = useNavigate();
  } catch {
    navigate = null;
  }
  const [cameraMode, setCameraMode] = useState<"chase" | "cockpit" | "orbit">("chase");
  const [isBoosting, setIsBoosting] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [destinationPlanet, setDestinationPlanet] = useState<"earth" | "phobos" | "europa">("earth");

  const synthRef = useRef<SpaceSynthEngine | null>(null);

  useEffect(() => {
    synthRef.current = new SpaceSynthEngine();
    return () => {
      synthRef.current?.stop();
    };
  }, []);

  const toggleAudio = () => {
    if (!synthRef.current) return;
    if (!audioEnabled) {
      synthRef.current.start();
      setAudioEnabled(true);
    } else {
      synthRef.current.stop();
      setAudioEnabled(false);
    }
  };

  const handleBoostToggle = () => {
    const next = !isBoosting;
    setIsBoosting(next);
    if (audioEnabled && synthRef.current) {
      synthRef.current.setBoost(next);
    }
  };

  const handleGoToGarage = (targetVehicle: Vehicle) => {
    onClose();
    if (onNavigateHangar) {
      onNavigateHangar(targetVehicle);
    } else if (navigate) {
      navigate({ to: "/app/hangar-3d", search: { vehicleId: targetVehicle.id } });
    } else if (typeof window !== "undefined") {
      window.location.href = `/app/hangar-3d?vehicleId=${targetVehicle.id}`;
    }
  };

  const handleSelectVehicleFromList = (targetVehicle: Vehicle) => {
    const isStationary =
      targetVehicle.status !== "in_flight" || (targetVehicle.speed_kmh || 0) <= 0;

    if (isStationary) {
      handleGoToGarage(targetVehicle);
    } else {
      onSelectVehicle?.(targetVehicle);
    }
  };

  const currentHangar = hangars.find((h) => h.id === vehicle.hangar_id);
  const destHangar =
    hangars.find((h) => h.id !== vehicle.hangar_id) || hangars[0];

  const CategoryIcon =
    vehicle.category === "car_vtol" ? Plane : vehicle.category === "space_truck" ? Truck : Rocket;

  const isStarship = vehicle.category === "interplanetary_rocket";
  const isActualFlight = vehicle.status === "in_flight" && (vehicle.speed_kmh || 0) > 0;
  const defaultCruiseSpeed = isStarship ? 14200 : vehicle.category === "car_vtol" ? 640 : 220;
  const currentSpeed = isActualFlight
    ? (vehicle.speed_kmh || defaultCruiseSpeed) * (isBoosting ? 1.6 : 1.0)
    : (isBoosting ? defaultCruiseSpeed : 0);
  const machNumber = (currentSpeed / 860).toFixed(1);

  // Separar naves em voo ativo e naves paradas na garagem
  const inFlightVehicles = allVehicles.filter(
    (v) => v.status === "in_flight" && (v.speed_kmh || 0) > 0,
  );
  const hangarVehicles = allVehicles.filter(
    (v) => v.status !== "in_flight" || (v.speed_kmh || 0) <= 0,
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#07080c]/95 backdrop-blur-xl animate-in fade-in duration-200">
      {/* HUD Header Superior */}
      <header className="flex shrink-0 items-center justify-between border-b border-border/80 bg-surface/90 px-6 py-4 font-mono text-xs">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded border border-telemetry/60 bg-telemetry/15 text-telemetry shadow-[0_0_20px_rgba(34,211,238,0.3)]">
            <CategoryIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold text-foreground">{vehicle.name}</span>
              <span className="rounded bg-primary/20 px-2 py-0.5 text-[10px] text-primary font-bold">
                {vehicle.callsign}
              </span>
              <span className="rounded bg-telemetry/15 px-2 py-0.5 text-[10px] text-telemetry">
                {categoryLabel[vehicle.category]}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isStarship
                ? `CRUZEIRO INTERPLANETÁRIO DE ESCAPE · MARTE ➔ ${destinationPlanet === "earth" ? "TERRA (SOL-III)" : destinationPlanet === "phobos" ? "FOBOS" : "EUROPA"} · MACH ${machNumber}`
                : isActualFlight
                  ? `TELEMETRIA ORBITAL DE PERCURSO EM TEMPO REAL · SOL 4.218 · MACH ${machNumber}`
                  : `SIMULAÇÃO DE TESTE DE VOO E HOMOLOGAÇÃO · STATUS: ${statusLabel[vehicle.status]?.toUpperCase()} · MACH ${machNumber}`}
            </p>
          </div>
        </div>

        {/* Controles de Câmera e Ações 3D */}
        <div className="hidden sm:flex items-center gap-2 border border-border/60 bg-background/60 p-1">
          {[
            { id: "chase", label: "Chase Cam (Traseira)" },
            { id: "cockpit", label: "Cockpit HUD (Asa)" },
            { id: "orbit", label: "Inspeção Livre 360°" },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setCameraMode(c.id as any)}
              className={`px-3 py-1.5 uppercase transition ${
                cameraMode === c.id
                  ? "border border-telemetry/80 bg-telemetry/20 text-telemetry font-bold shadow-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Botão de Áudio e Fechar */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleAudio}
            title={audioEnabled ? "Silenciar áudio dos propulsores" : "Ativar áudio dos propulsores"}
            className={`flex items-center gap-1.5 border px-3 py-2 uppercase transition font-mono text-xs ${
              audioEnabled
                ? "border-telemetry/80 bg-telemetry/20 text-telemetry shadow-glow"
                : "border-border/80 text-muted-foreground hover:text-foreground"
            }`}
          >
            {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            <span className="hidden md:inline">{audioEnabled ? "Áudio ON" : "Áudio OFF"}</span>
          </button>

          <button
            onClick={onClose}
            className="cut-corner flex items-center gap-1.5 border border-border/80 px-4 py-2 uppercase hover:border-destructive hover:text-destructive transition font-mono text-xs"
          >
            <X className="h-4 w-4" />
            <span>Fechar</span>
          </button>
        </div>
      </header>

      {/* Canvas 3D Principal */}
      <div className="relative flex-1">
        <Canvas camera={{ position: [0, 1.25, 3.8], fov: 45 }} dpr={[1, 1.5]}>
          <color attach="background" args={[isStarship ? "#020306" : "#0d0604"]} />
          <FlightScene
            vehicle={vehicle}
            cameraMode={cameraMode}
            isBoosting={isBoosting}
            isActualFlight={isActualFlight}
            currentSpeed={currentSpeed}
            destinationPlanet={destinationPlanet}
          />
        </Canvas>

        {/* Overlay HUD Telemetria Aeroespacial (Esquerda) */}
        <div className="pointer-events-none absolute left-6 top-6 space-y-3 font-mono text-xs">
          <div className="glass pointer-events-auto border-l-2 border-l-telemetry p-4 shadow-2xl backdrop-blur-md min-w-[280px]">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-telemetry font-bold flex items-center gap-1.5">
                <Navigation className="h-3.5 w-3.5" /> DIRETOR DE VOO
              </span>
              <span className={`text-[10px] font-bold ${isActualFlight ? "text-emerald-400" : isBoosting ? "text-telemetry" : "text-amber-400"}`}>
                {isActualFlight ? "VOO ATIVO" : isBoosting ? "TESTE TURBO" : "DOCADA NO HANGAR"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3">
              <div>
                <span className="text-[10px] text-muted-foreground block">VELOCIDADE</span>
                <p className="font-display text-xl font-bold text-foreground">
                  {Math.round(currentSpeed).toLocaleString("pt-BR")}{" "}
                  <span className="text-xs font-mono font-normal">km/h</span>
                </p>
                <span className="text-[10px] text-telemetry">MACH {machNumber}</span>
              </div>

              <div>
                <span className="text-[10px] text-muted-foreground block">ALTITUDE</span>
                <p className="font-display text-xl font-bold text-primary">
                  {isStarship
                    ? (isBoosting ? "58.420" : "12.850")
                    : (vehicle.altitude_km || 2.4).toFixed(1)}{" "}
                  <span className="text-xs font-mono font-normal">km</span>
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {isStarship ? "INTERPLANETÁRIA" : "SUB-ORBITAL"}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-muted-foreground block">BATERIA GRAFENO</span>
                <p className="font-bold text-emerald-400">{vehicle.battery_pct}%</p>
              </div>

              <div>
                <span className="text-[10px] text-muted-foreground block">FILTRO SÍLICA</span>
                <p className="font-bold text-foreground">{vehicle.dust_filter_pct}%</p>
              </div>

              <div>
                <span className="text-[10px] text-muted-foreground block">CABINE</span>
                <p className="font-bold text-foreground">{vehicle.cabin_pressure_kpa ?? 101.3} kPa</p>
              </div>

              <div>
                <span className="text-[10px] text-muted-foreground block">SUPORTE O₂</span>
                <p className="font-bold text-telemetry">{vehicle.o2_hours}h</p>
              </div>
            </div>

            <div className="mt-3 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
              COORD AREOGRÁFICA: {vehicle.lat.toFixed(3)}°N · {vehicle.lng.toFixed(3)}°E
            </div>

            {/* Status da Barreira Eletromagnética de Tempestade */}
            <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-[10px]">
              <span className="text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> BARREIRA DE TEMPESTADE:
              </span>
              <span className="text-emerald-400 font-bold">ATIVA (CAMPO DEFLETOR)</span>
            </div>

            {/* Botão de Aceleração / Turbo */}
            <div className="mt-3 border-t border-border/40 pt-3">
              <button
                type="button"
                onClick={handleBoostToggle}
                className={`w-full py-2.5 px-3 uppercase tracking-wider font-bold transition flex items-center justify-center gap-2 ${
                  isBoosting
                    ? "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(255,90,31,0.6)] animate-pulse"
                    : "border border-primary/60 bg-primary/10 text-primary hover:bg-primary/20"
                }`}
              >
                <Flame className={`h-4 w-4 ${isBoosting ? "animate-bounce" : ""}`} />
                <span>{isBoosting ? "🔥 TURBO ATIVO (+60%)" : "⚡ ATIVAR TURBO PLASMA"}</span>
              </button>
            </div>
          </div>

          {/* Rota, Destino & Seletor de Planeta Destino */}
          <div className="glass pointer-events-auto p-3.5 font-mono text-xs border border-border/60">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-primary uppercase tracking-widest font-bold">
                ITINERÁRIO DA NAVE
              </span>
              <span className="rounded bg-telemetry/15 px-1.5 py-0.5 text-[9px] text-telemetry font-bold">
                {isStarship ? "ROTA HOHMANN" : "CORREDOR ATMOSFÉRICO"}
              </span>
            </div>

            <p className="mt-1 font-semibold text-foreground">
              {isStarship
                ? `Olympus Mons Starport → ${
                    destinationPlanet === "earth"
                      ? "Terra (Sol-III · LEO)"
                      : destinationPlanet === "phobos"
                        ? "Fobos (Base Orbital)"
                        : "Europa (Júpiter IV)"
                  }`
                : `${currentHangar?.name ?? "Olympus Mons"} → ${destHangar?.name ?? "Jezero Base"}`}
            </p>

            {/* Seletor de Destinos Interplanetários (Apenas Foguetes Starship) */}
            {isStarship && (
              <div className="mt-2.5 border-t border-border/40 pt-2">
                <span className="text-[9px] text-muted-foreground uppercase block mb-1.5">
                  SELECIONAR DESTINO PLANETÁRIO:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "earth", label: "🌍 Terra", dist: "54.6M km" },
                    { id: "phobos", label: "🌑 Fobos", dist: "9.3k km" },
                    { id: "europa", label: "🪐 Europa", dist: "588M km" },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDestinationPlanet(d.id as any)}
                      className={`p-1.5 text-center border transition ${
                        destinationPlanet === d.id
                          ? "border-telemetry bg-telemetry/20 text-telemetry font-bold shadow-glow"
                          : "border-border/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="font-bold text-[10px]">{d.label}</div>
                      <div className="text-[8px] opacity-75">{d.dist}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2.5 h-1.5 w-full rounded bg-surface overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-telemetry w-3/5 animate-pulse" />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{isStarship ? "Escape Marciano: Ok" : "Decolagem: Ok"}</span>
              <span className="text-telemetry font-bold">
                {isStarship
                  ? destinationPlanet === "earth"
                    ? (isBoosting ? "ETA: 62 dias" : "ETA: 184 dias")
                    : destinationPlanet === "phobos"
                      ? (isBoosting ? "ETA: 18 min" : "ETA: 45 min")
                      : (isBoosting ? "ETA: 1.2 anos" : "ETA: 2.8 anos")
                  : "ETA: 48 min marcianos"}
              </span>
            </div>
          </div>
        </div>

        {/* Banner de Aviso de Aeronave Estacionada na Garagem */}
        {!isActualFlight && (
          <div className="pointer-events-auto absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 border border-emerald-500/80 bg-[#070b10]/95 px-5 py-2.5 font-mono text-xs shadow-2xl backdrop-blur-md">
            <Building2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-emerald-300 font-bold uppercase tracking-wider">
              {vehicle.callsign} ESTÁ NA GARAGEM (0 KM/H).
            </span>
            <button
              type="button"
              onClick={() => handleGoToGarage(vehicle)}
              className="cut-corner ml-2 flex items-center gap-1.5 border border-emerald-500 bg-emerald-500/25 px-3 py-1 font-bold uppercase text-emerald-200 hover:bg-emerald-500/45 transition shadow-glow"
            >
              <span>🏢 Ir para a Garagem dos Veículos ➔</span>
            </button>
          </div>
        )}

        {/* Overlay Troca de Nave (Direita) */}
        <div className="pointer-events-none absolute right-6 top-6 space-y-2 font-mono text-xs">
          <div className="glass pointer-events-auto p-4 border border-border/60 min-w-[270px] max-h-[82vh] overflow-y-auto hud-scrollbar shadow-2xl">
            {/* Seção 1: Naves em Voo Ativo */}
            <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-2.5">
              <span className="text-telemetry uppercase tracking-widest text-[10px] font-bold flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 animate-pulse" /> EM VOO ATIVO ({inFlightVehicles.length})
              </span>
            </div>

            <div className="space-y-1.5 mb-4">
              {inFlightVehicles.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic py-1">Nenhuma outra nave em voo.</p>
              ) : (
                inFlightVehicles.map((v) => {
                  const isCurrent = v.id === vehicle.id;
                  const Icon =
                    v.category === "car_vtol" ? Plane : v.category === "space_truck" ? Truck : Rocket;

                  return (
                    <button
                      key={v.id}
                      onClick={() => handleSelectVehicleFromList(v)}
                      className={`flex items-center justify-between w-full p-2 border transition text-left ${
                        isCurrent
                          ? "border-primary bg-primary/20 text-primary font-bold shadow-glow"
                          : "border-border/60 text-muted-foreground hover:border-telemetry/50 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-semibold">{v.callsign}</span>
                      </div>
                      <span className="rounded bg-telemetry/20 px-1.5 py-0.5 text-[9px] text-telemetry font-bold">
                        {Math.round(v.speed_kmh || 640)} km/h
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Seção 2: Naves na Garagem / Hangar */}
            <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-2.5 pt-1">
              <span className="text-emerald-400 uppercase tracking-widest text-[10px] font-bold flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-emerald-400" /> NA GARAGEM ({hangarVehicles.length})
              </span>
              <span className="text-[9px] text-muted-foreground">IR P/ HANGAR ➔</span>
            </div>

            <div className="space-y-1.5">
              {hangarVehicles.map((v) => {
                const Icon =
                  v.category === "car_vtol" ? Plane : v.category === "space_truck" ? Truck : Rocket;

                return (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVehicleFromList(v)}
                    title={`Nave parada. Clicar abrirá a garagem dos veículos (Hangar 3D).`}
                    className="flex items-center justify-between w-full p-2 border border-border/40 text-muted-foreground hover:border-emerald-500/70 hover:bg-emerald-500/10 hover:text-emerald-300 transition text-left group"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0 group-hover:text-emerald-400 transition" />
                      <span className="font-medium truncate">{v.callsign}</span>
                    </div>
                    <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-400 font-bold group-hover:bg-emerald-500/30 transition">
                      GARAGEM ➔
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rodapé / Barra de Status */}
        <div className="pointer-events-none absolute bottom-4 inset-x-6 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          <div className="glass pointer-events-auto px-4 py-2 border border-border/60 flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-telemetry animate-pulse" />
            <span>
              {isStarship
                ? "REDE INTERPLANETÁRIA DEEP SPACE: LINK TERRA-MARTE ATIVO"
                : "LINK ORBITAL ATIVO: JEZERO GROUND CONTROL · CANAL 4"}
            </span>
          </div>

          <div className="glass pointer-events-auto px-4 py-2 border border-border/60 flex items-center gap-2 text-primary font-bold">
            <Zap className="h-3.5 w-3.5" />
            <span>
              {isStarship
                ? `PROPULSÃO RAPTOR VACUUM: ${isBoosting ? "SOBRECARGA METHOX 120%" : "EMPUXO NOMINAL 100%"}`
                : `PROPULSORES VETORIAIS: ${isBoosting ? "SOBRECARGA NOMINAL" : "100% NOMINAIS"}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
