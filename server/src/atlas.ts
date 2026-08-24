import { randomUUID } from "node:crypto";
import type { WorkspaceStore } from "./storage.js";
import type { AtlasEdge, AtlasNode } from "./schemas.js";
import { atlasEdgeSchema, atlasNodeSchema } from "./schemas.js";
import { SCHEMA_VERSION } from "./constants.js";

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function mergeNode(existing: AtlasNode | null, incoming: AtlasNode): AtlasNode {
  if (!existing) return incoming;
  return atlasNodeSchema.parse({
    ...existing,
    ...incoming,
    description: incoming.description || existing.description,
    tags: unique([...(existing.tags || []), ...(incoming.tags || [])]),
    evidence_refs: unique([...(existing.evidence_refs || []), ...(incoming.evidence_refs || [])]),
    unknown_refs: unique([...(existing.unknown_refs || []), ...(incoming.unknown_refs || [])]),
    created_at: existing.created_at,
    updated_at: incoming.updated_at,
  });
}

function mergeEdge(existing: AtlasEdge | null, incoming: AtlasEdge): AtlasEdge {
  if (!existing) return incoming;
  return atlasEdgeSchema.parse({
    ...existing,
    ...incoming,
    evidence_refs: unique([...(existing.evidence_refs || []), ...(incoming.evidence_refs || [])]),
    created_at: existing.created_at,
    updated_at: incoming.updated_at,
  });
}

export function upsertAtlasNode(store: WorkspaceStore, input: Omit<AtlasNode, "schema_version" | "created_at" | "updated_at">): AtlasNode {
  const current = store.getAsset("atlas_node", input.id) as AtlasNode | null;
  const now = store.now();
  const next = atlasNodeSchema.parse({
    schema_version: SCHEMA_VERSION,
    ...input,
    created_at: current?.created_at || now,
    updated_at: now,
  });
  const merged = mergeNode(current, next);
  return store.saveAsset("atlas_node", merged) as AtlasNode;
}

export function upsertAtlasEdge(store: WorkspaceStore, input: Omit<AtlasEdge, "schema_version" | "created_at" | "updated_at">): AtlasEdge {
  const current = store.getAsset("atlas_edge", input.id) as AtlasEdge | null;
  const now = store.now();
  const next = atlasEdgeSchema.parse({
    schema_version: SCHEMA_VERSION,
    ...input,
    created_at: current?.created_at || now,
    updated_at: now,
  });
  const merged = mergeEdge(current, next);
  return store.saveAsset("atlas_edge", merged) as AtlasEdge;
}

export function areaNodeId(store: WorkspaceStore, path: string): string {
  return `area-${store.slug(path.replaceAll("/", "-"))}`.slice(0, 119);
}

export function conceptNodeId(store: WorkspaceStore, concept: string): string {
  return `concept-${store.slug(concept)}`.slice(0, 119);
}

export function ensureSystemAreaPath(
  store: WorkspaceStore,
  path: string,
  revision: AtlasNode["revision"],
): { nodes: AtlasNode[]; edges: AtlasEdge[]; leafId: string } {
  const segments = path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length === 0) throw new Error("systemArea must contain at least one path segment");

  const nodes: AtlasNode[] = [];
  const edges: AtlasEdge[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const currentPath = segments.slice(0, index + 1).join("/");
    const nodeId = areaNodeId(store, currentPath);
    nodes.push(
      upsertAtlasNode(store, {
        id: nodeId,
        type: "system_area",
        label: segments[index],
        description: "",
        ref_type: "system_area",
        ref_id: nodeId,
        system_area: currentPath,
        status: { model: "modeled", connection: index === 0 ? "isolated" : "connected", freshness: "current", unknowns: "clear" },
        tags: ["system-area"],
        evidence_refs: [],
        unknown_refs: [],
        revision,
      }),
    );
    if (index > 0) {
      const parentPath = segments.slice(0, index).join("/");
      const parentId = areaNodeId(store, parentPath);
      const edgeId = `edge-${store.slug(`${nodeId}-part-of-${parentId}`)}`.slice(0, 119);
      edges.push(
        upsertAtlasEdge(store, {
          id: edgeId,
          from: nodeId,
          to: parentId,
          relation: "PART_OF",
          label: "belongs to",
          confidence: "high",
          evidence_refs: [],
        }),
      );
    }
  }
  return { nodes, edges, leafId: nodes.at(-1)!.id };
}

