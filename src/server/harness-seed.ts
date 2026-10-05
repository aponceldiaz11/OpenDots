import type { Dot } from '../shared/types.js';
import { providerSeed } from './providers.js';
import type { Platform } from './platform.js';

interface SeedSpec {
  key: string;
  name: string;
  area: Dot['area'];
  parentKey?: string;
  provider: Dot['providerId'];
  instructions: string;
  sensitiveActions?: boolean;
  telegramNotify?: boolean;
  isOrchestrator?: boolean;
}

const SPECS: SeedSpec[] = [
  {
    key: 'orchestrator',
    name: 'Hermes · Orquestador Central',
    area: 'orchestrator',
    provider: 'opencode-go',
    isOrchestrator: true,
    telegramNotify: true,
    instructions:
      'Eres el agente principal de entrada. Recibe peticiones generales, responde lo que puedas y delega tareas acotadas a los Dots especialistas con delegate_task. Mantén el control, sintetiza los resultados y pide aprobación humana para acciones sensibles.',
  },
  {
    key: 'dev',
    name: 'dev-hermes-dot',
    area: 'dev',
    parentKey: 'orchestrator',
    provider: 'opencode-go',
    telegramNotify: true,
    instructions:
      'Motor autónomo de desarrollo: ejecuta scripts locales, lee y escribe ficheros, hace operaciones git y conduce bucles de refactor. Trabaja en pasos verificables y reporta diffs y comandos ejecutados.',
  },
  {
    key: 'saas-pm',
    name: 'saas-pm-dot',
    area: 'saas',
    parentKey: 'orchestrator',
    provider: 'opencode-go',
    instructions:
      'Product manager del SaaS: recibe feedback y requisitos, redacta User Stories y Bug Specs, y deja especificaciones escritas en las Pages compartidas para que dev-hermes-dot las implemente de forma asíncrona.',
  },
  {
    key: 'saas-ops',
    name: 'saas-ops-dot',
    area: 'saas',
    parentKey: 'orchestrator',
    provider: 'opencode-go',
    sensitiveActions: true,
    telegramNotify: true,
    instructions:
      'Operaciones del SaaS: procesa webhooks y emails, gestiona disputas de Stripe y redacta respuestas a usuarios. Cualquier acción sensible (enviar emails de disputas, reembolsos, pagos) exige request_human_approval antes de ejecutarse.',
  },
  {
    key: 'saas-analytics',
    name: 'saas-analytics-dot',
    area: 'saas',
    parentKey: 'orchestrator',
    provider: 'opencode-go',
    telegramNotify: true,
    instructions:
      'Analítica del SaaS: consulta métricas de negocio (MRR, churn, usuarios) y logs de rendimiento y servidores. Envía alertas proactivas ante errores 500 o caídas de Sentry cuando estén configurados.',
  },
  {
    key: 'home',
    name: 'home-assistant-dot',
    area: 'home',
    parentKey: 'orchestrator',
    provider: 'openrouter-free',
    telegramNotify: true,
    instructions:
      'Domótica: traduce lenguaje natural a llamadas de la API REST o WebSocket de Home Assistant. Confirma el estado antes de actuar y nunca ejecutes acciones destructivas sin aprobación.',
  },
  {
    key: 'comms',
    name: 'notifications-comms-dot',
    area: 'comms',
    parentKey: 'orchestrator',
    provider: 'opencode-go',
    telegramNotify: true,
    instructions:
      'Comunicaciones y alertas: envía tarjetas de aviso al panel de la PWA móvil con send_notification y mensajes de Telegram con botones inline Aprobar/Rechazar para aprobaciones humanas. No uses servicios de pago (nada de Twilio/Vapi/PagerDuty).',
  },
];

export function seedHarness(platform: Platform): { created: string[] } {
  const workspace = platform.workspace;
  if (workspace.dots().some((dot) => dot.isOrchestrator)) return { created: [] };
  const space = workspace.createSpace(
    'Harness',
    'Espacio compartido para especificaciones, memoria y handoffs entre Dots.',
  );
  const created: string[] = [];
  const ids = new Map<string, string>();
  for (const spec of SPECS) {
    const seed = providerSeed(spec.provider, platform.config);
    const dot: Dot = workspace.createDot(
      space.id,
      spec.name,
      spec.instructions,
      true,
      true,
      [space.id],
      null,
      false,
      {
        providerId: spec.provider,
        model: seed.model,
        baseUrl: seed.baseUrl,
        apiKeyEnv: seed.apiKeyEnv,
        area: spec.area,
        parentId: spec.parentKey ? (ids.get(spec.parentKey) ?? null) : null,
        isOrchestrator: spec.isOrchestrator ?? false,
        telegramNotify: spec.telegramNotify ?? false,
        sensitiveActions: spec.sensitiveActions ?? false,
      },
    );
    ids.set(spec.key, dot.id);
    created.push(dot.name);
  }
  return { created };
}
