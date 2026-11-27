// Who a /bob screen is painted for. Presentation only: the figures, the reads
// and who may enter are the same for every role.
//
// Henry, 2026-11-27 («oculta la jerga a los viewers para el lunes»): a viewer
// sees the screens in the client's words, with no table, column, capability,
// contract or organization id. Admin and analyst keep the technical view.
// Outside the box there is no BOb role (the screens are a developer's matrix
// behind BOB_PERF_MATRIX=1), so they stay technical.
import type { Role } from './roles.ts'

export type Audience = 'client' | 'technical'

export const audienceFor = (role: Role | null): Audience => (role === 'viewer' ? 'client' : 'technical')

// The client's words for what the technical view says with table names.
export const CLIENT_TEXT = {
  noData: 'Sin datos',
  noFigure: 'No disponible',
  provisional: 'Cifra provisional',
  readError: 'No se pudieron cargar los datos. Inténtalo de nuevo en unos minutos.',
  unlabeledTurns: 'Turnos sin clasificar',
} as const

// The red "no configurado en la selección" line, for a client.
export const noDataFor = (selected: number) =>
  selected === 1 ? 'Sin datos para este canal' : 'Sin datos para estos canales'

// The window as a client reads it. The server paints it in UTC; the browser
// repaints it in the viewer's own time zone (LocalWindow).
export function formatWindow(from: Date, to: Date, timeZone?: string): string {
  const f = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short', timeZone })
  const zone = timeZone === 'UTC' ? ' (UTC)' : ''
  return `Del ${f.format(from)} al ${f.format(to)}${zone}`
}
