import {
  classifyIfcElement,
  discoverRoofCandidates,
  siLengthUnitToMillimetres,
  type IfcElementSummary,
  type IfcSpatialNode,
} from '@cieslacalc/bim-import-core';
import type {
  IfcReferenceMesh,
  IfcReferenceModel,
  IfcWorkerRequest,
  IfcWorkerResponse,
} from './ifc-runtime-types';

type IfcApi = import('web-ifc').IfcAPI;
type IfcLine = Record<string, unknown>;

const emit = (message: IfcWorkerResponse, transfer?: Transferable[]) =>
  self.postMessage(message, { transfer: transfer ?? [] });

function value(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'value' in raw)
    return value((raw as { value: unknown }).value);
  return undefined;
}

function reference(raw: unknown): number | undefined {
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const ref = (raw as { value: unknown }).value;
    if (typeof ref === 'number') return ref;
  }
  return undefined;
}

function line(api: IfcApi, modelId: number, id: number): IfcLine {
  return api.GetLine(modelId, id) as IfcLine;
}

function ids(api: IfcApi, modelId: number, name: string): number[] {
  const code = api.GetTypeCodeFromName(name);
  if (!code) return [];
  return Array.from(api.GetLineIDsWithType(modelId, code));
}

function sourceLengthUnit(
  api: IfcApi,
  modelId: number,
): { name: string; toMillimetres?: number } {
  const projectId = ids(api, modelId, 'IFCPROJECT')[0];
  if (projectId === undefined) return { name: 'unknown' };
  const unitsId = reference(line(api, modelId, projectId).UnitsInContext);
  if (unitsId === undefined) return { name: 'unknown' };
  const units = line(api, modelId, unitsId).Units;
  if (!Array.isArray(units)) return { name: 'unknown' };
  for (const unitRef of units) {
    const id = reference(unitRef);
    if (id === undefined) continue;
    const unit = line(api, modelId, id);
    if (value(unit.UnitType)?.toUpperCase() !== 'LENGTHUNIT') continue;
    const name = value(unit.Name);
    const prefix = value(unit.Prefix);
    if (name)
      return {
        name: `${prefix ? `${prefix}` : ''}${name}`,
        toMillimetres: siLengthUnitToMillimetres(name, prefix),
      };
    return { name: 'unknown' };
  }
  return { name: 'unknown' };
}

function spatialTree(api: IfcApi, modelId: number): IfcSpatialNode[] {
  const spatialNames = [
    'IFCPROJECT',
    'IFCSITE',
    'IFCBUILDING',
    'IFCBUILDINGSTOREY',
  ];
  const nodes: IfcSpatialNode[] = spatialNames.flatMap((ifcClass) =>
    ids(api, modelId, ifcClass).map((expressId) => {
      const data = line(api, modelId, expressId);
      return {
        expressId,
        globalId: value(data.GlobalId),
        ifcClass,
        name: value(data.Name) || ifcClass,
      };
    }),
  );
  const byId = new Map(nodes.map((node) => [node.expressId, node]));
  for (const relationId of ids(api, modelId, 'IFCRELAGGREGATES')) {
    const relation = line(api, modelId, relationId);
    const parent = reference(relation.RelatingObject);
    if (
      parent === undefined ||
      !byId.has(parent) ||
      !Array.isArray(relation.RelatedObjects)
    )
      continue;
    for (const childRef of relation.RelatedObjects) {
      const child = byId.get(reference(childRef) ?? -1);
      if (child) child.parentExpressId = parent;
    }
  }
  return nodes;
}

function storeys(api: IfcApi, modelId: number): Map<number, string> {
  const result = new Map<number, string>();
  for (const relationId of ids(
    api,
    modelId,
    'IFCRELCONTAINEDINSPATIALSTRUCTURE',
  )) {
    const relation = line(api, modelId, relationId);
    const parentId = reference(relation.RelatingStructure);
    if (parentId === undefined || !Array.isArray(relation.RelatedElements))
      continue;
    const name = value(line(api, modelId, parentId).Name);
    if (!name) continue;
    for (const elementRef of relation.RelatedElements) {
      const id = reference(elementRef);
      if (id !== undefined) result.set(id, name);
    }
  }
  return result;
}

