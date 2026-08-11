import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "src");
const sourceFiles = [];

function collectSourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    if (statSync(path).isDirectory()) {
      collectSourceFiles(path);
      continue;
    }
    if (/\.(css|ts|tsx)$/.test(entry)) sourceFiles.push(path);
  }
}

collectSourceFiles(sourceRoot);

const violations = [];
for (const file of sourceFiles) {
  const source = readFileSync(file, "utf8");
  source.split(/\r?\n/).forEach((line, index) => {
    if (!/\bletterSpacing\s*:/.test(line)) return;
    const value = line.match(/\bletterSpacing\s*:\s*([^,}]+)/)?.[1]?.trim();
    if (value === "0" || value === '"0"' || value === "'0'") return;
    violations.push(`${file}:${index + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error("Typography style contract found non-zero letterSpacing:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Typography style contract passed.");
