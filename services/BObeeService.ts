// Backend Discovery §4.6 — BObee insights and chat over Claude Sonnet.
import { callClaude, MODELS } from '@/lib/claude'
import type { DashboardState, ChatMessage, BObeeInsights } from '@/lib/types'

const EXPLANATION_PROMPT = (lang: string) =>
  `You are BObee. Explain what the current dashboard data means in plain language. Language: ${lang}. 2-3 sentences, specific.`
const RECOMMENDATION_PROMPT = (lang: string) =>
  `You are BObee. Give specific, actionable next steps based on the current data state. Language: ${lang}. 2-3 bullet-style sentences.`
const PREDICTION_PROMPT = (lang: string) =>
  `You are BObee. Predict what is likely to happen next based on current trends. Language: ${lang}. 2-3 sentences.`

export class BObeeService {
  buildContext(s: DashboardState): string {
    return [
      `Industry: ${s.industry} | Lang: ${s.lang}`,
      `Channels: ${s.channels.map((c) => c.name + ':' + c.live).join(', ')}`,
      `Sessions: ${s.sessions} | AvgTime: ${s.avgTime}min`,
      `Metrics:`,
      ...s.metrics.map((m) => ` ${m.name}: ${m.total} (C:${m.pcts[0]}% AI:${m.pcts[1]}% H:${m.pcts[2]}%)`),
      `Sentiment: A${s.sentiment.angry}% U${s.sentiment.unsatisfied}% S${s.sentiment.satisfied}% C${s.sentiment.content}% H${s.sentiment.happy}%`,
      `Alerts: ${s.alertCount}`,
    ].join('\n')
  }

  private callClaude(system: string, context: string) {
    return callClaude({ model: MODELS.sonnet, maxTokens: 400, system, messages: [{ role: 'user', content: context }] })
  }

  async generateInsights(context: string, lang: string): Promise<BObeeInsights> {
    const [explanation, recommendation, prediction] = await Promise.all([
      this.callClaude(EXPLANATION_PROMPT(lang), context),
      this.callClaude(RECOMMENDATION_PROMPT(lang), context),
      this.callClaude(PREDICTION_PROMPT(lang), context),
    ])
    return { explanation, recommendation, prediction }
  }

  async chat(messages: ChatMessage[], context: string, lang: string, metricScope?: string): Promise<string> {
    const system = `You are BOBee, BOb's AI assistant. ${context}
${metricScope ? 'Focus on: ' + metricScope : ''}
Language: ${lang}. Be specific and concise.`
    return callClaude({ model: MODELS.sonnet, maxTokens: 600, system, messages })
  }
}
