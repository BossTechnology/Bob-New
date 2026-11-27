// BOb's loading screen, the same as Hivemonic's (see pantalla.module.css).
// Painting only: /entrar's handover and the screens' data live elsewhere.
// app/_carga is a private folder: no route.
import boss from './boss.png'
import styles from './pantalla.module.css'

type Props =
  | { lema: string; mensaje?: undefined; enlace?: undefined }
  | { mensaje: string; enlace: { href: string; texto: string }; lema?: undefined }

export function PantallaCarga(p: Props) {
  return (
    <main className={styles.pantalla}>
      <div className={styles.contenido}>
        {/* A static asset under /_next/static, so it is served in the box
            (lib/bob/surface.ts) without the image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={boss.src} width={boss.width} height={boss.height} alt="Boss Technology" className={styles.logo} />
        {p.mensaje
          ? <>
              <p role="alert" className={styles.mensaje}>{p.mensaje}</p>
              <a href={p.enlace.href} className={styles.enlace}>{p.enlace.texto}</a>
            </>
          : <>
              <p role="status" className={styles.lema}>{p.lema}</p>
              <div className={styles.barra} aria-hidden="true" />
            </>}
      </div>
    </main>
  )
}
