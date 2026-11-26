'use client'
// Reads the portal's token from the fragment, clears it, and hands it to
// /auth/portal. On failure it says so and offers the portal as a link: it
// never sends the person back by itself (no loop).
import { useEffect, useState } from 'react'
import { handover } from '@/lib/bob/portal-handover.ts'

export default function Handover({ portal }: { portal: string }) {
  const [message, setMessage] = useState('')
  useEffect(() => {
    void handover({
      hash: window.location.hash,
      clearHash: () => window.history.replaceState(null, '', window.location.pathname),
      post: (url, init) => fetch(url, init),
      replace: (url) => window.location.replace(url),
      show: setMessage,
    })
  }, [])
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 420, margin: '15vh auto', padding: 16 }}>
      {message
        ? <>
            <p>{message}</p>
            <p><a href={portal}>Entrar por el portal de BzzzBX</a></p>
          </>
        : <p>Entrando en BOb…</p>}
    </main>
  )
}
