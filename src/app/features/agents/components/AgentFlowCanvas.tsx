import { useCallback, useEffect, useMemo } from "react";
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
  const initial = useMemo(
    () => pipelineToFlow(pipelineNodes, pipelineEdges, readOnly),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pipelineNodes.length, pipelineEdges.length, readOnly],
  );

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initial.edges);

  useEffect(() => {
    const { nodes: fn, edges: fe } = pipelineToFlow(pipelineNodes, pipelineEdges, readOnly);
    setNodes(fn);
    setEdges(fe);
  }, [pipelineNodes, pipelineEdges, readOnly, setNodes, setEdges]);

  const syncBack = useCallback(
    (fn: typeof nodes, fe: typeof edges) => {
      const result = flowToPipeline(fn, fe, pipelineNodes, pipelineEdges);
      onNodesChange(result.nodes, result.edges);
    },
    [onNodesChange, pipelineNodes, pipelineEdges],
  );

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeInternal>[0]) => {
      onNodesChangeInternal(changes);
      if (!readOnly) {
        setTimeout(() => {
          setNodes((current) => {
            setEdges((currentEdges) => {
              syncBack(current, currentEdges);
              return currentEdges;
            });
            return current;
          });
        }, 0);
      }
    },
    [onNodesChangeInternal, readOnly, syncBack, setNodes, setEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || !connection.source || !connection.target) return;
      const newEdge: PipelineEdge = {
        from: connection.source,
        to: connection.target,
        label: "Connect",
        color: "#6c5ce7",
      };
      onNodesChange(pipelineNodes, [...pipelineEdges, newEdge]);
    },
    [readOnly, pipelineNodes, pipelineEdges, onNodesChange],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => onSelectNode(node.id),
    [onSelectNode],
  );

  const onPaneClick = useCallback(() => onSelectNode(null), [onSelectNode]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/agent-node-type") as PipelineNode["type"];
      if (!type || !onDropNode) return;
      const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onDropNode(type, { x: e.clientX - bounds.left - 100, y: e.clientY - bounds.top - 40 });
    },
    [onDropNode],
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes.map((n) => ({ ...n, selected: n.id === selectedNodeId }))}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChangeInternal}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        panOnDrag={readOnly ? true : [1, 2]}
        className="bg-secondary/20"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={!readOnly} />
        <MiniMap className="!bg-card !border-border" zoomable pannable />
        {readOnly && (
          <Panel position="top-left" className="bg-card/90 border border-border rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            Live monitor — switch to Design to edit
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
