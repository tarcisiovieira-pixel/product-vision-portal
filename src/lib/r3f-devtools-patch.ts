import * as THREE from "three";

/**
 * R3F / TanStack DevTools Reconciler Compatibility Patch
 *
 * TanStack DevTools automatically injects `data-tsd-source` and `data-tsd-id`
 * onto all JSX elements in development mode.
 *
 * When these attributes are passed to React Three Fiber (<Canvas>), R3F attempts
 * to resolve hyphenated props as deep property traversal (e.g. data.tsd.source).
 * For objects whose .data property is null or a primitive (such as THREE.TextureSource.data),
 * R3F crashes with:
 * "R3F: Cannot set 'data-tsd-source'. Ensure it is an object before setting 'tsd-source'."
 *
 * In R3F's reconciler, if the full hyphenated key exists in the target object
 * (`if (key in root)`), R3F bypasses deep property traversal and assigns it directly.
 * By defining these properties on Object.prototype and Three.js core prototypes,
 * `key in root` returns true for all Three.js instances and prevents R3F from throwing.
 */
if (typeof Object.defineProperty === "function") {
  const devtoolsProps = [
    "data-tsd-source",
    "data-tsd-id",
    "data-tsd",
    "data-source",
    "data-inspector-line",
    "data-inspector-column",
    "data-inspector-relative-path",
  ];

  for (const prop of devtoolsProps) {
    if (!(prop in Object.prototype)) {
      try {
        Object.defineProperty(Object.prototype, prop, {
          value: undefined,
          writable: true,
          configurable: true,
          enumerable: false,
        });
      } catch {
        // ignore if frozen
      }
    }
  }

  // Ensure Three.js Object3D, BufferGeometry, Material satisfy both direct prop and .data traversal
  const threePrototypes = [
    THREE.Object3D.prototype,
    THREE.BufferGeometry.prototype,
    THREE.Material.prototype,
  ];

  for (const proto of threePrototypes) {
    if (proto) {
      for (const prop of devtoolsProps) {
        if (!(prop in proto)) {
          try {
            Object.defineProperty(proto, prop, {
              value: undefined,
              writable: true,
              configurable: true,
              enumerable: false,
            });
          } catch {}
        }
      }
      if (!("data" in proto)) {
        try {
          Object.defineProperty(proto, "data", {
            get() {
              if (!this._r3fDataStore) this._r3fDataStore = {};
              return this._r3fDataStore;
            },
            set(v) {
              this._r3fDataStore = v;
            },
            configurable: true,
            enumerable: false,
          });
        } catch {}
      }
    }
  }
}
