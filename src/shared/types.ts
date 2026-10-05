export type Status =
  'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export interface Settings {
  name: string;
  paused: boolean;
  researchAllowed: boolean;
  memoryAllowed: boolean;
}
export interface Task {
  id: string;
  prompt: string;
  status: Status;
  intervalSeconds: number | null;
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  lease: string | null;
  leaseUntil: number | null;
}
export interface Source {
  title: string;
  url: string;
  excerpt: string;
}
export interface Result {
  text: string;
  sources: Source[];
  sample: boolean;
  screenshot?: string;
}
export interface Run {
  id: string;
  taskId: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  result: Result | null;
  error: string | null;
}
export interface TaskEvent {
  id: number;
  taskId: string;
  runId: string | null;
  text: string;
  createdAt: number;
}
export interface Memory {
  id: string;
  text: string;
  createdAt: number;
}
export interface Detail {
  task: Task;
  runs: Run[];
  events: TaskEvent[];
}
export interface State {
  settings: Settings;
  tasks: Task[];
  memories: Memory[];
  mode: 'sample' | 'live';
  configured: boolean;
}
export type Action = 'run' | 'pause' | 'cancel';
export interface Space {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}
export type ProviderId =
  'opencode-go' | 'openrouter-free' | 'openai' | 'custom';
export type DotArea =
  | 'orchestrator'
  | 'dev'
  | 'saas'
  | 'home'
  | 'comms'
  | 'general';
export interface DotProviderConfig {
  /** Inference provider used to route this Dot's turns. */
  providerId: ProviderId;
  /** Model override; falls back to the provider default. */
  model?: string | null;
  /** Base URL override for a compatible endpoint. */
  baseUrl?: string | null;
  /** Name of the server env var holding this Dot's credential. */
  apiKeyEnv?: string | null;
}
export interface Dot {
  id: string;
  /** Default destination for saved pages, not ownership. */
  spaceId: string;
  spaceIds: string[];
  name: string;
  instructions: string;
  researchAllowed: boolean;
  memoryAllowed: boolean;
  createdAt: number;
  learningContainerId?: string | null;
  skillDeliveryEnabled?: boolean;
  /** Inference provider routing (multi-provider harness). */
  providerId: ProviderId;
  model?: string | null;
  baseUrl?: string | null;
  apiKeyEnv?: string | null;
  /** Hierarchy: which area this Dot belongs to. */
  area: DotArea;
  /** Parent Dot id; the orchestrator has no parent. */
  parentId?: string | null;
  /** Root orchestrator agent. */
  isOrchestrator?: boolean;
  /** Proactive Telegram notifications for this Dot. */
  telegramNotify?: boolean;
  /** Sensitive actions require human approval before execution. */
  sensitiveActions?: boolean;
}
export type ApprovalDecision = 'approved' | 'rejected' | 'expired';
export interface ApprovalRecord {
  id: string;
  dotId: string;
  threadId?: string | null;
  title: string;
  summary: string;
  status: ApprovalDecision | 'pending';
  createdAt: number;
  decidedAt?: number | null;
  decidedBy?: string | null;
}
export interface Conversation {
  id: string;
  dotId: string;
  ownerId: string;
  title: string;
  createdAt: number;
  /** Frozen at creation; null means this conversation does not participate. */
  learningContainerId?: string | null;
}
export interface CallReceipt {
  anchorMessageId?: string | null;
  id: string;
  threadId: string;
  startedAt: number;
  endedAt: number | null;
  status: 'connecting' | 'active' | 'ended' | 'failed';
  transcript: string;
  error: string | null;
}
export interface SetupStatus {
  intelligence: boolean;
  model: boolean;
  browser: boolean;
  voice: boolean;
  slack: string;
  missing: string[];
}
export interface WorkspaceState {
  spaces: Space[];
  dots: Dot[];
  conversations: Conversation[];
  setup: SetupStatus;
  calls: CallReceipt[];
  approvals: ApprovalRecord[];
  telegram: boolean;
  notifications: NotificationRecord[];
  usage: UsageSummary;
}
export interface NotificationRecord {
  id: string;
  dotId: string;
  title: string;
  body: string;
  level: 'info' | 'warning' | 'critical';
  status: 'unread' | 'read';
  createdAt: number;
}
export interface UsageSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  quotaTokens: number | null;
  last5hTokens: number;
  last5hRequests: number;
  byProvider: { providerId: string; tokens: number; requests: number }[];
}
