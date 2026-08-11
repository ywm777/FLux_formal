import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

/** 工作区数据根目录（默认 monorepo 根下的 data/，可用 FLUX_DATA_DIR 覆盖） */
export function resolveDataDir(): string {
  const configured = process.env.FLUX_DATA_DIR?.trim();
  if (configured) return resolve(configured);
  const fromApi = resolve(process.cwd(), "../../data");
  if (existsSync(fromApi)) return fromApi;
  return resolve(process.cwd(), "data");
}

export function dataPath(...segments: string[]): string {
  const dir = resolveDataDir();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, ...segments);
  mkdirSync(dirname(file), { recursive: true });
  return file;
}

export function readJsonFile<T>(file: string, fallback: T): T {
  const backup = `${file}.bak`;
  if (!existsSync(file) && !existsSync(backup)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (primaryError) {
    if (existsSync(backup)) {
      try {
        return JSON.parse(readFileSync(backup, "utf8")) as T;
      } catch (backupError) {
        throw new Error(
          `工作区数据与备份均无法读取：${String(primaryError)}；${String(backupError)}`,
        );
      }
    }
    throw new Error(`工作区数据无法读取：${String(primaryError)}`);
  }
}

export function writeJsonFile(file: string, data: unknown): void {
  const temporary = `${file}.tmp`;
  const backup = `${file}.bak`;
  const serialized = JSON.stringify(data, null, 2);
  if (serialized === undefined) {
    throw new Error("工作区数据无法序列化");
  }
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, "w");
    writeFileSync(descriptor, serialized, "utf8");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }

  if (existsSync(file)) copyFileSync(file, backup);
  try {
    // Windows 不允许 rename 覆盖已有目标；删除与 rename 之间由 .bak 提供恢复点。
    if (existsSync(file)) rmSync(file);
    renameSync(temporary, file);
  } catch (error) {
    if (existsSync(backup)) copyFileSync(backup, file);
    if (existsSync(temporary)) rmSync(temporary);
    throw error;
  }
}
