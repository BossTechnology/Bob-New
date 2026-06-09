// Shared Claude API client — Backend Discovery §8.1.
// Server-side only: the ANTHROPIC_API_KEY is never exposed to the browser.
import { sleep } from './utils'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

// Model ids per §8.1 / §8.4. NOTE: the documents pin claude-sonnet-4-20250514;
// keep these constants as the single source of truth so the model can be bumped
// in one place (the current GA Sonnet is claude-sonnet-4-6).
export const MODELS = {
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-haiku-4-5-20251001',
} as const

type ClaudeMessage = { role: 'user' | 'assistant'; content: string }

export interface CallClaudeOptions {
  model: (typeof MODELS)[keyof typeof MODELS]
  system: string
  messages: ClaudeMessage[]
  maxTokens?: number
}

async function logTokenUsage(model: string, usage: unknown): Promise<void> {
  // Best-effort cost logging (§8.1). The usage_log table is optional; swallow
  // errors so logging never breaks an AI response.
  try {
    const u = usage as { input_tokens?: number; output_tokens?: number } | undefined
    if (!u) return
    const { getServiceClient } = await import('./supabase')
    await getServiceClient().from('usage_log').insert({
      model,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
    })
  } catch {
    /* usage_log not provisioned — ignore */
  }
}

// Calls Claude with exponential backoff on 429 (1s, 2s, 4s; max 3 attempts).
export async function callClaude(options: CallClaudeOptions): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: options.maxTokens || 600,
          system: options.system,
          messages: options.messages,
        }),
      })
      if (res.status === 429) {
        await sleep(Math.pow(2, attempt) * 1000)
        continue
      }
      const data = await res.json()
      await logTokenUsage(options.model, data.usage)
      const blocks = (data.content as { type: string; text?: string }[]) || []
      return blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('') || ''
    } catch (e) {
      if (attempt === 2) throw e
    }
  }
  return '' // exhausted retries
}

// Parses a JSON object out of a Claude text response (strips markdown fences).
export function parseClaudeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim()) as T
  } catch {
    return fallback
  }
}
