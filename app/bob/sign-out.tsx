'use client'
import { useState } from 'react'
import { signOut } from '@/lib/bob/sign-out.ts'

export function SignOut() {
  const [busy, setBusy] = useState(false)
  return (
    <button type="button" disabled={busy} onClick={() => { setBusy(true); void signOut() }}
      style={{ marginLeft: 'auto', padding: '4px 10px', border: '1px solid #ccc', borderRadius: 6, background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
      Cerrar sesión
    </button>
  )
}
