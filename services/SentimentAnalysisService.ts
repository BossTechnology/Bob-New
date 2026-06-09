// Backend Discovery §4.2 — classifies messages and aggregates channel-weighted
// sentiment distributions for the lollipop chart.
import { getServiceClient } from '@/lib/supabase'
import { callClaude, MODELS, parseClaudeJson } from '@/lib/claude'
import { weightedSentimentAverage, adjustSentiment100 } from '@/lib/utils'
import type { SentimentReading } from '@/lib/types'

type SentimentScore = { state: string; score: number }

export class SentimentAnalysisService {
  // Classify a single message — Claude Haiku (§4.2).
  async classifyMessage(text: string, _lang: string): Promise<SentimentScore> {
    const raw = await callClaude({
      model: MODELS.haiku,
      maxTokens: 80,
      system: 'Classify sentiment. Respond ONLY with JSON: {"state":"angry|unsatisfied|satisfied|content|happy","score":-1.0to1.0}',
      messages: [{ role: 'user', content: `Message: "${text}"` }],
    })
    return parseClaudeJson<SentimentScore>(raw, { state: 'satisfied', score: 0 })
  }

  private async getChannelReading(orgId: string, channelId: string): Promise<SentimentReading> {
    const sb = getServiceClient()
    const { data } = await sb.from('sentiment_readings')
      .select('angry, unsatisfied, satisfied, content, happy, sample_size')
      .eq('org_id', orgId).eq('channel_id', channelId)
      .order('computed_at', { ascending: false }).limit(1).maybeSingle()
    return (data as SentimentReading) || { angry: 0, unsatisfied: 0, satisfied: 100, content: 0, happy: 0, sample_size: 0 }
  }

  // Aggregate per-channel sentiment into an org-level distribution (§4.2).
  async computeDistribution(orgId: string, channelIds: string[]): Promise<SentimentReading> {
    const readings = await Promise.all(channelIds.map((c) => this.getChannelReading(orgId, c)))
    const weighted = weightedSentimentAverage(readings)
    const adjusted = adjustSentiment100(weighted)
    const sb = getServiceClient()
    await sb.from('sentiment_readings').insert({
      org_id: orgId, channel_id: 'all', ...adjusted, computed_at: new Date().toISOString(),
    })
    return adjusted
  }
}