export function ensureConcepts(
  store: WorkspaceStore,
  concepts: string[],
  assetNodeId: string,
  revision: AtlasNode["revision"],
): { nodes: AtlasNode[]; edges: AtlasEdge[] } {
  const nodes: AtlasNode[] = [];
  const edges: AtlasEdge[] = [];
  for (const concept of unique(concepts.map((item) => item.trim()).filter(Boolean))) {
    const nodeId = conceptNodeId(store, concept);
    nodes.push(
      upsertAtlasNode(store, {
        id: nodeId,
        type: "concept",
        label: concept,
        description: "",
        ref_type: "concept",
        ref_id: nodeId,
        status: { model: "modeled", connection: "connected", freshness: "current", unknowns: "clear" },
        tags: ["concept"],
        evidence_refs: [],
        unknown_refs: [],
        revision,
      }),
    );
    const edgeId = `edge-${store.slug(`${assetNodeId}-explains-${nodeId}`)}`.slice(0, 119);
    edges.push(
      upsertAtlasEdge(store, {
        id: edgeId,
        from: assetNodeId,
        to: nodeId,
        relation: "EXPLAINS",
        label: "explains",
        confidence: "high",
        evidence_refs: [],
      }),
    );
  }
  return { nodes, edges };
}

export function linkSharedConcepts(
  store: WorkspaceStore,
  assetNodeId: string,
  conceptNodeIds: string[],
): AtlasEdge[] {
  if (conceptNodeIds.length === 0) return [];
  const conceptSet = new Set(conceptNodeIds);
  const sharedByAsset = new Map<string, Set<string>>();
  const allEdges = (store.listAssets("atlas_edge").atlas_edge || []) as AtlasEdge[];
  for (const edge of allEdges) {
    if (edge.relation !== "EXPLAINS" || edge.from === assetNodeId) continue;
    if (!conceptSet.has(edge.to)) continue;
    const fromNode = store.getAsset("atlas_node", edge.from) as AtlasNode | null;
    if (!fromNode || fromNode.type !== "learning_asset") continue;
    const shared = sharedByAsset.get(edge.from) ?? new Set<string>();
    shared.add(edge.to);
    sharedByAsset.set(edge.from, shared);
  }
  const edges: AtlasEdge[] = [];
  for (const [otherAssetId, sharedConceptIds] of sharedByAsset) {
    const forwardId = makeEdgeId(store, assetNodeId, "SHARES_CONCEPT_WITH", otherAssetId);
    const reverseId = makeEdgeId(store, otherAssetId, "SHARES_CONCEPT_WITH", assetNodeId);
    if (store.getAsset("atlas_edge", forwardId) || store.getAsset("atlas_edge", reverseId)) continue;
    const labels = [...sharedConceptIds].map(
      (id) => (store.getAsset("atlas_node", id) as AtlasNode | null)?.label ?? id,
    );
    edges.push(
      upsertAtlasEdge(store, {
        id: forwardId,
        from: assetNodeId,
        to: otherAssetId,
        relation: "SHARES_CONCEPT_WITH",
        label: `shared concepts: ${labels.join(", ")}`,
        confidence: "high",
        evidence_refs: [],
      }),
    );
  }
  return edges;
}

function nodeMap(store: WorkspaceStore): Map<string, AtlasNode> {
  const nodes = (store.listAssets("atlas_node").atlas_node || []) as AtlasNode[];
  return new Map(nodes.map((node) => [node.id, node]));
}

