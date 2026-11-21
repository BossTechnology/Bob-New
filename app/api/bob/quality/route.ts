// GET /api/bob/quality — NPS, ORGA, MECA and the label failures over bob's projections.
import { readQuality } from '@/lib/bob/projection-reader.ts'
import { buildQuality } from '@/lib/bob/screens.ts'
import { screenJson } from '@/lib/bob/screen-api.ts'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return screenJson(request, async (orgId, q) => {
    const r = await readQuality(orgId, q)
    return {
      window: r.window, watermark: r.watermark, channels: r.channels, cellStateView: r.cellStateView,
      screen: buildQuality(r.sentiment, r.counts, r.selected),
    }
  })
}
