/**
 * Writes the committed document-import sample PDFs from their deterministic
 * generators: `npx tsx tools/generate-document-fixtures.ts`. VNext-7C: the
 * same bytes are the import's sample drawings in `apps/web/public/samples`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  createDesignPdf,
  createRoofPlanPdf,
  gableRoofPlanSpec,
  hipRoofPlanSpec,
  houseDesignSpecs,
  monoPitchRoofPlanSpec,
} from '../fixtures/documents/roof-plan-pdf';

const documents: [string, Uint8Array][] = [
  ['rzut-dachu-dwuspadowy.pdf', createRoofPlanPdf(gableRoofPlanSpec())],
  ['rzut-dachu-kopertowy.pdf', createRoofPlanPdf(hipRoofPlanSpec())],
  ['rzut-dachu-jednospadowy.pdf', createRoofPlanPdf(monoPitchRoofPlanSpec())],
  ['projekt-domu-4-strony.pdf', createDesignPdf(houseDesignSpecs())],
];
const targets = [
  new URL('../fixtures/documents/', import.meta.url),
  new URL('../apps/web/public/samples/', import.meta.url),
];
for (const target of targets) {
  mkdirSync(target, { recursive: true });
  for (const [name, bytes] of documents)
    writeFileSync(new URL(name, target), bytes);
}
console.log('Document fixtures and import samples written.');
