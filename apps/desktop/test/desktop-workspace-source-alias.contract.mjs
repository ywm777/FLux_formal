import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const viteConfig = readFileSync(resolve(root, "vite.config.ts"), "utf8");

const requirements = [
  [
    "desktop vite config can resolve workspace source paths from the config file",
    /import \{ fileURLToPath,\s*URL \} from "node:url";/,
  ],
  [
    "desktop vite config defines a source path helper",
    /const workspaceSource = \(path: string\) => fileURLToPath\(new URL\(path,\s*import\.meta\.url\)\);/,
  ],
  [
    "desktop vite config aliases @flux/ui to source instead of dist",
    /find:\s*\/\^@flux\\\/ui\$\/[\s\S]*replacement:\s*workspaceSource\("\.\.\/\.\.\/packages\/ui\/src\/index\.ts"\)/,
  ],
  [
    "desktop vite config keeps the ui token css subpath mapped to source css",
    /find:\s*\/\^@flux\\\/ui\\\/tokens\\\.css\$\/[\s\S]*replacement:\s*workspaceSource\("\.\.\/\.\.\/packages\/ui\/src\/tokens\/tokens\.css"\)/,
  ],
  [
    "desktop vite config aliases shared workspace packages to source",
    /find:\s*\/\^@flux\\\/shared\$\/[\s\S]*packages\/shared\/src\/index\.ts[\s\S]*find:\s*\/\^@flux\\\/node-sdk\$\/[\s\S]*packages\/node-sdk\/src\/index\.ts[\s\S]*find:\s*\/\^@flux\\\/workflow-schema\$\/[\s\S]*packages\/workflow-schema\/src\/index\.ts/,
  ],
  [
    "desktop vite config keeps aliasing inside resolve.alias",
    /resolve:\s*\{[\s\S]*alias:\s*\[[\s\S]*@flux\\\/ui[\s\S]*@flux\\\/shared[\s\S]*\][\s\S]*\}/,
  ],
];

const forbidden = [
  [
    "desktop vite config does not point workspace aliases at dist builds",
    /packages\/(?:ui|shared|node-sdk|workflow-schema)\/dist/,
  ],
];

const missing = requirements
  .filter(([, pattern]) => !pattern.test(viteConfig))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern]) => pattern.test(viteConfig))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} desktop workspace source alias requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden desktop workspace alias pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Desktop workspace source alias contract passed.");
