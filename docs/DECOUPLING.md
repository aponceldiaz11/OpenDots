# Removing CopilotKit

Goal: **no `@copilotkit/*` dependency at all.** Conversations run on our own
runtime (TanStack AI for inference, AG-UI as the wire protocol) with history in
the local SQLite workspace. Model routing stays per-Dot as implemented in
`docs/HARNESS.md`.

## Current coupling

| Concern          | Today                                          | Replacement                              |
| ---------------- | ---------------------------------------------- | ---------------------------------------- |
| Threads/history  | `CopilotKitIntelligence` (managed cloud)       | `src/server/threads.ts` (SQLite)         |
| Agent loop       | `BuiltInAgent` (`@copilotkit/runtime/v2`)      | own `HarnessAgent` over `@tanstack/ai`   |
| HTTP/SSE runtime | `CopilotRuntime` + `createCopilotHonoHandler`  | own Hono AG-UI handler                    |
| Headless turns   | `IntelligenceAgent` (`@copilotkit/core`)       | `HarnessAgent` used server-side          |
| Tools            | `defineTool` / `ToolDefinition`                | own tool type in `harness-tools.ts`      |
| Learned skills   | Intelligence skills containers                 | dropped (or local later)                 |
| Slack            | `@copilotkit/channels`                         | dropped (Telegram is the channel)        |
| Chat UI          | `@copilotkit/react-core` (provider/useAgent)   | native React + SSE client                |

`@ag-ui/*` stays: it is an open protocol, not a CopilotKit package.

## Phases

1. **Threads** — `threads.ts` local store + tests. ✅ (this commit)
2. **Agent loop** — `harness-agent.ts`: run TanStack `chat()` with our tool
   set and emit AG-UI events; drop `BuiltInAgent`.
3. **Runtime** — `agui.ts` Hono handler for `/api/copilotkit` run + info; drop
   `CopilotRuntime`/`createCopilotHonoHandler`; `Platform` stores threads
   locally.
4. **Headless** — `runThreadTurn` drives `HarnessAgent` directly; drop
   `IntelligenceAgent`.
5. **Tools/learning/slack** — port tool definitions; remove learned skills and
   the Slack channel.
6. **Frontend** — native chat client (SSE), rebuild `Chat`, `App`,
   `ThreadList`, tool/HITL cards; remove the three `react-core` imports.
7. **Package purge** — remove `@copilotkit/*` from `package.json`, delete old
   modules, rewrite tests that mock CopilotKit, run the full suite.

Each phase lands as its own commit on `harness/decouple-copilotkit` and keeps
`typecheck`, `lint`, `test` and `build` green before moving on.
