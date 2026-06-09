// §5.4 / §6.2 GET /api/alerts/stream — Server-Sent Events for live alerts.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { org_id } = await requireAuth(['admin', 'analyst'])
  const sb = await getRouteClient()
  const encoder = new TextEncoder()
  let lastSeen = new Date().toISOString()

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`event: ready\ndata: {}\n\n`))
      const interval = setInterval(async () => {
        try {
          const { data } = await sb.from('alerts').select('*')
            .eq('org_id', org_id).gt('occurred_at', lastSeen)
            .order('occurred_at', { ascending: true }).limit(20)
          if (data && data.length) {
            lastSeen = (data[data.length - 1] as { occurred_at: string }).occurred_at
            for (const a of data) controller.enqueue(encoder.encode(`event: alert\ndata: ${JSON.stringify(a)}\n\n`))
          } else {
            controller.enqueue(encoder.encode(`: keep-alive\n\n`))
          }
        } catch {
          clearInterval(interval)
          controller.close()
        }
      }, 5000)
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  })
}
