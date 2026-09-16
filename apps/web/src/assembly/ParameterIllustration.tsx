/**
 * Explanatory parameter sketches for the guided Creator (V37 §10).
 * Presentation only: fixed schematic coordinates, never a geometry engine and
 * never a source of dimensions.
 */
export type ParameterIllustrationKind =
  | 'gable'
  | 'hip'
  | 'building-length'
  | 'building-width'
  | 'pitch'
  | 'eave'
  | 'rafter-spacing'
  | 'rafter-section'
  | 'rafter-system'
  | 'collar-tie'
  | 'ridge-board'
  | 'direct-meeting'
  | 'half-lap';

const arrowHeads = (
  <defs>
    <marker
      id="pi-arrow"
      viewBox="0 0 8 8"
      refX="4"
      refY="4"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M0 0L8 4L0 8Z" className="pi-arrowhead" />
    </marker>
  </defs>
);

function Dimension({ d }: { d: string }) {
  return (
    <path
      className="pi-dim"
      d={d}
      markerStart="url(#pi-arrow)"
      markerEnd="url(#pi-arrow)"
    />
  );
}

function content(kind: ParameterIllustrationKind) {
  switch (kind) {
    case 'gable':
      return (
        <>
          <path className="pi-ground" d="M8 74H112" />
          <path className="pi-wall" d="M22 74V46H98V74" />
          <path className="pi-roof" d="M14 50L60 18L106 50" />
          <path className="pi-accent" d="M60 18V46" />
        </>
      );
    case 'hip':
      return (
        <>
          <path className="pi-plan" d="M14 16H106V68H14Z" />
          <path
            className="pi-roof"
            d="M14 16L40 42H80L106 16M14 68L40 42M80 42L106 68"
          />
          <path className="pi-accent" d="M40 42H80" />
        </>
      );
    case 'building-length':
      return (
        <>
          <path className="pi-plan is-active" d="M16 24H104V58H16Z" />
          <Dimension d="M16 70H104" />
          <path className="pi-guide" d="M16 60V74M104 60V74" />
        </>
      );
    case 'building-width':
      return (
        <>
          <path className="pi-plan is-active" d="M16 24H96V58H16Z" />
          <Dimension d="M106 24V58" />
          <path className="pi-guide" d="M98 24H112M98 58H112" />
        </>
      );
    case 'pitch':
      return (
        <>
          <path className="pi-ground" d="M10 66H110" />
          <path className="pi-roof is-active" d="M18 66L92 20" />
          <path className="pi-arc" d="M46 66A28 28 0 0 0 42 51" />
          <text className="pi-label" x="52" y="60">
            α
          </text>
        </>
      );
    case 'eave':
      return (
        <>
          <path className="pi-wall" d="M62 72V38" />
          <path className="pi-roof" d="M104 18L24 58" />
          <path className="pi-guide" d="M24 58V72M62 38V72" />
          <Dimension d="M24 68H62" />
        </>
      );
    case 'rafter-spacing':
      return (
        <>
          <path
            className="pi-member"
            d="M24 14V66M48 14V66M72 14V66M96 14V66"
          />
          <Dimension d="M48 74H72" />
        </>
      );
    case 'rafter-section':
      return (
        <>
          <rect className="pi-section" x="46" y="12" width="26" height="54" />
          <Dimension d="M46 74H72" />
          <Dimension d="M84 12V66" />
          <text className="pi-label" x="55" y="84">
            b
          </text>
          <text className="pi-label" x="92" y="43">
            h
          </text>
        </>
      );
    case 'rafter-system':
      return (
        <>
          <path className="pi-ground" d="M10 72H110" />
          <path className="pi-roof is-active" d="M16 72L60 22L104 72" />
        </>
      );
    case 'collar-tie':
      return (
        <>
          <path className="pi-ground" d="M10 72H110" />
          <path className="pi-roof" d="M16 72L60 22L104 72" />
          <path className="pi-accent" d="M38 47H82" />
        </>
      );
    case 'ridge-board':
      return (
        <>
          <rect
            className="pi-section is-active"
            x="55"
            y="16"
            width="10"
            height="26"
          />
          <path className="pi-roof" d="M18 70L55 30M102 70L65 30" />
        </>
      );
    case 'direct-meeting':
      return (
        <>
          <path className="pi-roof" d="M18 70L60 24L102 70" />
          <path className="pi-accent" d="M60 24V40" />
        </>
      );
    case 'half-lap':
      return (
        <>
          <path className="pi-roof" d="M18 70L66 20M102 70L54 20" />
          <path className="pi-warning" d="M54 26H66" />
        </>
      );
  }
}

export function ParameterIllustration({
  kind,
  label,
  size = 'small',
}: {
  kind: ParameterIllustrationKind;
  label: string;
  size?: 'small' | 'large';
}) {
  return (
    <svg
      className={`a-parameter-illustration is-${size}`}
      data-illustration={kind}
      viewBox="0 0 120 88"
      role="img"
      aria-label={label}
    >
      {arrowHeads}
      {content(kind)}
    </svg>
  );
}
