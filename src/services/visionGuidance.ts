import { VisionConfigValidationResult } from '../utils/config';

export type Translator = (key: any, ...args: string[]) => string;

export function buildVisionConfigGuidance(
  validation: VisionConfigValidationResult,
  t: Translator
): string {
  const errors = new Set(validation.errors);
  const missingFields: string[] = [];

  if (errors.has('missingApiKey')) missingFields.push('visionApiKey');
  if (errors.has('missingEndpoint')) missingFields.push('visionEndpoint');
  if (errors.has('missingVisionDeployment')) missingFields.push('visionDeployment');
  if (errors.has('missingRefinementDeployment')) missingFields.push('refinementDeployment');

  if (missingFields.length > 0) {
    return t('errors.visionMissingFields', missingFields.join(', '));
  }

  if (errors.has('invalidEndpointProtocol')) {
    return t('errors.visionEndpointProtocol', 'https://<resource>.openai.azure.com');
  }

  if (errors.has('invalidEndpointHost')) {
    return t('errors.visionEndpointHost', 'https://<resource>.openai.azure.com');
  }

  if (errors.has('invalidEndpointFormat')) {
    return t('errors.visionEndpointFormat', 'https://<resource>.openai.azure.com');
  }

  return t('errors.visionConfigurationIncomplete');
}

export function buildVisionRuntimeGuidance(
  error: unknown,
  validation: VisionConfigValidationResult | null,
  t: Translator
): string | null {
  if (validation && !validation.isValid) {
    return buildVisionConfigGuidance(validation, t);
  }

  const status = (error as { response?: { status?: number } })?.response?.status;

  if (status === 401) {
    return t('errors.visionHttp401');
  }

  if (status === 404) {
    return t('errors.visionHttp404');
  }

  if (status === 429) {
    return t('errors.visionHttp429');
  }

  return null;
}
