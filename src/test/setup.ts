import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom não implementa Canvas 2D; devolve um contexto falso para texturas procedurais.
const fakeCtx2d = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === "canvas") return document.createElement("canvas");
      if (prop === "createImageData" || prop === "getImageData") {
        return (w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        });
      }
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return () => ({ addColorStop: () => {} });
      }
      return () => {};
    },
    set: () => true,
  },
);
HTMLCanvasElement.prototype.getContext = function getContext(type: string) {
  return type === "2d" ? (fakeCtx2d as unknown as CanvasRenderingContext2D) : null;
} as typeof HTMLCanvasElement.prototype.getContext;
