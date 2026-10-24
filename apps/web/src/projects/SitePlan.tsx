import { useTranslation } from 'react-i18next';
import type { SiteScene } from './site-scene';
import type { StructureSummary } from './session';
import { structureLabel } from './StructureBar';

/**
 * VNext-10D: every structure's roof in plan, where its settings place it.
 * Drawn from the placed scenes only (no geometry of its own); a structure
 * whose roof overlaps another's is marked; a click opens the structure.
 */
export function SitePlan({
  site,
  structures,
  activeId,
  onSelect,
}: {
  site: SiteScene;
  structures: readonly StructureSummary[];
  activeId?: string;
  onSelect: (structureId: string) => void;
}) {
  const { t } = useTranslation();
  const points = site.structures.flatMap((structure) =>
    structure.scene.planes.flatMap((plane) => plane.polygon),
  );
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;
  const pad = Math.max(width, height) * 0.06 + 500;
  const label = Math.max(width, height) / 32;
  return (
    <figure className="a-site-plan" data-testid="site-plan">
      <svg
        viewBox={`${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`}
        role="img"
        aria-label={t('assembly.structures.siteLabel')}
        preserveAspectRatio="xMidYMid meet"
      >
        {site.structures.map((structure) => {
          const index = structures.findIndex(
            (summary) => summary.id === structure.id,
          );
          const name = structureLabel(structures[index] ?? {}, index, t);
          const corners = structure.scene.planes.flatMap(
            (plane) => plane.polygon,
          );
          const cx =
            corners.reduce((sum, point) => sum + point.x, 0) / corners.length;
          const cy =
            corners.reduce((sum, point) => sum + point.y, 0) / corners.length;
          return (
            <g
              key={structure.id}
              className="a-site-structure"
              data-structure-id={structure.id}
              data-active={structure.id === activeId ? 'true' : 'false'}
              data-overlap={
                site.overlaps.some((pair) => pair.includes(structure.id))
                  ? 'true'
                  : 'false'
              }
              role="button"
              tabIndex={0}
              aria-label={name}
              onClick={() => onSelect(structure.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(structure.id);
                }
              }}
            >
              {structure.scene.planes.map((plane) => (
                <polygon
                  key={plane.id}
                  points={plane.polygon
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                />
              ))}
              <text x={cx} y={cy} fontSize={label} textAnchor="middle">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption>{t('assembly.structures.siteHint')}</figcaption>
    </figure>
  );
}