function materialNames(api: IfcApi, modelId: number): Map<number, string> {
  const result = new Map<number, string>();
  for (const relationId of ids(api, modelId, 'IFCRELASSOCIATESMATERIAL')) {
    const relation = line(api, modelId, relationId);
    const materialId = reference(relation.RelatingMaterial);
    if (materialId === undefined || !Array.isArray(relation.RelatedObjects))
      continue;
    const material = line(api, modelId, materialId);
    const name = value(material.Name) || value(material.Category);
    if (!name) continue;
    for (const objectRef of relation.RelatedObjects) {
      const id = reference(objectRef);
      if (id !== undefined) result.set(id, name);
    }
  }
  return result;
}

function rawProperties(data: IfcLine): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(data)) {
    if (key === 'Representation' || key === 'ObjectPlacement') continue;
    if (typeof raw === 'string' || typeof raw === 'number')
      result[key] = String(raw);
    else if (value(raw)) result[key] = value(raw)!;
  }
  return result;
}

function elements(api: IfcApi, modelId: number): IfcElementSummary[] {
  const inStorey = storeys(api, modelId);
  const materials = materialNames(api, modelId);
  const result: IfcElementSummary[] = [];
  for (const type of api.GetAllTypesOfModel(modelId)) {
    if (!api.IsIfcElement(type.typeID)) continue;
    const ifcClass = type.typeName;
    for (const expressId of api.GetLineIDsWithType(modelId, type.typeID)) {
      const data = line(api, modelId, expressId);
      const predefinedType = value(data.PredefinedType);
      result.push({
        expressId,
        globalId: value(data.GlobalId),
        ifcClass,
        name: value(data.Name),
        description: value(data.Description),
        predefinedType,
        storey: inStorey.get(expressId),
        material: materials.get(expressId),
        rawProperties: rawProperties(data),
        group: classifyIfcElement(ifcClass, predefinedType),
      });
    }
  }
  return result;
}

function meshBuffers(
  api: IfcApi,
  modelId: number,
): { meshes: IfcReferenceMesh[]; origin: [number, number, number] } {
  const meshes: IfcReferenceMesh[] = [];
  let bytes = 0;
  let origin: [number, number, number] | undefined;
  api.StreamAllMeshes(modelId, (flat) => {
    for (
      let placedIndex = 0;
      placedIndex < flat.geometries.size();
      placedIndex++
    ) {
      const placed = flat.geometries.get(placedIndex);
      const geometry = api.GetGeometry(modelId, placed.geometryExpressID);
      try {
        const raw = api.GetVertexArray(
          geometry.GetVertexData(),
          geometry.GetVertexDataSize(),
        );
        const rawIndices = api.GetIndexArray(
          geometry.GetIndexData(),
          geometry.GetIndexDataSize(),
        );
        const positions = new Float32Array((raw.length / 6) * 3);
        const transform = placed.flatTransformation;
        for (let i = 0; i < raw.length / 6; i++) {
          const x = raw[i * 6] ?? 0;
          const y = raw[i * 6 + 1] ?? 0;
          const z = raw[i * 6 + 2] ?? 0;
          const px =
            (transform[0] ?? 1) * x +
            (transform[4] ?? 0) * y +
            (transform[8] ?? 0) * z +
            (transform[12] ?? 0);
          const py =
            (transform[1] ?? 0) * x +
            (transform[5] ?? 1) * y +
            (transform[9] ?? 0) * z +
            (transform[13] ?? 0);
          const pz =
            (transform[2] ?? 0) * x +
            (transform[6] ?? 0) * y +
            (transform[10] ?? 1) * z +
            (transform[14] ?? 0);
          origin ??= [px, py, pz];
          positions.set([px, py, pz], i * 3);
        }
        const indices = new Uint32Array(rawIndices);
        bytes += positions.byteLength + indices.byteLength;
        if (bytes > 160 * 1024 * 1024)
          throw new Error('Model IFC przekracza limit pamięci podglądu.');
        meshes.push({
          expressId: flat.expressID,
          positions,
          indices,
          color: [
            placed.color.x,
            placed.color.y,
            placed.color.z,
            placed.color.w,
          ],
        });
      } finally {
        geometry.delete();
      }
    }
  });
  const displayOrigin = origin ?? [0, 0, 0];
  for (const mesh of meshes)
    for (let i = 0; i < mesh.positions.length; i += 3) {
      mesh.positions[i] = (mesh.positions[i] ?? 0) - displayOrigin[0];
      mesh.positions[i + 1] = (mesh.positions[i + 1] ?? 0) - displayOrigin[1];
      mesh.positions[i + 2] = (mesh.positions[i + 2] ?? 0) - displayOrigin[2];
    }
  return { meshes, origin: displayOrigin };
}

