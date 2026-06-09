'use client'
// §5.1 Minimal login page — posts to /auth/login, then opens the dashboard.
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setLoading(false)
    if (res.ok) window.location.href = '/dashboard.html'
    else setError('Credenciales inválidas')
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'DM Sans, Arial, sans-serif', background: '#0b0d12', color: '#fff' }}>
      <form onSubmit={onSubmit} style={{ width: 320, display: 'grid', gap: 12, padding: 28, borderRadius: 16, background: '#151922' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>BOb — Business Observer</h1>
        <p style={{ margin: 0, opacity: 0.6, fontSize: 13 }}>Inicia sesión para continuar</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
          style={{ padding: 10, borderRadius: 8, border: '1px solid #2a3140', background: '#0b0d12', color: '#fff' }} />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required
          style={{ padding: 10, borderRadius: 8, border: '1px solid #2a3140', background: '#0b0d12', color: '#fff' }} />
        {error && <span style={{ color: '#f66', fontSize: 13 }}>{error}</span>}
        <button type="submit" disabled={loading}
          style={{ padding: 10, borderRadius: 8, border: 0, background: '#3b82f6', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
          {loading ? '...' : 'Entrar'}
        </button>
        <a href="/demo" style={{ textAlign: 'center', color: '#9aa', fontSize: 13 }}>Ver demo →</a>
      </form>
    </main>
  )
}
