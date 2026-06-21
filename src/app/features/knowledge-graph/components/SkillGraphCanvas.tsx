import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Maximize2, Minus, Plus } from "lucide-react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { Button } from "../../../components/ui/button";
import {
  CATEGORY_HUE,
  nodeColor,
  type GraphRenderData,
  type GraphRenderLink,
  type GraphRenderNode,
} from "../lib/graphAdapter";
import type { SkillCategory } from "../../../types/knowledgeGraph";

type SkillGraphCanvasProps = {
  data: GraphRenderData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Relation types to show; when undefined all are shown. */
  visibleRelations?: Set<string>;
};

type Palette = {
  text: string;
  linkBase: [number, number, number];
  particle: string;
};

const PALETTES: Record<"dark" | "light", Palette> = {
  dark: { text: "#eeeef6", linkBase: [255, 255, 255], particle: "#9b87f7" },
  light: { text: "#0d0d14", linkBase: [80, 80, 110], particle: "#6c5ce7" },
};

export function SkillGraphCanvas({
  data,
  selectedId,
  onSelect,
  visibleRelations,
}: SkillGraphCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<ForceGraphMethods<GraphRenderNode, GraphRenderLink> | undefined>(undefined);
  const posRef = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(new Map());
  const fittedRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { resolvedTheme } = useTheme();
  const palette = PALETTES[resolvedTheme === "light" ? "light" : "dark"];

  // Measure container.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Persist node positions across recomputes so toggling profiles ripples the
  // activation glow without re-shuffling the whole layout.
  const graphData = useMemo(() => {
    const cache = posRef.current;
    const nodes = data.nodes.map((n) => {
      const prev = cache.get(n.id);
      return prev ? { ...n, x: prev.x, y: prev.y, vx: prev.vx, vy: prev.vy } : { ...n };
    });
    return { nodes, links: data.links.map((l) => ({ ...l })) };
  }, [data]);

  useEffect(() => {
    fittedRef.current = false;
  }, [data.nodes.length, data.links.length]);

  const fitView = useCallback(() => {
    const fg = fgRef.current;
    if (!fg || graphData.nodes.length === 0) return;
    fg.zoomToFit(400, 60);
    fittedRef.current = true;
  }, [graphData.nodes.length]);

  const zoomBy = useCallback((factor: number) => {
    const fg = fgRef.current;
    if (!fg) return;
    const next = Math.min(8, Math.max(0.15, fg.zoom() * factor));
    fg.zoom(next, 300);
  }, []);
  // Configure forces once the instance exists.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-120).distanceMax(600);
    const link = fg.d3Force("link");
    if (link) {
      link.distance((l: GraphRenderLink) => 35 + (1 - l.weight) * 70).strength(
        (l: GraphRenderLink) => 0.08 + l.weight * 0.35,
      );
    }
    // Keep isolated nodes (no edges) bounded near the center instead of drifting
    // off to infinity, which otherwise breaks zoom-to-fit and node positions.
    // Custom, dependency-free centering force applied each simulation tick.
    let centerNodes: Array<{ x?: number; y?: number; vx?: number; vy?: number }> = [];
    const centeringForce = (alpha: number) => {
      const k = 0.05 * alpha;
      for (const n of centerNodes) {
        if (typeof n.x === "number" && Number.isFinite(n.x) && typeof n.vx === "number") {
          n.vx -= n.x * k;
        }
        if (typeof n.y === "number" && Number.isFinite(n.y) && typeof n.vy === "number") {
          n.vy -= n.y * k;
        }
      }
    };
    centeringForce.initialize = (nodes: typeof centerNodes) => {
      centerNodes = nodes;
    };
    fg.d3Force("center-pull", centeringForce as unknown as never);
    fg.d3ReheatSimulation?.();
  }, [size.width, size.height, graphData.nodes.length]);

  // Pan to a node when it becomes selected (e.g. via search).
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !selectedId) return;
    const node = graphData.nodes.find((n) => n.id === selectedId);
    if (node && typeof node.x === "number" && typeof node.y === "number") {
      fg.centerAt(node.x, node.y, 600);
      fg.zoom(2.2, 600);
    }
  }, [selectedId, graphData.nodes]);

  const capturePositions = useCallback(() => {
    for (const n of graphData.nodes) {
      if (typeof n.x === "number" && typeof n.y === "number") {
        posRef.current.set(n.id, { x: n.x, y: n.y, vx: n.vx ?? 0, vy: n.vy ?? 0 });
      }
    }
  }, [graphData]);

  const handleEngineStop = useCallback(() => {
    capturePositions();
    if (!fittedRef.current && graphData.nodes.length > 0) {
      fgRef.current?.zoomToFit(400, 60);
      fittedRef.current = true;
    }
  }, [capturePositions, graphData.nodes.length]);

  // Neighbor set of the active (selected or hovered) node for highlighting.
  const focusId = hoverId ?? selectedId;
  const neighborIds = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    for (const l of data.links) {
      const s = typeof l.source === "string" ? l.source : (l.source as GraphRenderNode).id;
      const t = typeof l.target === "string" ? l.target : (l.target as GraphRenderNode).id;
      if (s === focusId) set.add(t);
      if (t === focusId) set.add(s);
    }
    return set;
  }, [focusId, data.links]);

  const drawNode = useCallback(
    (node: GraphRenderNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      // d3-force can briefly emit NaN/Infinity for isolated nodes; skip until finite.
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
      const x = node.x as number;
      const y = node.y as number;
      const a = Number.isFinite(node.activation) ? node.activation : 0;
      const baseR = 3 + a * 9 + (node.isSeed ? 2 : 0);
      const dimmed = neighborIds ? !neighborIds.has(node.id) : false;
      const alpha = dimmed ? 0.18 : 1;

      // Pulsing glow halo, intensity scaled by activation.
      const pulse = 1 + Math.sin(Date.now() / 600 + x) * 0.12 * a;
      const glowR = Math.max(0.5, baseR * (2.6 + a * 1.6) * pulse);
      const hue = nodeColor(node.category, a);
      ctx.globalAlpha = alpha;
      const grad = ctx.createRadialGradient(x, y, baseR * 0.4, x, y, glowR);
      grad.addColorStop(0, hueToGlow(node.category, 0.35 + a * 0.45));
      grad.addColorStop(1, hueToGlow(node.category, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Core node.
      ctx.beginPath();
      ctx.arc(x, y, baseR, 0, Math.PI * 2);
      ctx.fillStyle = hue;
      ctx.fill();

      // Seed / selection ring.
      if (node.isSeed || node.id === selectedId) {
        ctx.lineWidth = node.id === selectedId ? 2.2 / globalScale : 1.2 / globalScale;
        ctx.strokeStyle = node.id === selectedId ? palette.text : hueToGlow(node.category, 0.9);
        ctx.stroke();
      }

      // Label when zoomed in or node is prominent (Neo4j-style readability).
      const showLabel =
        node.id === focusId ||
        node.isSeed ||
        globalScale > 0.45 ||
        a > 0.15;
      if (showLabel && globalScale > 0.35) {
        const fontSize = Math.max(9, (10 + a * 4) / globalScale);
        ctx.font = `${node.isSeed ? "600 " : ""}${fontSize}px Figtree, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = palette.text;
        ctx.globalAlpha = dimmed ? 0.25 : 0.92;
        const labelY = y + baseR + 2 / globalScale;
        ctx.fillText(node.label, x, labelY);
        if (node.isSeed && typeof node.strength === "number") {
          const scoreSize = Math.max(8, fontSize * 0.85);
          ctx.font = `600 ${scoreSize}px ui-monospace, monospace`;
          ctx.fillStyle = hue;
          ctx.fillText(node.strength.toFixed(1), x, labelY + fontSize + 1 / globalScale);
        }
      }

      ctx.globalAlpha = 1;
    },
    [neighborIds, selectedId, focusId, palette.text],
  );

  const drawPointerArea = useCallback(
    (node: GraphRenderNode, color: string, ctx: CanvasRenderingContext2D) => {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;
      const x = node.x as number;
      const y = node.y as number;
      const a = Number.isFinite(node.activation) ? node.activation : 0;
      const r = 6 + a * 9;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    },
    [],
  );

  const linkColor = useCallback(
    (link: GraphRenderLink) => {
      const [r, g, b] = palette.linkBase;
      let op = 0.12 + link.weight * 0.2 + link.energy * 0.25;
      if (neighborIds) {
        const s = typeof link.source === "string" ? link.source : (link.source as GraphRenderNode).id;
        const t = typeof link.target === "string" ? link.target : (link.target as GraphRenderNode).id;
        const active = neighborIds.has(s) && neighborIds.has(t);
        op = active ? Math.min(0.9, 0.3 + link.energy * 0.6) : 0.04;
      }
      return `rgba(${r}, ${g}, ${b}, ${op})`;
    },
    [palette.linkBase, neighborIds],
  );

  if (size.width === 0) {
    return <div ref={wrapRef} className="w-full h-full min-h-[400px]" />;
  }

  return (
    <div ref={wrapRef} className="relative w-full h-full min-h-0 touch-none">
      <ForceGraph2D
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={4}
        minZoom={0.08}
        maxZoom={12}
        enableZoomInteraction
        enablePanInteraction
        enableNodeDrag
        nodeLabel={(n: GraphRenderNode) => {
          const strength =
            typeof n.strength === "number" ? ` · ${n.strength.toFixed(1)}/10` : "";
          return `${n.label} — ${Math.round(n.activation * 100)}%${strength}`;
        }}
        nodeCanvasObject={drawNode}
        nodePointerAreaPaint={drawPointerArea}
        linkColor={linkColor}
        linkVisibility={(l: GraphRenderLink) =>
          !visibleRelations || visibleRelations.has(l.type)
        }
        linkWidth={(l: GraphRenderLink) => 0.5 + l.weight * 2.5}
        linkDirectionalParticles={(l: GraphRenderLink) => (l.energy > 0.35 ? 2 : 0)}
        linkDirectionalParticleWidth={(l: GraphRenderLink) => 1 + l.energy * 2.5}
        linkDirectionalParticleSpeed={(l: GraphRenderLink) => 0.002 + l.energy * 0.01}
        linkDirectionalParticleColor={() => palette.particle}
        onNodeClick={(n: GraphRenderNode) => onSelect(n.id === selectedId ? null : n.id)}
        onNodeHover={(n: GraphRenderNode | null) => setHoverId(n ? n.id : null)}
        onBackgroundClick={() => onSelect(null)}
        onNodeDragEnd={capturePositions}
        onEngineStop={handleEngineStop}
        cooldownTicks={150}
        warmupTicks={30}
        d3VelocityDecay={0.35}
      />

      <div className="absolute bottom-4 right-4 flex flex-col gap-2 pointer-events-auto z-20">
        <div className="flex flex-col gap-1 bg-card/95 border border-border rounded-lg shadow-sm p-1">
          <Button type="button" variant="ghost" size="icon" className="size-8" title="Zoom in" onClick={() => zoomBy(1.35)}>
            <Plus className="w-4 h-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-8" title="Zoom out" onClick={() => zoomBy(1 / 1.35)}>
            <Minus className="w-4 h-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-8" title="Fit graph to view" onClick={fitView}>
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground bg-card/90 border border-border rounded-md px-2 py-1 max-w-[140px] leading-snug">
          Scroll · pinch to zoom. Drag background to pan. Drag nodes to reposition. Click to inspect.
        </p>
      </div>
    </div>
  );
}

/** Glow color helper at an explicit opacity, using shared category hues. */
function hueToGlow(category: SkillCategory, opacity: number): string {
  return `hsla(${CATEGORY_HUE[category]}, 90%, 65%, ${opacity})`;
}
