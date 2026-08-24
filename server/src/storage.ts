import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  ASSET_FOLDERS,
  ASSET_TYPES,
  PERSONAL_FOLDERS,
  SCHEMA_VERSION,
  type AssetType,
} from "./constants.js";
import { idSchema, manifestSchema, schemaMap, type ConversationTurn } from "./schemas.js";

export interface ProjectSnapshot {
  project_root: string;
  git_root?: string;
  is_git_repository: boolean;
  branch: string;
  commit: string;
  /** Product/source files changed, excluding .ioayn knowledge assets. */
  dirty: boolean;
  /** Any Git working-tree change, including .ioayn. */
  workspace_dirty: boolean;
  /** Changes only inside .ioayn. */
  knowledge_dirty: boolean;
  captured_at: string;
}

export class WorkspaceStore {
  readonly rootDir: string;
  readonly canonicalRoot: string;
  readonly workspaceDir: string;

  constructor(root: string) {
    this.rootDir = resolve(root);
    if (!existsSync(this.rootDir) || !statSync(this.rootDir).isDirectory()) {
      throw new Error(`IOAYN_PROJECT_DIR is not a directory: ${this.rootDir}`);
    }
    this.canonicalRoot = realpathSync(this.rootDir);
    this.workspaceDir = join(this.canonicalRoot, ".ioayn");
  }

  now(): string {
    return new Date().toISOString();
  }

  slug(input: string): string {
    const value = input
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return value || `item-${this.shortHash(input)}`;
  }

  shortHash(input: string): string {
    return createHash("sha256").update(input).digest("hex").slice(0, 10);
  }

  private git(args: string[]): string | null {
    try {
      return execFileSync("git", args, {
        cwd: this.canonicalRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 10_000,
      }).trim();
    } catch {
      return null;
    }
  }

  getSnapshot(): ProjectSnapshot {
    const topLevel = this.git(["rev-parse", "--show-toplevel"]);
    if (!topLevel) {
      return {
        project_root: this.canonicalRoot,
        is_git_repository: false,
        branch: "NO_GIT",
        commit: "NO_GIT_REPOSITORY",
        dirty: false,
        workspace_dirty: false,
        knowledge_dirty: false,
        captured_at: this.now(),
      };
    }
    const branch = this.git(["branch", "--show-current"]) || "DETACHED_HEAD";
    const commit = this.git(["rev-parse", "HEAD"]) || "UNKNOWN_COMMIT";
    const status = this.git(["status", "--porcelain=v1"]);
    const sourceStatus = this.git([
      "status",
      "--porcelain=v1",
      "--",
      ".",
      ":(exclude).ioayn",
      ":(exclude).ioayn/**",
    ]);
    const knowledgeStatus = this.git(["status", "--porcelain=v1", "--", ".ioayn"]);
    return {
      project_root: this.canonicalRoot,
      git_root: resolve(topLevel),
      is_git_repository: true,
      branch,
      commit,
      dirty: Boolean(sourceStatus),
      workspace_dirty: Boolean(status),
      knowledge_dirty: Boolean(knowledgeStatus),
      captured_at: this.now(),
    };
  }

  revision(snapshot: ProjectSnapshot = this.getSnapshot()) {
    return { branch: snapshot.branch, commit: snapshot.commit, dirty: snapshot.dirty };
  }

  changedSourceFiles(fromCommit: string, toCommit: string): string[] | null {
    if (!fromCommit || !toCommit || fromCommit === toCommit) return [];
    const output = this.git([
      "diff",
      "--name-only",
      fromCommit,
      toCommit,
      "--",
      ".",
      ":(exclude).ioayn",
      ":(exclude).ioayn/**",
    ]);
    if (output === null) return null;
    return output.split(/\r?\n/).filter(Boolean);
  }

  ensureWorkspace(): void {
    mkdirSync(this.workspaceDir, { recursive: true });
    for (const folder of Object.values(ASSET_FOLDERS)) {
      mkdirSync(join(this.workspaceDir, folder), { recursive: true });
    }
    for (const folder of PERSONAL_FOLDERS) {
      mkdirSync(join(this.workspaceDir, folder), { recursive: true });
    }
    mkdirSync(join(this.workspaceDir, "runtime", "transactions"), { recursive: true });
    this.ensureWorkspaceGitignore();

    const manifestPath = join(this.workspaceDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      const snapshot = this.getSnapshot();
      const projectId = `${this.slug(basename(this.canonicalRoot)).slice(0, 55)}-${this.shortHash(this.canonicalRoot)}`;
      this.atomicWriteJson(manifestPath, {
        schema_version: SCHEMA_VERSION,
        project_id: projectId,
        project_root: ".",
        created_at: this.now(),
        updated_at: this.now(),
        current_goal_id: null,
        current_session_id: null,
        initialized_revision: {
          branch: snapshot.branch,
          commit: snapshot.commit,
          dirty: snapshot.dirty,
          is_git_repository: snapshot.is_git_repository,
          captured_at: snapshot.captured_at,
        },
        capabilities: {
          persistent_memory: true,
          automatic_journal_capture: true,
          cognitive_atlas: true,
          recoverable_round_commit: true,
        },
      });
    }
  }

