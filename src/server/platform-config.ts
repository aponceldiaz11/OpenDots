import type { WebConfig } from './parallel.js';
import type { SetupStatus } from '../shared/types.js';
export interface HarnessSecrets {
  opencodeGoApiKey?: string;
  opencodeGoBaseUrl?: string;
  opencodeGoModel?: string;
  openrouterApiKey?: string;
  openrouterBaseUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}
export interface PlatformConfig extends WebConfig {
  intelligenceKey?: string;
  intelligenceApiUrl?: string;
  intelligenceWsUrl?: string;
  model?: string;
  apiKey?: string;
  baseUrl: string;
  providers?: HarnessSecrets;
  telegramBotToken?: string;
  telegramChatId?: string;
  computerSupervisorUrl?: string;
  computerSupervisorToken?: string;
  computerToken?: string;
  computerNamespace?: string;
  browserUrl?: string;
  browserSecret?: string;
  voiceKey?: string;
  voiceModel?: string;
  voiceName: string;
  slackChannel?: string;
  slackTeam?: string;
  slackUsers: string[];
  slackDotId?: string;
  runtimeUrl: string;
  ownerToken?: string;
}
export function setupStatus(config: PlatformConfig): SetupStatus {
  const providers = config.providers;
  const primaryKey = providers?.opencodeGoApiKey || config.apiKey;
  const primaryModel = providers?.opencodeGoModel || config.model;
  const missing = [
    !primaryKey && 'OPENCODE_GO_API_KEY',
    !primaryModel && 'OPENCODE_GO_MODEL',
  ].filter((item): item is string => !!item);
  return {
    intelligence: true,
    model: missing.length === 0,
    browser: !!(config.browserUrl && config.browserSecret),
    voice: !!(config.voiceKey && config.voiceModel),
    slack: 'not_configured',
    missing,
  };
}
