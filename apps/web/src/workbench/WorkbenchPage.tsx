import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createWorkbenchDrawing,
  rafterWorkbench,
} from '@cieslacalc/calculator-core';
import { useWorkbench, type Field } from '../store';
import { WorkbenchToolbar, Toolbox } from './WorkbenchTools';
import { Inspector } from './Inspector';
import { Canvas } from './Canvas';
import { FabricationSummary } from './FabricationSummary';

export interface InputIssue {
  field: Field;
  code: string;
}
export function WorkbenchPage() {
  const state = useWorkbench();
  const { t, i18n } = useTranslation();
  const brand = import.meta.env.VITE_BRAND_NAME || 'CieślaCalc';
  const parsed = rafterWorkbench.inputSchema.safeParse(state.input);
  const result = parsed.success ? rafterWorkbench.calculate(parsed.data) : null;
  const model =
    result && parsed.success
      ? createWorkbenchDrawing(
          parsed.data,
          result,
          state.view,
          state.view === 'detail' ? state.detailTarget : state.selected,
        )
      : null;
  const issues: InputIssue[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') as Field,
        code: issue.code === 'custom' ? issue.message : 'invalid',
      }));
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = `${brand} — ${t('workshop')}`;
  }, [brand, i18n.language, t]);
  return (
    <div className="workbench">
      <WorkbenchToolbar brand={brand} />
      <main>
        <div className="workspace-heading">
          <div>
            <span className="overline">{t('workshop')}</span>
            <h1>
              {t('commonRafter')}
              <span>01</span>
            </h1>
          </div>
          <div className="session-status">
            <span className={result ? 'status-dot' : 'status-dot warning'} />
            {result ? t('live') : t('invalidTitle')}
            <span className="version-tag">{t('prototype')}</span>
          </div>
        </div>
        <div className="workbench-layout">
          <Toolbox result={result} issues={issues} />
          <Canvas model={model} issues={issues} />
          <Inspector result={result} issues={issues} />
        </div>
        <FabricationSummary result={result} />
        <details className="model-assumptions">
          <summary>{t('assumptions')}</summary>
          <p>{t('assumptionsText')}</p>
          <p>{t('datumNote')}</p>
          <p>{t('defaultNote')}</p>
        </details>
        <footer>
          <span>
            {brand} <span className="footer-slash">/</span> {t('local')}
          </span>
          <span>{t('noSave')}</span>
        </footer>
      </main>
    </div>
  );
}
