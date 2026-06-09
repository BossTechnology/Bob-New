// §5.7 POST /api/ai/sentiment — classify a message (service role).
import { NextRequest } from 'next/server'
import { requireService } from '@/lib/auth'
import { sentimentService } from '@/services'
import { ok, badReq, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    requireService(request)
    const body = await request.json().catch(() => null)
    if (!body?.text) return badReq('Missing text')
    const result = await sentimentService.classifyMessage(body.text, body.lang || 'es')
    return ok(result)
  } catch (e) {
    return handle(e)
  }
}
