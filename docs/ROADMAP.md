# Harness roadmap (consolidated)

Personal multi-provider agent harness running locally on Mac, with a **PWA
mobile-first UI as the single access point**. No paid third-party services.
Heavy inference goes through **OpenCode Go**; secondary/home automation Dots use
**OpenRouter `:free`** only. Voice uses the **browser Web Speech API** (free).

## Critical path

1. **Remove CopilotKit entirely** (see `docs/DECOUPLING.md`). Own runtime
   (TanStack AI + AG-UI) with Threads in SQLite. Prerequisite for the PWA and
   usage tracking. `harness/decouple-copilotkit`.
2. **PWA shell** — mobile-first, manifest + service worker, single entry point
   to the orchestrator; text + Web Speech (SpeechRecognition / SpeechSynthesis).
3. **New Dots** — add `notifications-comms-dot` (Comms & Alerts area); keep
   orchestrator + dev / saas / home areas.
4. **Skills** (`/skills/*.md`) loaded into agent context:
   `frontend-ui-ux-design-skill.md`, `godot-gamedev-skill.md`,
   `saas-stripe-ops-skill.md`.
5. **Obsidian** (`OBSIDIAN_VAULT_PATH`) read/write tool + auto context
   (`GDD.md`, `DevLog.md`).
6. **Usage tracker** — per-Dot OpenCode Go token accounting, quota widget on
   desktop dashboard and PWA alerts panel.
7. **Notifications** — PWA notification cards + Telegram inline approvals
   (already implemented in the harness base).
8. **Dev containers** — Docker-backed workspaces for web dev and Godot.

## Constraints

- Zero paid services: no Twilio/PagerDuty/Vapi/paid voice. Remove the paid
  Realtime voice path; use Web Speech API.
- OpenRouter models are forced to `:free` with tool-calling.
- Single owner; private access over Tailscale/LAN.

## Environment variables (added)

`OPENCODE_GO_API_KEY`, `OPENCODE_GO_BASE_URL`, `OPENCODE_GO_MODEL` ·
`OPENROUTER_API_KEY` · `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` ·
`HA_URL`, `HA_TOKEN` · `OBSIDIAN_VAULT_PATH` · `OPENCODE_GO_QUOTA_TOKENS`.
