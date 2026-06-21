import type {
  ActivationResult,
  SkillCategory,
  SkillGraph,
} from "../../../types/knowledgeGraph";
import { edgeKey } from "./activation";

/** Render node consumed by react-force-graph. Mutated in place by d3-force. */
export interface GraphRenderNode {
  id: string;
  label: string;
  category: SkillCategory;
  blurb?: string;
  /** Activation in [0, 1] — drives glow, size, pulse. */
  activation: number;
  /** Raw direct evidence in [0, 1]. */
  evidence: number;
  /** True if the skill is directly present on an active resume. */
  isSeed: boolean;
  /** Resume strength score 0–10 when available. */
  strength?: number;
  /** d3-force populates these. */
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface GraphRenderLink {
  source: string;
  target: string;
  type: string;
  /** Effective weight in [0, 1] — drives thickness/opacity/particles. */
  weight: number;
  /** Combined activation of both endpoints — drives flow animation. */
  energy: number;
}

export interface GraphRenderData {
  nodes: GraphRenderNode[];
  links: GraphRenderLink[];
}

/** Brand-aligned hue per skill category (HSL hue degrees). */
export const CATEGORY_HUE: Record<SkillCategory, number> = {
  language: 256, // violet (brand)
  frontend: 190, // cyan/teal
  backend: 152, // green
  cloud: 28, // amber/orange
  database: 330, // pink
  devops: 210, // blue
  data: 280, // purple
  mobile: 95, // lime
  concept: 230, // indigo (taxonomy anchors)
};

export const CATEGORY_LABEL: Record<SkillCategory, string> = {
  language: "Language",
  frontend: "Frontend",
  backend: "Backend",
  cloud: "Cloud",
  database: "Database",
  devops: "DevOps",
  data: "Data",
  mobile: "Mobile",
  concept: "Concept",
};

/**
 * HSL color string for a node, where activation modulates lightness/saturation
 * so highly-activated skills appear vivid and "lit" while dormant ones are dim.
 */
export function nodeColor(category: SkillCategory, activation: number): string {
  const hue = CATEGORY_HUE[category];
  const sat = 35 + activation * 55; // 35% -> 90%
  const light = 32 + activation * 30; // 32% -> 62%
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/** Glow/halo color (brighter, semi-transparent) for the activation aura. */
export function nodeGlow(category: SkillCategory, activation: number): string {
  const hue = CATEGORY_HUE[category];
  return `hsla(${hue}, 90%, 65%, ${0.15 + activation * 0.55})`;
}

export function buildGraphData(
  graph: SkillGraph,
  result: ActivationResult,
  strengthByNodeId?: Record<string, number>,
): GraphRenderData {
  const nodes: GraphRenderNode[] = graph.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    category: n.category,
    blurb: n.blurb,
    activation: result.activation[n.id] ?? 0,
    evidence: result.evidence[n.id] ?? 0,
    isSeed: (result.evidence[n.id] ?? 0) > 0,
    strength: strengthByNodeId?.[n.id],
  }));

  const links: GraphRenderLink[] = graph.edges.map((e) => {
    const weight = result.edgeWeights[edgeKey(e.from, e.to)] ?? e.weight;
    const energy =
      ((result.activation[e.from] ?? 0) + (result.activation[e.to] ?? 0)) / 2;
    return {
      source: e.from,
      target: e.to,
      type: e.type,
      weight,
      energy,
    };
  });

  return { nodes, links };
}
