// GET /api/bob/performance — the Performance matrix over bob's projections.
import { buildMatrix } from '@/lib/bob/matrix.ts'
import { readPerformance } from '@/lib/bob/projection-reader.ts'
import { screenJson } from '@/lib/bob/screen-api.ts'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return screenJson(request, async (orgId, q) => {
    const r = await readPerformance(orgId, q)
    return {
      window: r.window, watermark: r.watermark, channels: r.channels, cellStateView: r.cellStateView,
      matrix: buildMatrix(r.counts, r.responseTimes, r.selected),
    }
  })
}
