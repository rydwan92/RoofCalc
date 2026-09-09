export type FeatureKey =
  `calculator.${string}` | `export.${string}` | `projects.${string}`;
export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
}
