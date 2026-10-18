import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type {
  ResolvedRoofConnectionNode,
  RoofNodeKind,
  RoofNodeProjection,
} from '@cieslacalc/connection-core';
import type { SkeletonMember3D } from '@cieslacalc/timber-model';
import type { WorkbenchSelectionContext } from '../selection';
import { useAssembly } from '../store';
import { workbenchLocation } from '../workbench';

/**
 * VNext-3 connection view state, in one place: the node kind shown on the
 * drawing (`connectionFocus`), the chosen occurrence (the ordinary
 * selection, resolved to a node), the members to emphasise, the selected
 * member's own nodes for the inspector, and the jumps between plan and
 * structure. View state only — nothing here enters the project or history.
 * The returned objects are referentially stable while their inputs are, so
 * the memoised drawing does not re-render on unrelated workbench changes.
 */
export function useConnectionView({
  projection,
  selectionContext,
  members,
}: {
  projection: RoofNodeProjection;
  selectionContext: WorkbenchSelectionContext;
  members: readonly SkeletonMember3D[];
}) {
  const view = useAssembly(
    useShallow((store) => ({
      selectedId: store.workbench.selectedId,
      selectedInstanceId: store.workbench.selectedInstanceId,
      focus: store.workbench.connectionFocus,
      viewPreset: store.workbench.viewPreset,
    })),
  );
  const actions = useAssembly(
    useShallow((store) => ({
      select: store.select,
      selectConnectionNode: store.selectConnectionNode,
      focusConnectionKind: store.focusConnectionKind,
      navigateTo: store.navigateTo,
      setConstructionSection: store.setConstructionSection,
    })),
  );
  const selectedNode =
    selectionContext.kind === 'connection-node'
      ? selectionContext.node
      : undefined;

  // Back from a member ("Pokaż"), the plan shows the same occurrence again
  // if the geometry still has it.
  const lastNodeId = useRef<string | undefined>(undefined);
  const previousPreset = useRef(view.viewPreset);
  useEffect(() => {
    if (selectedNode) lastNodeId.current = selectedNode.id;
  }, [selectedNode]);
  useEffect(() => {
    const entered =
      previousPreset.current !== 'connections' &&
      view.viewPreset === 'connections';
    previousPreset.current = view.viewPreset;
    if (!entered || selectedNode) return;
    const node = projection.nodes.find(
      (candidate) => candidate.id === lastNodeId.current,
    );
    if (node && node.kind === view.focus) actions.selectConnectionNode(node.id);
  }, [actions, projection.nodes, selectedNode, view.focus, view.viewPreset]);

  const focusedNodes = useMemo(
    () =>
      view.focus
        ? projection.nodes.filter((node) => node.kind === view.focus)
        : [],
    [projection.nodes, view.focus],
  );
  /** The chosen occurrence's members, else every occurrence's members. */
  const relatedIds = useMemo(() => {
    const nodes =
      selectedNode && selectedNode.kind === view.focus
        ? [selectedNode]
        : focusedNodes;
    return new Set(
      nodes.flatMap((node) => node.members.map((member) => member.id)),
    );
  }, [focusedNodes, selectedNode, view.focus]);
  /** The member chosen on the drawing (an instance or one support). */
  const memberNodes = useMemo(() => {
    if (view.selectedId === 'roof' || selectedNode) return [];
    return projection.nodes.filter((node) =>
      node.members.some((member) =>
        view.selectedInstanceId
          ? member.id === view.selectedInstanceId
          : member.selectionId === view.selectedId ||
            member.id === view.selectedId,
      ),
    );
  }, [
    projection.nodes,
    selectedNode,
    view.selectedId,
    view.selectedInstanceId,
  ]);

  const selectNode = useCallback(
    (nodeId: string | undefined) => actions.selectConnectionNode(nodeId),
    [actions],
  );
  const markers = useMemo(
    () =>
      view.focus
        ? {
            nodes: focusedNodes,
            selectedId: selectedNode?.id,
            onSelect: selectNode,
          }
        : undefined,
    [focusedNodes, selectNode, selectedNode?.id, view.focus],
  );
  const focusKind = useCallback(
    (kind: RoofNodeKind | undefined) => {
      actions.focusConnectionKind(kind);
      // A chosen occurrence of another kind is not kept; the plan stays.
      if (selectedNode && selectedNode.kind !== kind)
        actions.selectConnectionNode(undefined);
    },
    [actions, selectedNode],
  );
  /** From a member's inspector to one occurrence in the plan. */
  const openNode = useCallback(
    (node: Pick<ResolvedRoofConnectionNode, 'id' | 'kind'>) => {
      actions.focusConnectionKind(node.kind);
      actions.navigateTo(workbenchLocation('connections'), { remember: true });
      actions.selectConnectionNode(node.id);
    },
    [actions],
  );
  /** From a node to one of its members in the structure, with a way back. */
  const openMember = useCallback(
    (target: { id: string }) => {
      const member = members.find((candidate) => candidate.id === target.id);
      if (!member) return;
      actions.navigateTo(workbenchLocation('construction'), {
        remember: true,
      });
      actions.setConstructionSection('structure');
      actions.select(member.selectionId, member.prototypeId);
    },
    [actions, members],
  );
  return {
    focus: view.focus,
    selectedNode,
    focusedNodes,
    relatedIds,
    memberNodes,
    markers,
    focusKind,
    selectNode,
    openNode,
    openMember,
  };
}
