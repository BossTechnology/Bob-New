// GET /api/bob/interactions — Sesiones, Canales and Tiempo Prom. over bob's projections.
import { readInteractions } from '@/lib/bob/projection-reader.ts'
import { buildInteractions } from '@/lib/bob/screens.ts'
import { screenJson } from '@/lib/bob/screen-api.ts'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return screenJson(request, async (orgId, q) => {
    const r = await readInteractions(orgId, q)
    return {
      window: r.window, watermark: r.watermark, channels: r.channels, cellStates: r.cells !== null,
      screen: buildInteractions(r.durations, r.selected, r.cells),
    }
  })
}
