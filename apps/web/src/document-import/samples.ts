/**
 * VNext-7C: sample drawings to try the import with — the synthetic plans of
 * `fixtures/documents`, served as static files (`public/samples`, written by
 * `tools/generate-document-fixtures.ts`, byte-checked by a test). They go
 * through exactly the same reading, review and calculation as a user's file.
 */
export const SAMPLE_DOCUMENTS = [
  { id: 'gable', fileName: 'rzut-dachu-dwuspadowy.pdf' },
  { id: 'hip', fileName: 'rzut-dachu-kopertowy.pdf' },
  { id: 'mono-pitch', fileName: 'rzut-dachu-jednospadowy.pdf' },
  {
    id: 'asymmetric-gable',
    fileName: 'rzut-dachu-dwuspadowy-niesymetryczny.pdf',
  },
  { id: 'house', fileName: 'projekt-domu-4-strony.pdf' },
] as const;

export type SampleDocument = (typeof SAMPLE_DOCUMENTS)[number];

/** The sample as a file, as if the user had chosen it. */
export async function fetchSampleDocument(
  sample: SampleDocument,
  base: string = import.meta.env.BASE_URL,
): Promise<File> {
  const response = await fetch(`${base}samples/${sample.fileName}`);
  if (!response.ok) throw new Error(`sample ${response.status}`);
  return new File([await response.blob()], sample.fileName, {
    type: 'application/pdf',
  });
}
