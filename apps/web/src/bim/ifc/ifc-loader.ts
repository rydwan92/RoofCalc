import { validateIfcFile } from '@cieslacalc/bim-import-core';
import type { IfcReferenceModel, IfcWorkerResponse } from './ifc-runtime-types';

export function loadIfcFile(
  file: File,
  onStage: (stage: string) => void,
): { result: Promise<IfcReferenceModel>; cancel: () => void } {
  const invalid = validateIfcFile(file.name, file.size);
  if (invalid)
    return {
      result: Promise.reject(
        new Error(
          invalid === 'file-too-large'
            ? 'Plik IFC przekracza limit 100 MB.'
            : 'Wybierz niepusty plik .ifc.',
        ),
      ),
      cancel: () => undefined,
    };
  const worker = new Worker(new URL('./ifc-worker.ts', import.meta.url), {
    type: 'module',
  });
  let rejectPending: (error: Error) => void = () => undefined;
  const result = new Promise<IfcReferenceModel>((resolve, reject) => {
    rejectPending = reject;
    onStage('Wczytywanie pliku…');
    void file
      .arrayBuffer()
      .then((buffer) => {
        onStage('Uruchamianie parsera…');
        worker.postMessage({ kind: 'parse', buffer, fileName: file.name }, [
          buffer,
        ]);
      })
      .catch((error: unknown) => {
        worker.terminate();
        reject(error);
      });
    worker.onmessage = (event: MessageEvent<IfcWorkerResponse>) => {
      const message = event.data;
      if (message.kind === 'stage') {
        onStage(
          {
            parser: 'Uruchamianie parsera…',
            analysis: 'Analiza modelu…',
            preview: 'Budowanie podglądu…',
          }[message.stage],
        );
      } else if (message.kind === 'result') {
        worker.terminate();
        resolve(message.model);
      } else {
        worker.terminate();
        reject(new Error(message.message));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('Parser IFC zakończył pracę z błędem.'));
    };
  });
  return {
    result,
    cancel: () => {
      worker.terminate();
      rejectPending(new Error('Anulowano import.'));
    },
  };
}
