import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** Resolve the desktop source convention (`./module.js`) to TypeScript in tests. */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    specifier.endsWith(".js") &&
    context.parentURL?.startsWith("file:")
  ) {
    const candidate = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    try {
      await access(fileURLToPath(candidate));
      return nextResolve(candidate.href, context);
    } catch {
      // The JavaScript target may be a generated/package file; use normal resolution.
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (/\.(?:ts|mts|tsx)$/.test(url)) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: fileURLToPath(url),
    });
    return { format: "module", source: result.outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
