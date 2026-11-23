// What the sign-in form says for each refusal. Kept apart from login.ts so
// the form does not pull server code into the browser bundle.
export function loginErrorText(status: number): string {
  if (status === 429) return 'Demasiados intentos; espera unos minutos'
  if (status === 503) return 'La identidad de la caja no responde'
  if (status === 403 || status === 415) return 'La solicitud vino de otro origen; recarga la página'
  return 'Credenciales inválidas'
}