  private ensureWorkspaceGitignore(): void {
    const path = join(this.workspaceDir, ".gitignore");
    const content = [
      "# IOAYN personal learning journal and runtime state",
      "journal/",
      "sessions/",
      "rounds/",
      "checkpoints/",
      "runtime/",
      "*.tmp-*",
      "*.bak-*",
      "",
    ].join("\n");
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      writeFileSync(path, content, "utf8");
    }
  }

  manifest(): Record<string, unknown> {
    this.ensureWorkspace();
    return this.readJson(join(this.workspaceDir, "manifest.json")) as Record<string, unknown>;
  }

  manifestVersion(): string {
    const value = this.manifest();
    return String(value.schema_version || "unknown");
  }

  updateManifest(patch: Record<string, unknown>): void {
    const current = this.manifest();
    const next = { ...current, ...patch, updated_at: this.now() };
    manifestSchema.parse(next);
    this.atomicWriteJson(join(this.workspaceDir, "manifest.json"), next);
  }

  atomicWriteJson(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temp, path);
  }

  appendJsonLine(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
  }

  readJson(path: string): unknown {
    return JSON.parse(readFileSync(path, "utf8"));
  }

  readJsonLines(path: string): unknown[] {
    if (!existsSync(path)) return [];
    return readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  assetPath(type: AssetType, id: string): string {
    idSchema.parse(id);
    this.ensureWorkspace();
    return join(this.workspaceDir, ASSET_FOLDERS[type], `${id}.json`);
  }

  saveAsset<T extends AssetType>(type: T, value: unknown): unknown {
    const parsed = schemaMap[type].parse(value);
    this.atomicWriteJson(this.assetPath(type, parsed.id), parsed);
    return parsed;
  }

  getAsset<T extends AssetType>(type: T, id: string): unknown | null {
    const path = this.assetPath(type, id);
    return existsSync(path) ? this.readJson(path) : null;
  }

  listAssets(type?: AssetType): Record<string, unknown[]> {
    this.ensureWorkspace();
    const types = type ? [type] : [...ASSET_TYPES];
    const result: Record<string, unknown[]> = {};
    for (const currentType of types) {
      const directory = join(this.workspaceDir, ASSET_FOLDERS[currentType]);
      result[currentType] = existsSync(directory)
        ? readdirSync(directory)
            .filter((name) => name.endsWith(".json"))
            .sort()
            .map((name) => this.readJson(join(directory, name)))
        : [];
    }
    return result;
  }

  appendConversationTurn(turn: ConversationTurn): void {
    const path = this.journalPath(turn.session_id);
    const existing = this.readJsonLines(path) as Array<{ id?: string }>;
    if (existing.some((item) => item.id === turn.id)) return;
    this.appendJsonLine(path, turn);
  }

  journalPath(sessionId: string): string {
    idSchema.parse(sessionId);
    this.ensureWorkspace();
    return join(this.workspaceDir, "journal", `${sessionId}.jsonl`);
  }

  listConversationTurns(sessionId: string): unknown[] {
    return this.readJsonLines(this.journalPath(sessionId));
  }

  activeSessionMarkerPath(): string {
    this.ensureWorkspace();
    return join(this.workspaceDir, "runtime", "active-session.json");
  }

  setActiveSession(sessionId: string | null): void {
    const path = this.activeSessionMarkerPath();
    if (sessionId === null) {
      this.atomicWriteJson(path, { active: false, updated_at: this.now() });
      this.updateManifest({ current_session_id: null });
      return;
    }
    idSchema.parse(sessionId);
    this.atomicWriteJson(path, { active: true, learning_session_id: sessionId, updated_at: this.now() });
    this.updateManifest({ current_session_id: sessionId });
  }

  getActiveSessionId(): string | null {
    const path = this.activeSessionMarkerPath();
    if (!existsSync(path)) return null;
    const marker = this.readJson(path) as { active?: boolean; learning_session_id?: string };
    return marker.active && marker.learning_session_id ? marker.learning_session_id : null;
  }

  knowledgeSummary(): {
    counts: Record<string, number>;
    last_activity_at: string | null;
    last_learning_asset: { id: string; title: string } | null;
  } {
    this.ensureWorkspace();
    const counts: Record<string, number> = {};
    let lastActivityMs = 0;
    for (const type of ASSET_TYPES) {
      const directory = join(this.workspaceDir, ASSET_FOLDERS[type]);
      const names = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith(".json")) : [];
      counts[type] = names.length;
      for (const name of names) {
        try {
          const mtimeMs = statSync(join(directory, name)).mtimeMs;
          if (mtimeMs > lastActivityMs) lastActivityMs = mtimeMs;
        } catch {
          // unreadable entries do not affect the summary
        }
      }
    }
    const assets = (this.listAssets("learning_asset").learning_asset || []) as Array<{
      id: string;
      title: string;
      updated_at: string;
    }>;
    const latestAsset = assets.sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] || null;
    return {
      counts,
      last_activity_at: lastActivityMs ? new Date(lastActivityMs).toISOString() : null,
      last_learning_asset: latestAsset ? { id: latestAsset.id, title: latestAsset.title } : null,
    };
  }

  resetWorkspace(): { removed: Record<string, number> } {
    const removed: Record<string, number> = {};
    const folders = new Set<string>([...Object.values(ASSET_FOLDERS), ...PERSONAL_FOLDERS]);
    for (const folder of folders) {
      const directory = join(this.workspaceDir, folder);
      if (!existsSync(directory)) continue;
      const entries = readdirSync(directory);
      for (const name of entries) {
        rmSync(join(directory, name), { recursive: true, force: true });
      }
      removed[folder.replace(/\//g, "_")] = entries.length;
    }
    this.ensureWorkspace();
    this.updateManifest({ current_goal_id: null, current_session_id: null, updated_at: this.now() });
    return { removed };
  }

  transactionPath(id: string): string {
    idSchema.parse(id);
    this.ensureWorkspace();
    return join(this.workspaceDir, "runtime", "transactions", `${id}.json`);
  }

  teacherIndexPath(): string {
    this.ensureWorkspace();
    return join(this.workspaceDir, "runtime", "teacher-index.json");
  }

  readTeacherIndex(): Record<string, unknown> | null {
    const path = this.teacherIndexPath();
    if (!existsSync(path)) return null;
    try {
      return this.readJson(path) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  writeTeacherIndex(value: Record<string, unknown>): void {
    this.atomicWriteJson(this.teacherIndexPath(), value);
  }

  backfillJournalRoundIds(sessionId: string, roundId: string): number {
    const path = this.journalPath(sessionId);
    if (!existsSync(path)) return 0;
    const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
    let changed = 0;
    const updated = lines.map((line) => {
      try {
        const turn = JSON.parse(line) as { session_id?: string; round_id?: string };
        if (turn && turn.session_id === sessionId && !turn.round_id) {
          turn.round_id = roundId;
          changed += 1;
          return JSON.stringify(turn);
        }
      } catch {
        // malformed lines are preserved untouched
      }
      return line;
    });
    if (changed > 0) writeFileSync(path, `${updated.join("\n")}\n`, "utf8");
    return changed;
  }

  hashPayload(payload: unknown): string {
    const stable = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(stable);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stable(item)]),
        );
      }
      return value;
    };
    return createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
  }

  getTransaction(id: string): Record<string, unknown> | null {
    const path = this.transactionPath(id);
    return existsSync(path) ? (this.readJson(path) as Record<string, unknown>) : null;
  }

  createTransaction(kind: string, id: string, payload: unknown): string {
    const path = this.transactionPath(id);
    const payloadHash = this.hashPayload(payload);
    const existing = existsSync(path) ? (this.readJson(path) as Record<string, unknown>) : null;
    if (existing?.payload_hash && existing.payload_hash !== payloadHash) {
      throw new Error(`transaction ${id} already exists with a different payload`);
    }
    const now = this.now();
    this.atomicWriteJson(path, {
      schema_version: SCHEMA_VERSION,
      id,
      kind,
      status: "prepared",
      created_at: existing?.created_at || now,
      updated_at: now,
      attempt: Number(existing?.attempt || 0) + 1,
      payload_hash: payloadHash,
      payload,
    });
    return path;
  }

  finishTransaction(path: string, result: unknown): void {
    const current = this.readJson(path) as Record<string, unknown>;
    this.atomicWriteJson(path, {
      ...current,
      status: "committed",
      result,
      updated_at: this.now(),
    });
  }

  failTransaction(path: string, error: unknown): void {
    const current = existsSync(path) ? (this.readJson(path) as Record<string, unknown>) : {};
    this.atomicWriteJson(path, {
      ...current,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      updated_at: this.now(),
    });
  }

  backupFile(path: string): string | null {
    if (!existsSync(path)) return null;
    const backup = `${path}.bak-${Date.now()}`;
    copyFileSync(path, backup);
    return backup;
  }
}
