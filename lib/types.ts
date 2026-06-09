// Shared domain types — derived from Backend Discovery §2 (schema) and §4 (services).

export type MetricName =
  | 'sessions' | 'avgtime' | 'sentiment' | 'res' | 'aba' | 'des' | 'der' | 'alu' | 'quality'

export type Window = 'live' | '1h' | '24h' | '7d' | '30d'
export type Actor = 'customer' | 'ai' | 'human' | 'all'
export type Sev = 'critical' | 'warning' | 'info'

export interface MetricSnapshot {
  org_id: string
  metric: string
  channel_id: string
  window: Window
  total: number
  pct_customer: number
  pct_ai: number
  pct_human: number
  extra_data?: Record<string, unknown>
  recorded_at?: string
}

export interface SentimentReading {
  angry: number
  unsatisfied: number
  satisfied: number
  content: number
  happy: number
  sample_size?: number
}

export interface NotificationRule {
  id: string
  org_id: string
  metric_id: string
  channel_id: string
  actor: Actor
  upper_threshold: number | null
  lower_threshold: number | null
  trend_threshold: number | null
  trend_window_min: number
  keyword: string | null
  keyword_position: number | null
  notify_email: boolean
  email_recipients: string[]
  notify_sms: boolean
  sms_recipients: string[]
  notify_slack: boolean
  slack_webhook: string | null
  notify_call: boolean
  call_recipients: string[]
  suppression_min: number
  escalation_min: number
  active: boolean
}

export interface BobAlert {
  id: string
  org_id: string
  rule_id?: string | null
  metric_id: string
  metric_name: string
  channel_id: string
  actor: Actor
  breach_type: 'upper' | 'lower' | 'trend' | 'keyword'
  value: number
  threshold: number
  excess_pct?: number | null
  sev: Sev
  status: 'active' | 'acknowledged' | 'investigating' | 'resolved' | 'suppressed' | 'expired'
  occurred_at: string
}

export interface BobAnomaly {
  id: string
  org_id: string
  type: 'anomaly' | 'incident' | 'issue'
  sev: Sev
  metric: string
  title: string
  desc?: string | null
  status: 'active' | 'open' | 'investigating' | 'escalated' | 'resolved'
  channel_id?: string | null
  sigma?: number | null
  baseline?: number | null
  actual?: number | null
  occurred_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface DashboardState {
  industry: string
  lang: string
  channels: { name: string; live: number }[]
  sessions: number
  avgTime: number
  metrics: { name: string; total: number; pcts: [number, number, number] }[]
  sentiment: SentimentReading
  alertCount: number
}

export interface BObeeInsights {
  explanation: string
  recommendation: string
  prediction: string
}

export interface AuthContext {
  user_id: string
  org_id: string
  role: string
}
