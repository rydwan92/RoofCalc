/**
 * Writes the committed document-import sample PDFs from their deterministic
 * generators: `npx tsx tools/generate-document-fixtures.ts`.
 */
import { writeFileSync } from 'node:fs';
import {
  createRoofPlanPdf,
  gableRoofPlanSpec,
  hipRoofPlanSpec,
} from '../fixtures/documents/roof-plan-pdf';

const target = new URL('../fixtures/documents/', import.meta.url);
writeFileSync(
  new URL('rzut-dachu-dwuspadowy.pdf', target),
  createRoofPlanPdf(gableRoofPlanSpec()),
);
writeFileSync(
  new URL('rzut-dachu-kopertowy.pdf', target),
  createRoofPlanPdf(hipRoofPlanSpec()),
);
console.log('Document fixtures written.');