function allEdges(store: WorkspaceStore): AtlasEdge[] {
  return (store.listAssets("atlas_edge").atlas_edge || []) as AtlasEdge[];
}

function adjacency(edges: AtlasEdge[]): Map<string, Array<{ edge: AtlasEdge; other: string }>> {
  const map = new Map<string, Array<{ edge: AtlasEdge; other: string }>>();
  for (const edge of edges) {
    if (!map.has(edge.from)) map.set(edge.from, []);
    if (!map.has(edge.to)) map.set(edge.to, []);
    map.get(edge.from)!.push({ edge, other: edge.to });
    map.get(edge.to)!.push({ edge, other: edge.from });
  }
  return map;
}

function mermaidId(id: string): string {
  return `n_${id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function escapeLabel(text: string): string {
  return text.replaceAll('"', "'").replaceAll("\n", " ");
}

export interface AtlasProjectionOptions {
  focusNodeId: string;
  view: "location" | "connections" | "history" | "concept" | "gaps";
  maxDepth: number;
  maxNodes: number;
}

export function buildAtlasProjection(store: WorkspaceStore, options: AtlasProjectionOptions) {
  const nodesById = nodeMap(store);
  if (!nodesById.has(options.focusNodeId)) throw new Error(`atlas node not found: ${options.focusNodeId}`);
  const edges = allEdges(store);
  const graph = adjacency(edges);
  const selected = new Set<string>([options.focusNodeId]);
  const selectedEdges = new Map<string, AtlasEdge>();
  const queue: Array<{ id: string; depth: number }> = [{ id: options.focusNodeId, depth: 0 }];

  const relationFilter = (edge: AtlasEdge): boolean => {
    if (options.view === "location") return ["PART_OF", "REFINES"].includes(edge.relation);
    if (options.view === "concept") return ["EXPLAINS", "SHARES_CONCEPT_WITH", "LEARNED_THROUGH", "CONNECTS_TO"].includes(edge.relation);
    if (options.view === "history") return ["REFINES", "SUPERSEDES", "CONNECTS_TO", "SHARES_CONCEPT_WITH"].includes(edge.relation);
    if (options.view === "gaps") return ["DEPENDS_ON", "CONNECTS_TO", "PART_OF", "REFINES"].includes(edge.relation);
    return true;
  };

  while (queue.length > 0 && selected.size < options.maxNodes) {
    const current = queue.shift()!;
    if (current.depth >= options.maxDepth) continue;
    for (const item of graph.get(current.id) || []) {
      if (!relationFilter(item.edge)) continue;
      const otherNode = nodesById.get(item.other);
      if (!otherNode) continue;
      if (options.view === "gaps" && otherNode.status.unknowns !== "open" && otherNode.status.connection !== "isolated") {
        continue;
      }
      selectedEdges.set(item.edge.id, item.edge);
      if (!selected.has(item.other) && selected.size < options.maxNodes) {
        selected.add(item.other);
        queue.push({ id: item.other, depth: current.depth + 1 });
      }
    }
  }

  const resultNodes = [...selected].map((id) => nodesById.get(id)!).filter(Boolean);
  const resultEdges = [...selectedEdges.values()].filter((edge) => selected.has(edge.from) && selected.has(edge.to));
  const lines = ["flowchart LR"];
  for (const node of resultNodes) {
    const marker = node.id === options.focusNodeId ? ":::focus" : "";
    lines.push(`  ${mermaidId(node.id)}[\"${escapeLabel(node.label)}\"]${marker}`);
  }
  for (const edge of resultEdges) {
    lines.push(`  ${mermaidId(edge.from)} -- \"${escapeLabel(edge.label || edge.relation)}\" --> ${mermaidId(edge.to)}`);
  }
  lines.push("  classDef focus stroke-width:4px;");

  return {
    focus: nodesById.get(options.focusNodeId),
    view: options.view,
    bounded: { max_depth: options.maxDepth, max_nodes: options.maxNodes },
    nodes: resultNodes,
    edges: resultEdges,
    mermaid: lines.join("\n"),
  };
}

