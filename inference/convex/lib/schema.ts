// Runtime validation against the canonical v1 JSON Schema in contracts/.
// @cfworker/json-schema is used because it does not generate code with eval,
// which the Convex runtime does not allow.
import { Validator } from '@cfworker/json-schema';
import models from '../../../contracts/models.schema.json';

export type ModelName =
  | 'GraphEnvelope'
  | 'InvestigationCreateRequest'
  | 'InvestigationResource'
  | 'EnrichmentRequest'
  | 'EnrichmentJob'
  | 'AnalysisSubmission'
  | 'AnalysisResource'
  | 'AnalysisReceipt'
  | 'CapabilityResponse'
  | 'ApiError'
  | 'InvestigationReadyEvent';

const validators = new Map<ModelName, Validator>();

function validatorFor(name: ModelName): Validator {
  let validator = validators.get(name);
  if (!validator) {
    // Each validator is rooted at the whole document so local $defs refs resolve.
    const schema = { ...(models as Record<string, unknown>), $ref: `#/$defs/${name}` };
    validator = new Validator(schema as never, '2020-12', false);
    validators.set(name, validator);
  }
  return validator;
}

export interface SchemaResult {
  valid: boolean;
  errors: string[];
}

export function validateModel(name: ModelName, value: unknown): SchemaResult {
  const result = validatorFor(name).validate(value);
  return {
    valid: result.valid,
    // Keep messages short and location-based; never echo payload values.
    errors: result.errors.slice(0, 10).map(e => `${e.instanceLocation || '#'}: ${e.error}`),
  };
}

export function assertModel(name: ModelName, value: unknown): void {
  const result = validateModel(name, value);
  if (!result.valid) {
    throw new Error(`${name} failed schema validation: ${result.errors.join('; ')}`);
  }
}
