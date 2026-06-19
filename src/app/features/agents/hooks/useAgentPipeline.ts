import { useCallback, useEffect, useRef, useState } from "react";
import { AGENTS } from "../../../data/agents";
import type { Agent, AgentStudioMode, PipelineEdge, PipelineNode } from "../../../types";

const STORAGE_PREFIX = "athens-agent-pipeline-";
const MAX_HISTORY = 20;

type PipelineSnapshot = { nodes: PipelineNode[]; edges: PipelineEdge[] };

function loadSaved(agentId: string): { snapshot: PipelineSnapshot; savedAt: string | null } {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${agentId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { snapshot: { nodes: parsed.nodes, edges: parsed.edges }, savedAt: parsed.savedAt ?? null };
    }
  } catch {
    /* ignore */
  }
  const template = AGENTS.find((a) => a.id === agentId);
  return {
    snapshot: { nodes: template?.nodes ?? [], edges: template?.edges ?? [] },
    savedAt: null,
  };
}

export function useAgentPipeline(agentId: string) {
  const template = AGENTS.find((a) => a.id === agentId);
  const [mode, setMode] = useState<AgentStudioMode>("monitor");
  const [nodes, setNodes] = useState<PipelineNode[]>([]);
  const [edges, setEdges] = useState<PipelineEdge[]>([]);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const historyRef = useRef<PipelineSnapshot[]>([]);
  const historyIndexRef = useRef(-1);

  const pushHistory = useCallback((snapshot: PipelineSnapshot) => {
    const hist = historyRef.current.slice(0, historyIndexRef.current + 1);
    hist.push(snapshot);
    if (hist.length > MAX_HISTORY) hist.shift();
    historyRef.current = hist;
    historyIndexRef.current = hist.length - 1;
  }, []);

  useEffect(() => {
    const { snapshot, savedAt } = loadSaved(agentId);
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setLastSaved(savedAt);
    historyRef.current = [snapshot];
    historyIndexRef.current = 0;
  }, [agentId]);

  const applySnapshot = useCallback((snapshot: PipelineSnapshot) => {
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, []);

  const updatePipeline = useCallback(
    (nextNodes: PipelineNode[], nextEdges: PipelineEdge[], recordHistory = true) => {
      if (recordHistory) pushHistory({ nodes, edges });
      setNodes(nextNodes);
      setEdges(nextEdges);
    },
    [nodes, edges, pushHistory],
  );

  const savePipeline = useCallback(() => {
    const savedAt = new Date().toISOString();
    localStorage.setItem(
      `${STORAGE_PREFIX}${agentId}`,
      JSON.stringify({ nodes, edges, savedAt }),
    );
    setLastSaved(savedAt);
  }, [agentId, nodes, edges]);

  const resetToTemplate = useCallback(() => {
    if (!template) return;
    const snapshot = { nodes: [...template.nodes], edges: [...template.edges] };
    pushHistory({ nodes, edges });
    applySnapshot(snapshot);
    localStorage.removeItem(`${STORAGE_PREFIX}${agentId}`);
    setLastSaved(null);
  }, [template, agentId, nodes, edges, pushHistory, applySnapshot]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    applySnapshot(historyRef.current[historyIndexRef.current]);
  }, [applySnapshot]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    applySnapshot(historyRef.current[historyIndexRef.current]);
  }, [applySnapshot]);

  const updateNode = useCallback(
    (nodeId: string, patch: Partial<PipelineNode>) => {
      updatePipeline(
        nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
        edges,
      );
    },
    [nodes, edges, updatePipeline],
  );

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  return {
    mode,
    setMode,
    nodes,
    edges,
    lastSaved,
    selectedNodeId,
    setSelectedNodeId,
    updatePipeline,
    savePipeline,
    resetToTemplate,
    undo,
    redo,
    canUndo,
    canRedo,
    updateNode,
    selectedNode: nodes.find((n) => n.id === selectedNodeId) ?? null,
  };
}
