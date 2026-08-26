import { existsSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { WorkspaceStore } from "./storage.js";

/** 从 startDir 向上找最近的 .ioayn 工作区；找不到返回 null。语义与 scripts/capture-hook.mjs 的 findWorkspace 一致。 */
export function findWorkspace(startDir: string): string | null {
  let current = resolve(startDir);
  const root = parse(current).root;
  for (;;) {
    if (existsSync(join(current, ".ioayn"))) return join(current, ".ioayn");
    if (current === root) return null;
    current = dirname(current);
  }
}

/** 按根目录实例化 store（工厂化：替代 import 时固化的模块级单例）。 */
export function createStore(rootDir: string): WorkspaceStore {
  return new WorkspaceStore(resolve(rootDir));
}
