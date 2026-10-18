import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import {
  ROOF_NODE_ORDER,
  type ResolvedRoofConnectionNode,
  type RoofNodeKind,
} from '@cieslacalc/connection-core';
import { connectionsCopy } from './copy';
import './connections.css';

/**
 * VNext-3 inspector group "Połączenia elementu": the nodes the selected
 * member takes part in, from the same node projection as the connection
 * plan, each one step away from its occurrence in the plan.
 */
export default function MemberConnections({
  nodes,
  onOpen,
}: {
  nodes: readonly ResolvedRoofConnectionNode[];
  onOpen: (node: ResolvedRoofConnectionNode) => void;
}) {
  const { i18n } = useTranslation();
  const m = connectionsCopy(i18n.language);
  const byKind = new Map<RoofNodeKind, ResolvedRoofConnectionNode[]>();
  for (const node of nodes)
    byKind.set(node.kind, [...(byKind.get(node.kind) ?? []), node]);
  const kinds = ROOF_NODE_ORDER.filter((kind) => byKind.has(kind));
  if (!kinds.length) return null;
  return (
    <section
      className="a-inspector-group cn-member-connections"
      data-testid="member-connections"
    >
      <h3>
        <Link2 size={14} aria-hidden="true" />
        {m.memberConnections.title}
      </h3>
      <ul>
        {kinds.map((kind) => {
          const list = byKind.get(kind)!;
          return (
            <li key={kind} data-node={kind}>
              <span>{m.nodes[kind]}</span>
              <small>{m.count(list.length)}</small>
              <button
                type="button"
                className="cn-link"
                data-testid={`member-connection-open-${kind}`}
                onClick={() => onOpen(list[0]!)}
              >
                {m.memberConnections.open}
              </button>
            </li>
          );
        })}
      </ul>
      <p>{m.memberConnections.hint}</p>
    </section>
  );
}
