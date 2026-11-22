// Security decisions in the box, one JSON line each (ASVS 4.0.3 V7.1.3,
// V7.2, V7.3.1). JSON.stringify escapes line breaks, so a value cannot forge
// a line. Never a password, a token, an email or a query string.
export function securityLine(event: string, fields: Record<string, string | null | undefined>): string {
  return JSON.stringify({ log: 'security', at: new Date().toISOString(), event, ...fields })
}

export const logSecurity = (event: string, fields: Record<string, string | null | undefined>) =>
  console.info(securityLine(event, fields))
