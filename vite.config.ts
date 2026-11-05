// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        name: "strip-r3f-data-tsd-source",
        enforce: "pre",
        transform(code: string, id: string) {
          if (id.includes("node_modules")) return null;
          if (!code.includes("data-tsd-")) return null;
          return {
            code: code
              .replace(/\s+data-tsd-[a-z]+=(?:\{[^}]*\}|"[^"]*"|'[^']*')/g, "")
              .replace(/(["'])data-tsd-[a-z]+\1\s*:\s*(?:\{[^}]*\}|"[^"]*"|'[^']*'|[^,}\n]+),?/g, ""),
            map: null,
          };
        },
      },
    ],
  },
});