export function findHistoricalConnections(store: WorkspaceStore, focusNodeId: string, maxResults = 10) {
  const nodesById = nodeMap(store);
  const focus = nodesById.get(focusNodeId);
  if (!focus) throw new Error(`atlas node not found: ${focusNodeId}`);
  const edges = allEdges(store);
  const direct = edges
    .filter((edge) => edge.from === focusNodeId || edge.to === focusNodeId)
    .map((edge) => ({ edge, node: nodesById.get(edge.from === focusNodeId ? edge.to : edge.from) }))
    .filter((item): item is { edge: AtlasEdge; node: AtlasNode } => Boolean(item.node));

  const conceptIds = new Set(direct.filter((item) => item.node.type === "concept").map((item) => item.node.id));
  const related = new Map<string, { node: AtlasNode; reasons: string[]; edgeIds: string[] }>();
  for (const conceptId of conceptIds) {
    for (const edge of edges.filter((item) => item.from === conceptId || item.to === conceptId)) {
      const other = edge.from === conceptId ? edge.to : edge.from;
      if (other === focusNodeId) continue;
      const node = nodesById.get(other);
      if (!node || !["learning_asset", "learning_slice"].includes(node.type)) continue;
      const current = related.get(other) || { node, reasons: [], edgeIds: [] };
      current.reasons.push(`shared concept: ${nodesById.get(conceptId)?.label || conceptId}`);
      current.edgeIds.push(edge.id);
      related.set(other, current);
    }
  }

  for (const item of direct) {
    if (!["learning_asset", "learning_slice"].includes(item.node.type)) continue;
    const current = related.get(item.node.id) || { node: item.node, reasons: [], edgeIds: [] };
    current.reasons.push(`direct ${item.edge.relation.toLowerCase()} connection`);
    current.edgeIds.push(item.edge.id);
    related.set(item.node.id, current);
  }

  return {
    focus,
    connections: [...related.values()]
      .map((item) => ({ ...item, reasons: unique(item.reasons), edgeIds: unique(item.edgeIds) }))
      .slice(0, Math.max(1, Math.min(maxResults, 30))),
  };
}

export function healAtlas(
  store: WorkspaceStore,
): { cleaned_descriptions: number; derived_shared_concept_edges: number } {
  let cleaned = 0;
  const nodes = (store.listAssets("atlas_node").atlas_node || []) as AtlasNode[];
  for (const node of nodes) {
    if (
      typeof node.description === "string"
      && (node.description.startsWith("Concept connected through") || node.description.startsWith("System area:"))
    ) {
      store.saveAsset("atlas_node", { ...node, description: "", updated_at: store.now() });
      cleaned += 1;
    }
  }
  const edges = (store.listAssets("atlas_edge").atlas_edge || []) as AtlasEdge[];
  const assetConcepts = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.relation !== "EXPLAINS") continue;
    const target = store.getAsset("atlas_node", edge.to) as AtlasNode | null;
    if (!target || target.type !== "concept") continue;
    const source = store.getAsset("atlas_node", edge.from) as AtlasNode | null;
    if (!source || source.type !== "learning_asset") continue;
    assetConcepts.set(source.id, [...(assetConcepts.get(source.id) ?? []), target.id]);
  }
  let derived = 0;
  for (const [assetNodeId, conceptIds] of assetConcepts) {
    derived += linkSharedConcepts(store, assetNodeId, conceptIds).length;
  }
  return { cleaned_descriptions: cleaned, derived_shared_concept_edges: derived };
}

export function makeEdgeId(store: WorkspaceStore, from: string, relation: string, to: string): string {
  const base = `edge-${store.slug(`${from}-${relation}-${to}`)}`.slice(0, 119);
  return base || `edge-${randomUUID().slice(0, 8)}`;
}