self.onmessage = async (event: MessageEvent<IfcWorkerRequest>) => {
  if (event.data.kind !== 'parse') return;
  let api: IfcApi | undefined;
  let modelId: number | undefined;
  try {
    const prefix = new TextDecoder().decode(event.data.buffer.slice(0, 4096));
    if (!prefix.includes('ISO-10303-21') || !prefix.includes('FILE_SCHEMA'))
      throw new Error('Plik nie ma poprawnego nagłówka IFC STEP.');
    emit({ kind: 'stage', stage: 'parser' });
    const { IfcAPI } = await import('web-ifc');
    api = new IfcAPI();
    api.SetWasmPath(
      new URL(`${import.meta.env.BASE_URL}ifc/`, self.location.origin).href,
      true,
    );
    await api.Init(undefined, true);
    modelId = api.OpenModel(new Uint8Array(event.data.buffer), {
      COORDINATE_TO_ORIGIN: false,
      ALLOW_INCOMPATIBLE_SCHEMA_ALIASES: false,
    });
    if (modelId < 0) throw new Error('Parser nie otworzył modelu IFC.');
    emit({ kind: 'stage', stage: 'analysis' });
    const unit = sourceLengthUnit(api, modelId);
    const summaries = elements(api, modelId);
    const roofs = discoverRoofCandidates(summaries);
    emit({ kind: 'stage', stage: 'preview' });
    const geometry = meshBuffers(api, modelId);
    const model: IfcReferenceModel = {
      summary: {
        metadata: {
          fileName: event.data.fileName,
          fileSize: event.data.buffer.byteLength,
          schema: api.GetModelSchema(modelId),
          sourceLengthUnit: unit.name,
          sourceToMillimetres: unit.toMillimetres,
          sourceCoordinationMatrix: api.GetCoordinationMatrix(modelId),
        },
        elements: summaries,
        spatialNodes: spatialTree(api, modelId),
        roofCandidates: roofs,
        issues: [
          ...(!unit.toMillimetres ? [{ code: 'missing-units' as const }] : []),
          ...(!roofs.length ? [{ code: 'no-roof-candidate' as const }] : []),
          ...(roofs.length > 1 ? [{ code: 'multiple-roofs' as const }] : []),
        ],
      },
      meshes: geometry.meshes,
      displayOrigin: geometry.origin,
    };
    emit(
      { kind: 'result', model },
      geometry.meshes.flatMap((mesh) => [
        mesh.positions.buffer,
        mesh.indices.buffer,
      ]),
    );
  } catch (error) {
    emit({
      kind: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Nie udało się odczytać modelu IFC.',
    });
  } finally {
    if (api && modelId !== undefined && modelId >= 0) api.CloseModel(modelId);
    api?.Dispose();
  }
};
