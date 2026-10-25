import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCopy, Triangle } from 'lucide-react';
import { formatLength, formatNumber, formatSquareMetres } from '../format';
import { ROOF_FAMILY_LABEL } from '../assembly/roof-family';
import { useAssembly } from '../assembly/store';
import type { ProjectSession, ProjectSessionState } from './session';
import { structureLabel } from './StructureBar';
import {
  deriveTrussEnquiryStructure,
  type TrussEnquiryStructure,
} from './truss-enquiry';
import './truss-enquiry.css';

/**
 * VNext-14: the data a prefabricated-truss manufacturer asks for before a
 * quote — every structure's geometry, sloped area, covering and layers —
 * as one sheet to read or copy into an enquiry. It designs no truss and
 * checks no load, and says what the truss designer still needs.
 */
export function TrussEnquirySheet({
  session,
  state,
}: {
  session: ProjectSession;
  state: ProjectSessionState;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const unit = useAssembly((assembly) => assembly.unit);
  const open = useAssembly((assembly) => assembly.projectDocument);
  const [copied, setCopied] = useState<'done' | 'failed'>();
  const structures = useMemo((): TrussEnquiryStructure[] => {
    const document = session.projectDocument();
    if (document?.schemaVersion === 2 && state.structures)
      return document.structures.map((structure, index) =>
        deriveTrussEnquiryStructure(
          structure.id,
          structureLabel(state.structures?.[index] ?? {}, index, t),
          structure.project,
        ),
      );
    // A project of one roof: the roof open in the workbench.
    return [
      deriveTrussEnquiryStructure(
        'open',
        state.active?.name ?? t('assembly.trussEnquiry.thisRoof'),
        open.project,
      ),
    ];
    // `open` also re-derives the other structures' rows on every edit of
    // the open one, which the session document already carries.
  }, [session, state.structures, state.active?.name, open, t]);

  const length = (mm: number) => `${formatLength(mm, unit, locale)} ${unit}`;
  const angle = (deg: number) => `${formatNumber(deg, locale)}°`;
  const kg = (value: number) => `${formatNumber(value, locale, 1)} kg`;
  const rows = (structure: TrussEnquiryStructure) => {
    const list: { key: string; label: string; value: string }[] = [
      {
        key: 'type',
        label: t('assembly.trussEnquiry.roofType'),
        value: t(ROOF_FAMILY_LABEL[structure.roofType]),
      },
      {
        key: 'footprint',
        label: t('assembly.trussEnquiry.footprint'),
        value: `${length(structure.buildingLengthMm)} × ${length(structure.spanMm)}`,
      },
      {
        key: 'pitch',
        label: t('assembly.trussEnquiry.pitch'),
        value: structure.pitchesDeg.map(angle).join(' / '),
      },
    ];
    if (structure.height)
      list.push({
        key: 'height',
        label: t(`assembly.trussEnquiry.height.${structure.height.kind}`),
        value: length(structure.height.valueMm),
      });
    list.push({
      key: 'eave',
      label: t('assembly.trussEnquiry.eaveOverhang'),
      value: length(structure.eaveOverhangMm),
    });
    list.push({
      key: 'area',
      label: t('assembly.trussEnquiry.area'),
      value: structure.area
        ? structure.area.netMm2 < structure.area.grossMm2 - 1
          ? t('assembly.trussEnquiry.areaNet', {
              gross: formatSquareMetres(structure.area.grossMm2, locale),
              net: formatSquareMetres(structure.area.netMm2, locale),
            })
          : formatSquareMetres(structure.area.grossMm2, locale)
        : t('assembly.trussEnquiry.missing'),
    });
    list.push({
      key: 'covering',
      label: t('assembly.trussEnquiry.covering'),
      value: structure.coverings.length
        ? structure.coverings
            .map((covering) =>
              [
                [covering.manufacturer, covering.family]
                  .filter(Boolean)
                  .join(' ') ||
                  t(`assembly.trussEnquiry.kind.${covering.kind}`),
                covering.material &&
                  t(`assembly.trussEnquiry.material.${covering.material}`),
                covering.weightKgPerPiece !== undefined &&
                  t('assembly.trussEnquiry.pieceMass', {
                    value: kg(covering.weightKgPerPiece),
                  }),
                covering.massKgPerM2 &&
                  t('assembly.trussEnquiry.areaMass', {
                    min: formatNumber(covering.massKgPerM2.min, locale, 0),
                    max: formatNumber(covering.massKgPerM2.max, locale, 0),
                  }),
              ]
                .filter(Boolean)
                .join(' · '),
            )
            .join('; ')
        : t('assembly.trussEnquiry.missing'),
    });
    list.push({
      key: 'membrane',
      label: t('assembly.trussEnquiry.membrane'),
      value: structure.membrane
        ? [structure.membrane.manufacturer, structure.membrane.family]
            .filter(Boolean)
            .join(' ') || t('assembly.trussEnquiry.membraneManual')
        : t('assembly.trussEnquiry.missing'),
    });
    const section = (part?: { widthMm: number; heightMm: number }) =>
      part
        ? `${formatLength(part.widthMm, unit, locale)} × ${length(part.heightMm)}`
        : t('assembly.trussEnquiry.off');
    list.push({
      key: 'layers',
      label: t('assembly.trussEnquiry.layers'),
      value: t('assembly.trussEnquiry.layersValue', {
        battens: section(structure.battens),
        counter: section(structure.counterBattens),
      }),
    });
    list.push({
      key: 'openings',
      label: t('assembly.trussEnquiry.openings'),
      value: structure.openings.length
        ? structure.openings
            .map(
              (opening) =>
                `${formatLength(opening.widthMm, unit, locale)} × ${length(opening.heightMm)}`,
            )
            .join(', ')
        : t('assembly.trussEnquiry.none'),
    });
    return list;
  };

  const totalMm2 = structures.every((structure) => structure.area)
    ? structures.reduce(
        (sum, structure) => sum + (structure.area?.netMm2 ?? 0),
        0,
      )
    : undefined;
  const todo = ['location', 'plans', 'loads'] as const;

  const copy = async () => {
    const lines = [
      t('assembly.trussEnquiry.title'),
      ...structures.flatMap((structure) => [
        '',
        structure.name,
        ...rows(structure).map((row) => `- ${row.label}: ${row.value}`),
      ]),
      ...(structures.length > 1 && totalMm2 !== undefined
        ? [
            '',
            `${t('assembly.trussEnquiry.total')}: ${formatSquareMetres(totalMm2, locale)}`,
          ]
        : []),
      '',
      t('assembly.trussEnquiry.todoTitle'),
      ...todo.map((item) => `- ${t(`assembly.trussEnquiry.todo.${item}`)}`),
      '',
      t('assembly.trussEnquiry.disclaimer'),
    ];
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied('done');
    } catch {
      // Without the clipboard API (an http page, a refused permission) the
      // older selection copy still works in most browsers.
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      let done = false;
      try {
        done = document.execCommand('copy');
      } catch {
        done = false;
      }
      area.remove();
      setCopied(done ? 'done' : 'failed');
    }
  };

  return (
    <section
      className="te-sheet"
      data-testid="truss-enquiry"
      aria-labelledby="truss-enquiry-title"
    >
      <header>
        <span className="te-icon" aria-hidden="true">
          <Triangle size={20} />
        </span>
        <div>
          <small>{t('assembly.trussEnquiry.eyebrow')}</small>
          <h3 id="truss-enquiry-title">{t('assembly.trussEnquiry.title')}</h3>
          <p>{t('assembly.trussEnquiry.description')}</p>
        </div>
        <button
          type="button"
          className="a-button a-primary"
          data-testid="truss-enquiry-copy"
          onClick={() => void copy()}
        >
          <ClipboardCopy size={16} aria-hidden="true" />
          {t('assembly.trussEnquiry.copy')}
        </button>
      </header>
      {copied && (
        <p className="te-copied" role="status">
          {t(`assembly.trussEnquiry.copied.${copied}`)}
        </p>
      )}
      <div className="te-structures">
        {structures.map((structure) => (
          <article key={structure.key} data-structure={structure.key}>
            <h4>{structure.name}</h4>
            <dl>
              {rows(structure).map((row) => (
                <div key={row.key} data-row={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      {structures.length > 1 && totalMm2 !== undefined && (
        <p className="te-total" data-testid="truss-enquiry-total">
          <strong>{t('assembly.trussEnquiry.total')}:</strong>{' '}
          {formatSquareMetres(totalMm2, locale)}
        </p>
      )}
      <div className="te-todo">
        <strong>{t('assembly.trussEnquiry.todoTitle')}</strong>
        <ul>
          {todo.map((item) => (
            <li key={item}>{t(`assembly.trussEnquiry.todo.${item}`)}</li>
          ))}
        </ul>
      </div>
      <p className="te-disclaimer">{t('assembly.trussEnquiry.disclaimer')}</p>
    </section>
  );
}
