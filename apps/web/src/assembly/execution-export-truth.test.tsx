// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { ExecutionExport } from './ExecutionExport';
import type { ExportFacts } from './export-adapter';
import { materialTestFacts } from './material-test-facts';
import type { ProjectLimitation } from './project-readiness';

afterEach(cleanup);
beforeAll(async () => {
  await i18n.changeLanguage('pl');
  document.documentElement.lang = 'pl';
});

function preview(
  facts: ExportFacts,
  props: Partial<Parameters<typeof ExecutionExport>[0]> = {},
) {
  return render(
    <ExecutionExport
      source={facts.source}
      facts={facts}
      unit="cm"
      mobile={false}
      onClose={() => undefined}
      onPlanK1={() => undefined}
      initialSelection={['project-summary', 'assumptions']}
      startInPreview
      {...props}
    />,
  );
}

const rollPlan: ProjectLimitation = {
  code: 'membrane-roll-plan',
  params: {
    netAreaM2: 87.9,
    grossAreaM2: 96.15,
    overlapAreaM2: 4.8,
    endOverlapAreaM2: 0.15,
    ridgeOverrunAreaM2: 3.3,
    courseCount: 8,
    rollCount: 2,
  },
};

describe('V47 document truth — assumptions and limitations', () => {
  it('regression: a resolved overlap-aware membrane never prints "net area excludes laps"', () => {
    const facts: ExportFacts = {
      ...materialTestFacts(),
      membraneEnabled: true,
      limitations: [rollPlan, { code: 'gross-area-no-roll-reuse' }],
    };
    preview(facts);
    const page = screen.getByTestId('doc-assumptions');
    const text = page.textContent ?? '';
    expect(text).not.toMatch(/nie obejmuje zakładów/);
    expect(text).toContain('96,15 m² z zakładami');
    expect(text).toContain('zakłady między pasami +4,8 m²');
    expect(text).toContain('zakłady na łączeniach rolek +0,15 m²');
    expect(text).toContain('2 rol.');
    // The roll plan is scope (✓); only the real remaining limitation is ⚠.
    expect(
      page.querySelector(
        '[data-group="scope"] [data-fact="membrane-roll-plan"]',
      ),
    ).toBeTruthy();
    expect(
      page.querySelector(
        '[data-group="limitations"] [data-fact="gross-area-no-roll-reuse"]',
      ),
    ).toBeTruthy();
  });

  it('states net-only membrane truthfully when no roll product exists', () => {
    const facts: ExportFacts = {
      ...materialTestFacts(),
      membraneEnabled: true,
      limitations: [{ code: 'membrane-net-only', params: { netAreaM2: 87.9 } }],
    };
    preview(facts);
    const text = screen.getByTestId('doc-assumptions').textContent ?? '';
    expect(text).toContain('znana tylko powierzchnia netto 87,9 m²');
    expect(text).not.toContain('z zakładami');
  });

  it('lists only project facts: no membrane statement when the layer is off', () => {
    preview({ ...materialTestFacts(), limitations: [] });
    const page = screen.getByTestId('doc-assumptions');
    expect(page.textContent).not.toMatch(/Membrana/);
    expect(page.textContent).toContain('Brak nierozstrzygniętych ograniczeń');
    expect(page.querySelectorAll('[data-group="not-modelled"] li').length).toBe(
      3,
    );
  });
});

describe('V47 document status and print gating', () => {
  it('a ready document prints normally with no banner', () => {
    preview(materialTestFacts(), {
      documentStatus: { state: 'ready', issues: [] },
    });
    expect(screen.getByTestId('document-state').textContent).toContain(
      'Gotowy',
    );
    expect(screen.queryByTestId('document-status-banner')).toBeNull();
    expect(screen.getByTestId('execution-print').textContent).toBe(
      'Drukuj / Zapisz PDF',
    );
  });

  it('a warning keeps printing available and prints the warning inside the document', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    preview(materialTestFacts(), {
      documentStatus: {
        state: 'warning',
        issues: [
          {
            severity: 'warning',
            code: 'hip-detail-required',
            params: { count: 4 },
          },
        ],
      },
    });
    expect(screen.getByTestId('document-state').textContent).toContain(
      'Dokument roboczy',
    );
    const banner = screen.getByTestId('document-status-banner');
    expect(banner.textContent).toContain('Uzupełnij detal kontrłat przy H1');
    expect(banner.textContent).toContain('4 grzbiety H1');
    fireEvent.click(screen.getByTestId('execution-print'));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('a blocker replaces the main print action with a direct fix and marks every page', () => {
    const fix = vi.fn();
    preview(materialTestFacts(), {
      documentStatus: {
        state: 'blocked',
        issues: [
          {
            severity: 'blocker',
            code: 'plane-scope-stale',
            params: { count: 2 },
          },
        ],
      },
      onFixProblems: fix,
    });
    fireEvent.click(screen.getByTestId('document-fix-problems'));
    expect(fix).toHaveBeenCalled();
    expect(screen.getByTestId('execution-print').textContent).toBe(
      'Drukuj wersję roboczą',
    );
    for (const page of document.querySelectorAll('.doc-page'))
      expect(page.textContent).toContain('Wymaga poprawy');
  });
});
