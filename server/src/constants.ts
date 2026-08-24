export const VERSION = "1.1.3";
export const SCHEMA_VERSION = "1.1";

export const ABSTRACTION_LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;
export const CLAIM_TYPES = ["fact", "inference", "unknown", "conflict"] as const;
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export const UNKNOWN_CLASSIFICATIONS = ["blocking", "non_blocking", "deferred"] as const;

export const ASSET_TYPES = [
  "goal",
  "slice",
  "evidence",
  "unknown",
  "session",
  "round",
  "learning_asset",
  "atlas_node",
  "atlas_edge",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_FOLDERS: Record<AssetType, string> = {
  goal: "goals",
  slice: "slices",
  evidence: "evidence",
  unknown: "unknowns",
  session: "sessions",
  round: "rounds",
  learning_asset: "assets",
  atlas_node: "atlas/nodes",
  atlas_edge: "atlas/edges",
};

export const PERSONAL_FOLDERS = ["sessions", "rounds", "journal", "checkpoints", "runtime"] as const;

export const ATLAS_NODE_TYPES = [
  "system_area",
  "learning_slice",
  "learning_asset",
  "concept",
  "code_entity",
  "data_object",
  "state",
  "boundary",
  "external_system",
] as const;

export const ATLAS_EDGE_TYPES = [
  "PART_OF",
  "PRECEDES",
  "PRODUCES",
  "CONSUMES",
  "TRANSFORMS",
  "DEPENDS_ON",
  "IMPLEMENTS",
  "OBSERVED_IN",
  "LEARNED_THROUGH",
  "CONNECTS_TO",
  "CONTRADICTS",
  "REFINES",
  "SUPERSEDES",
  "EXPLAINS",
  "SHARES_CONCEPT_WITH",
] as const;
