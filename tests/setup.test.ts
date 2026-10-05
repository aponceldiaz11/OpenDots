import { expect, it } from 'vitest';
import {
  setupStatus,
  type PlatformConfig,
} from '../src/server/platform-config.js';

const config: PlatformConfig = {
  apiKey: 'fixture',
  model: 'fixture',
  baseUrl: 'https://example.com',
  runtimeUrl: '',
  voiceName: 'marin',
  slackUsers: [],
};

it('reports no missing setup when the primary provider is configured', () => {
  expect(setupStatus(config).missing).toEqual([]);
  expect(setupStatus(config).model).toBe(true);
});

it('requires the OpenCode Go key and model without paid services', () => {
  expect(
    setupStatus({ ...config, apiKey: undefined, model: undefined }).missing,
  ).toEqual(['OPENCODE_GO_API_KEY', 'OPENCODE_GO_MODEL']);
});

it('enables voice only with a voice key and model', () => {
  expect(
    setupStatus({ ...config, voiceKey: 'key', voiceModel: 'model' }).voice,
  ).toBe(true);
  expect(setupStatus(config).voice).toBe(false);
});
