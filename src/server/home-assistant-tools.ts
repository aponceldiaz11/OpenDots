import { z } from 'zod';
import { defineTool, type ToolDefinition } from './tools.js';

interface HomeAssistantConfig {
  haUrl?: string;
  haToken?: string;
}

/**
 * Home Assistant REST tools. Returns an empty list unless HA_URL and HA_TOKEN
 * are configured. Actions are natural-language translated by the Dot model.
 */
export function homeAssistantTools(config: HomeAssistantConfig): ToolDefinition[] {
  const base = config.haUrl?.replace(/\/$/, '');
  const token = config.haToken;
  if (!base || !token) return [];
  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok)
      throw new Error(`Home Assistant returned HTTP ${response.status}.`);
    return response.json() as Promise<unknown>;
  };
  return [
    defineTool({
      name: 'ha_list_states',
      description:
        'List Home Assistant entity states, optionally filtered by domain (light, switch, climate, sensor…).',
      parameters: z.object({ domain: z.string().max(60).optional() }),
      execute: async ({ domain }) => {
        const states = (await call('/api/states')) as unknown[];
        return states
          .map((entry) => entry as Record<string, unknown>)
          .filter(
            (entry) =>
              typeof entry.entity_id === 'string' &&
              (!domain || entry.entity_id.startsWith(`${domain}.`)),
          )
          .slice(0, 150)
          .map((entry) => {
            const attributes = entry.attributes as
              | Record<string, unknown>
              | undefined;
            return {
              entity_id: entry.entity_id,
              state: entry.state,
              name: attributes?.friendly_name,
            };
          });
      },
    }),
    defineTool({
      name: 'ha_call_service',
      description:
        'Call a Home Assistant service, e.g. light.turn_on, switch.toggle, climate.set_temperature. Confirm state before destructive actions.',
      parameters: z.object({
        domain: z.string().min(1).max(60),
        service: z.string().min(1).max(60),
        entity_id: z.string().max(120).optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: ({ domain, service, entity_id, data }) =>
        call(`/api/services/${domain}/${service}`, {
          method: 'POST',
          body: JSON.stringify({ entity_id, ...(data ?? {}) }),
        }),
    }),
  ];
}
