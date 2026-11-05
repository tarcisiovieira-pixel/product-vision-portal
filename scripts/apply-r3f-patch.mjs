import fs from "node:fs";
import path from "node:path";

const patchDir = path.resolve("node_modules/.pnpm_patches/@react-three/fiber@9.8.2/dist");
const files = [
  "events-0dab3c53.cjs.dev.js",
  "events-98e95d43.cjs.prod.js",
  "events-e51d7528.esm.js",
];

for (const f of files) {
  const filePath = path.join(patchDir, f);
  if (!fs.existsSync(filePath)) {
    console.warn("File not found:", filePath);
    continue;
  }
  let content = fs.readFileSync(filePath, "utf8");

  // 1. getInstanceProps: filter out data- attributes
  content = content.replace(
    /if\s*\(!REACT_INTERNAL_PROPS\.includes\(key\)\)\s*props\[key\]\s*=\s*pendingProps\[key\];/,
    "if (!REACT_INTERNAL_PROPS.includes(key) && !key.startsWith('data-')) props[key] = pendingProps[key];",
  );

  // 2. applyProps & diffProps: ignore any prop starting with data-
  content = content.replaceAll(
    /if\s*\(RESERVED_PROPS\.includes\(prop\)\)\s*continue;/g,
    "if (RESERVED_PROPS.includes(prop) || (typeof prop === 'string' && prop.startsWith('data-'))) continue;",
  );

  // 3. resolve(): do not attempt deep traversal on data- attributes
  content = content.replace(
    /function resolve\(root, key\)\s*\{/,
    "function resolve(root, key) {\n  if (typeof key === 'string' && key.startsWith('data-')) return { root, key, target: undefined };",
  );

  // 4. applyProps throw check: never throw if prop starts with data-
  content = content.replace(
    /if\s*\(target === undefined && \(typeof root !== 'object' \|\| root === null\)\)\s*\{/,
    "if (target === undefined && (typeof root !== 'object' || root === null) && (!prop || !prop.startsWith('data-'))) {",
  );

  fs.writeFileSync(filePath, content, "utf8");
  console.log("Successfully patched:", f);
}
