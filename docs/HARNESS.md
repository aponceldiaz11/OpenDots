# Multi-provider agent harness

This fork turns OpenDots into a personal multi-provider agent harness with an
orchestrator/specialist hierarchy, per-Dot model routing, inter-agent
delegation, and Telegram human-in-the-loop approvals.

## Hierarchy

`HARNESS_AUTO_SEED=true` (or `POST /api/harness/seed`, idempotent) creates a
shared **Harness** Space and these Dots:

| Area         | Dot                     | Provider         | Notes                          |
| ------------ | ----------------------- | ---------------- | ------------------------------ |
| orchestrator | Hermes · Orquestador    | OpenCode Go      | Root; delegates with a tool    |
| dev          | dev-hermes-dot          | OpenCode Go      | Autonomous dev loop            |
| saas         | saas-pm-dot             | OpenCode Go      | Writes specs to shared Pages   |
| saas         | saas-ops-dot            | OpenCode Go      | Sensitive actions need approval |
| saas         | saas-analytics-dot      | OpenCode Go      | Metrics + alerts               |
| home         | home-assistant-dot      | OpenRouter :free | Forced to `:free` models       |

Dot fields added by the harness: `providerId`, `model`, `baseUrl`, `apiKeyEnv`,
`area`, `parentId`, `isOrchestrator`, `telegramNotify`, `sensitiveActions`.

## Per-Dot model routing

`src/server/providers.ts` resolves the provider per Dot. The model adapter in
`src/server/dot-agent.ts` uses the resolved provider rather than the global
`OPENAI_*` settings. OpenRouter Dots default to `openrouter/auto:free`.

## Inter-agent delegation

The orchestrator receives a `delegate_task` tool. It resolves the target Dot,
reuses or creates a `Delegado:` conversation for it, and runs the turn through
`Platform.delegate`. Results return to the orchestrator.

## Telegram human-in-the-loop

- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` enable the integration. The service
  uses long polling (`getUpdates`), so **no public webhook URL is required**.
- Dots with `sensitiveActions` expose `request_human_approval`. The turn pauses
  and sends inline **[Aprobar] / [Rechazar]** buttons; it resumes only on the
  callback. Pending approvals expire after 15 minutes and are marked `expired`
  on restart.
- Dots with `telegramNotify` send proactive alerts (delegation started/finished).
- Approval records persist in the `approvals` table for audit.

## New endpoints

- `GET /api/workspace` now also returns `approvals` and `telegram`.
- `POST /api/harness/seed` seeds the hierarchy above.
