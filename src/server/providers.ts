import type { Dot, ProviderId } from '../shared/types.js';
import type { PlatformConfig } from './platform-config.js';

export interface ResolvedProvider {
  providerId: ProviderId;
  label: string;
  model: string;
  apiKey: string | undefined;
  baseUrl: string;
  free: boolean;
}

export interface ProviderSeed {
  providerId: ProviderId;
  model: string | null;
  baseUrl: string | null;
  apiKeyEnv: string | null;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  'opencode-go': 'OpenCode Go',
  'openrouter-free': 'OpenRouter :free',
  openai: 'OpenAI',
  custom: 'Custom',
};

export function providerSeed(
  providerId: ProviderId,
  config: PlatformConfig,
): ProviderSeed {
  const secrets = config.providers;
  switch (providerId) {
    case 'opencode-go':
      return {
        providerId,
        model: secrets?.opencodeGoModel ?? null,
        baseUrl: secrets?.opencodeGoBaseUrl ?? null,
        apiKeyEnv: 'OPENCODE_GO_API_KEY',
      };
    case 'openrouter-free':
      return {
        providerId,
        model: 'openrouter/auto:free',
        baseUrl: secrets?.openrouterBaseUrl ?? 'https://openrouter.ai/api/v1',
        apiKeyEnv: 'OPENROUTER_API_KEY',
      };
    case 'openai':
      return {
        providerId,
        model: config.model ?? null,
        baseUrl: config.baseUrl,
        apiKeyEnv: 'OPENAI_API_KEY',
      };
    case 'custom':
    default:
      return {
        providerId: 'custom',
        model: config.model ?? null,
        baseUrl: config.baseUrl,
        apiKeyEnv: 'OPENAI_API_KEY',
      };
  }
}

export function resolveProvider(
  dot: Dot,
  config: PlatformConfig,
): ResolvedProvider {
  const seed = providerSeed(dot.providerId ?? 'custom', config);
  const secrets = config.providers;
  const apiKey =
    (dot.apiKeyEnv ? process.env[dot.apiKeyEnv] : undefined) ??
    (dot.providerId === 'openrouter-free'
      ? secrets?.openrouterApiKey
      : dot.providerId === 'opencode-go'
        ? secrets?.opencodeGoApiKey
        : config.apiKey);
  return {
    providerId: dot.providerId ?? 'custom',
    label: PROVIDER_LABELS[dot.providerId ?? 'custom'],
    model: dot.model ?? seed.model ?? '',
    apiKey,
    baseUrl: dot.baseUrl ?? seed.baseUrl ?? config.baseUrl,
    free: dot.providerId === 'openrouter-free',
  };
}

export function providerReady(provider: ResolvedProvider): boolean {
  return !!provider.model && !!provider.apiKey;
}
