# 0001 — /entrar acepta el token del portal sin nonce en v1

- **Fecha:** 2026-11-26
- **Estado:** propuesta (pendiente de la firma de Henry)

## Contexto
En la caja, BOb ya no tiene login propio. El portal de BzzzBX le pasa la sesión
por el fragmento de `/entrar`, con `#bob_at=<access_token>&ir=<ruta>`. La página
lo envía a `/auth/portal`, que le pregunta a GoTrue de quién es el token
(`GET /user`) y lo guarda como la cookie de sesión de BOb. Antes borra la
sesión que hubiera (`clearSessionCookies`, `lib/bob/portal.ts`).

La revisión independiente de #63 encontró un login CSRF. Alguien con su propia
cuenta en la misma caja puede armar un enlace `/entrar#bob_at=<su token>` y
hacérselo abrir a otra persona. El POST a `/auth/portal` es del mismo origen,
así que pasa el guard de escrituras, y esa persona queda dentro de BOb con la
cuenta de quien armó el enlace, como viewer, en lugar de con la suya.

Lo que no permite:
- leer nada de la cuenta de la víctima;
- salir de la organización de la caja: el token es de la misma caja y GoTrue lo
  verifica;
- más rol que el de la cuenta de quien armó el enlace.

El riesgo es que la víctima vea los datos de esa cuenta creyendo que son los
suyos, o que lo que haga quede a nombre de la otra cuenta, con su rol. Si esa
cuenta es viewer, la víctima no puede escribir reglas. Si es admin o analyst,
lo que escriba queda a nombre de quien armó el enlace, que ya podía hacerlo.

Cerrarlo pide que BOb y el portal compartan un `state` o nonce: BOb lo crea
antes de mandar al portal, el portal lo devuelve en el fragmento y `/entrar`
solo acepta un token que venga con el nonce que este navegador pidió.

## Opciones consideradas
1. Aceptar el riesgo en v1, dejarlo escrito y poner el nonce como tarea de v1.1.
2. Hacer el nonce ya: un cambio en Bzzz (`portal.js` guarda y devuelve el
   `state`) y en BOb (cookie con el nonce al ir al portal, comparación en
   `/auth/portal`), que retrasa el despliegue conjunto de #470 y #63.

## Decisión
Opción 1. Henry, 2026-11-26, a «¿Qué hacemos?»: «Aceptar para v1 con ADR
(Recommended)».

Tarea de v1.1: un nonce entre BOb y el portal.
- Al mandar al portal, BOb guarda un valor aleatorio en una cookie `__Host-`
  httpOnly de vida corta y lo pasa en `?volver=` o en un parámetro propio.
- El portal lo devuelve en el fragmento junto a `bob_at`.
- `/auth/portal` rechaza el token si el nonce no viene o no casa con la cookie,
  y borra la cookie en cualquier caso.
- Tests de cada caso: sin nonce, con nonce de otro navegador, con nonce
  reusado, y uno que se vea fallar con el chequeo quitado.

## Consecuencias
- Se gana: el despliegue conjunto de Bzzz#470 y Bob-New#63 no espera otro
  cambio en el portal.
- Se pierde: hasta v1.1, un enlace armado por otra cuenta de la misma caja puede
  dejar a alguien dentro de BOb con esa cuenta.
- Qué vigilar: `portal.ok` en el registro de seguridad de BOb trae el `user`.
  Varias entradas con el mismo `user` y direcciones distintas en poco tiempo son
  la señal.
- Si BOb pasa a mostrar o guardar datos por persona, esta decisión se revisa
  antes de v1.1.
