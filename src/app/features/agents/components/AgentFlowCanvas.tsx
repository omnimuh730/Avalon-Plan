import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useEdgesState,
  useNodesState,
  type Connection,
  type OnConnect,
  type ReactFlowInstance,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FlowPipelineNode } from "./FlowPipelineNode";
import { flowToPipeline, pipelineToFlow } from "../lib/agentFlowUtils";
import type { AgentStudioMode, PipelineEdge, PipelineNode } from "../../../types";

const nodeTypes = { pipeline: FlowPipelineNode };

type AgentFlowCanvasProps = {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  mode: AgentStudioMode;
  selectedNodeId: string | null;
  onNodesChange: (nodes: PipelineNode[], edges: PipelineEdge[]) => void;
  onSelectNode: (id: string | null) => void;
  onDropNode?: (type: PipelineNode["type"], position: { x: number; y: number }) => void;
};

export function AgentFlowCanvas({
  nodes: pipelineNodes,
  edges: pipelineEdges,
  mode,
  selectedNodeId,
  onNodesChange,
  onSelectNode,
  onDropNode,
}: AgentFlowCanvasProps) {
  const readOnly = mode === "monitor";
  const rfRef = useRef<ReactFlowInstance | null>(null);

  const flow = useMemo(
    () => pipelineToFlow(pipelineNodes, pipelineEdges, readOnly),
    [pipelineNodes, pipelineEdges, readOnly],
  );

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(flow.edges);

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow.nodes, flow.edges, setNodes, setEdges]);

  const syncFromFlow = useCallback(() => {
    const inst = rfRef.current;
    if (!inst || readOnly) return;
    const fn = inst.getNodes();
    const fe = inst.getEdges();
    const result = flowToPipeline(fn, fe, pipelineNodes, pipelineEdges);
    onNodesChange(result.nodes, result.edges);
  }, [readOnly, onNodesChange, pipelineNodes, pipelineEdges]);

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || !connection.source || !connection.target) return;
      onNodesChange(pipelineNodes, [
        ...pipelineEdges,
        { from: connection.source, to: connection.target, label: "Connect", color: "#6c5ce7" },
      ]);
    },
    [readOnly, pipelineNodes, pipelineEdges, onNodesChange],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/agent-node-type") as PipelineNode["type"];
      if (!type || !onDropNode || !rfRef.current) return;
      const position = rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onDropNode(type, position);
    },
    [onDropNode],
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId }))}
        edges={edges}
        onNodesChange={onNodesChangeInternal}
        onEdgesChange={onEdgesChangeInternal}
        onConnect={onConnect}
        onNodeDragStop={syncFromFlow}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={() => onSelectNode(null)}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onInit={(inst) => { rfRef.current = inst; }}
        nodeTypes={nodeTypes}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={readOnly ? null : "Backspace"}
        className="bg-secondary/20"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={!readOnly} />
        <MiniMap className="!bg-card !border-border" zoomable pannable />
        {readOnly && (
          <Panel position="top-left" className="bg-card/90 border border-border rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
            Live monitor
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
