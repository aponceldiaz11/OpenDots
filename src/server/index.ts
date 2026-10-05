import { webSearchProvider } from './parallel.js';
import { createShutdown } from './shutdown.js';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Store } from './store.js';
import { Runner } from './runner.js';
import { createApp } from './app.js';
import { WorkspaceStore } from './workspace.js';
import { ThreadStore } from './threads.js';
import { Platform } from './platform.js';
import { seedHarness } from './harness-seed.js';
import type { PlatformConfig } from './platform-config.js';
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4310);
const ownerToken = process.env.OWNER_TOKEN;
if (
  !['127.0.0.1', '::1', 'localhost'].includes(host) &&
  (!ownerToken || ownerToken.length < 24)
)
  throw new Error(
    'External binding requires an OWNER_TOKEN of at least 24 characters.',
  );
const database = process.env.DATABASE_PATH ?? 'data/opendots.sqlite';
const ownerId = process.env.OWNER_ID ?? 'opendots-owner';
const store = new Store(database);
const workspace = new WorkspaceStore(database, ownerId);
const threads = new ThreadStore(database, ownerId);
const config: PlatformConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL,
  baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  providers: {
    opencodeGoApiKey: process.env.OPENCODE_GO_API_KEY,
    opencodeGoBaseUrl: process.env.OPENCODE_GO_BASE_URL,
    opencodeGoModel: process.env.OPENCODE_GO_MODEL,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    openrouterBaseUrl: process.env.OPENROUTER_BASE_URL,
    opencodeGoQuotaTokens: process.env.OPENCODE_GO_QUOTA_TOKENS
      ? Number(process.env.OPENCODE_GO_QUOTA_TOKENS)
      : undefined,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
  },
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  obsidianVaultPath: process.env.OBSIDIAN_VAULT_PATH,
  haUrl: process.env.HA_URL,
  haToken: process.env.HA_TOKEN,
  devDockerEnabled: process.env.DEV_DOCKER_ENABLED === 'true',
  devDockerImage: process.env.DEV_DOCKER_IMAGE,
  godotDockerImage: process.env.GODOT_DOCKER_IMAGE,
  devWorkspaceRoot: process.env.DEV_WORKSPACE_ROOT,
  webSearchProvider: webSearchProvider(process.env.WEB_SEARCH_PROVIDER),
  parallelApiKey: process.env.PARALLEL_API_KEY,
  browserUrl: process.env.BROWSER_URL,
  browserSecret: process.env.BROWSER_SECRET,
  computerSupervisorUrl: process.env.COMPUTER_SUPERVISOR_URL,
  computerSupervisorToken: process.env.COMPUTER_SUPERVISOR_TOKEN,
  computerToken: process.env.COMPUTER_TOKEN,
  computerNamespace: process.env.COMPUTER_NAMESPACE,
  voiceKey: process.env.VOICE_API_KEY,
  voiceModel: process.env.VOICE_MODEL,
  voiceName: process.env.VOICE_NAME ?? 'marin',
  slackUsers: [],
  runtimeUrl: `http://${host === '::1' ? '[::1]' : '127.0.0.1'}:${port}/api/chat`,
  ownerToken,
};
const platform = new Platform(store, workspace, threads, config);
if (process.env.HARNESS_AUTO_SEED === 'true') {
  const seeded = seedHarness(platform);
  if (seeded.created.length)
    console.log(`Harness Dots seeded: ${seeded.created.join(', ')}`);
}
const researchConfig = {
  mode: 'live' as const,
  apiKey: config.apiKey,
  model: config.model,
  baseUrl: config.baseUrl,
  webSearchProvider: config.webSearchProvider,
  parallelApiKey: config.parallelApiKey,
  browserUrl: config.browserUrl,
  browserSecret: config.browserSecret,
};
const runner = new Runner(
  store,
  researchConfig,
  async (claim, _memories, signal, progress) => {
    const threadId = workspace.taskThread(claim.id);
    if (!threadId)
      throw new Error(
        'This legacy task has no conversation. Create a new scheduled task from a conversation.',
      );
    progress('Running this task in its conversation.');
    const text = await platform.turn(threadId, claim.prompt, signal);
    return { text, sources: [], sample: false };
  },
);
const app = createApp({
  store,
  runner,
  config: researchConfig,
  ownerToken,
  origin:
    process.env.APP_ORIGIN ??
    (process.env.NODE_ENV === 'development'
      ? 'http://127.0.0.1:5173'
      : undefined),
  platform,
});
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  );
  await next();
});
app.get('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
app.use('/*', serveStatic({ root: './dist/client' }));
app.get('*', serveStatic({ path: './dist/client/index.html' }));
const server = serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`OpenDots harness listening on http://${host}:${info.port}`);
  runner.start();
  void platform
    .start()
    .catch((error) => console.error('Telegram channel failed:', error));
});
const shutdown = createShutdown({
  stopRunner: () => runner.stop(),
  stopPlatform: () => platform.stop(),
  closeServer: () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
  exit: (code) => process.exit(code),
  report: (operation, error) => console.error(operation, error),
});
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
