import { describe, it, expect } from "vitest";
import "@/lib/r3f-devtools-patch";
import * as THREE from "three";
import { applyProps } from "@react-three/fiber";

describe("R3F & TanStack DevTools Reconciler Patch", () => {
  it("defines data-tsd-source on Object.prototype to prevent R3F deep property traversal errors", () => {
    expect("data-tsd-source" in Object.prototype).toBe(true);
    expect("data-tsd-id" in Object.prototype).toBe(true);
  });

  it("safely ignores data-tsd-source on THREE.TextureSource without throwing R3F error or corrupting .data", () => {
    const tex = new THREE.Texture();
    // TextureSource has data === null, which previously caused R3F to throw
    expect(tex.source.data).toBeNull();

    expect(() => {
      applyProps(tex.source as any, { "data-tsd-source": "src/components/MyScene.tsx:42:10" });
    }).not.toThrow();

    // Must not corrupt the source data property
    expect(tex.source.data).toBeNull();
  });

  it("safely handles data-tsd-source on THREE.Mesh without throwing R3F error", () => {
    const mesh = new THREE.Mesh();
    expect(() => {
      applyProps(mesh as any, { "data-tsd-source": "src/components/HangarScene.tsx:15:4" });
    }).not.toThrow();
  });
});
