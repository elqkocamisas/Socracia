# Política de privacidad de Socracia

**Última actualización:** 28 de octubre de 2026

Socracia es una aplicación de autoaprendizaje basada en la mayéutica. Esta
política describe qué datos trata la aplicación y con qué finalidad. Está
redactada para reflejar lo que el código hace realmente; si el comportamiento
cambia, este documento debe cambiar en el mismo pull request.

## Resumen en una frase

Los documentos que el usuario adjunta **nunca salen de su dispositivo**. Lo único
que puede viajar a un servidor es el progreso agregado, y solo si el usuario crea
una cuenta y pulsa sincronizar.

## 1. Responsable

- **Aplicación:** Socracia
- **Identificador de paquete:** `com.socracia.app`
- **Contacto de privacidad:** privacidad@socracia.app

<!-- dev:nota-interna -->

Antes de publicar en las tiendas, sustituya la dirección de contacto por un buzón
real y operativo. Un contacto que no responde es motivo de rechazo en App Store.

<!-- /dev:nota-interna -->

## 2. Qué datos trata la app

### 2.1 Documentos que el usuario adjunta (solo en el dispositivo)

El usuario puede adjuntar ficheros PDF, TXT o MD como temario. La aplicación:

- extrae el texto en el propio dispositivo;
- lo divide en fragmentos y calcula sus embeddings en el propio dispositivo;
- guarda los fragmentos y el índice vectorial en una base de datos SQLite local
  (`expo-sqlite`).

Estos documentos, su texto, sus fragmentos y sus embeddings **no se envían a
ningún servidor**, ni siquiera si el usuario inicia sesión. No hay ninguna ruta
en la API que los acepte.

La app incluye un ajuste de procesamiento en «Cuenta → Privacidad». De fábrica
está en **solo-dispositivo**, que es el modo descrito aquí. La opción de permitir
procesamiento en un servidor existe para versiones futuras con corpus en la nube;
si el usuario la activa, la app deja de prometer que nada sale del dispositivo y
lo indica en esa misma pantalla. El modo elegido se guarda en el dispositivo y
cada documento importado registra si se autorizó o no, de modo que el usuario
puede auditar qué material se procesó fuera.

<!-- dev:nota-interna -->
Cuando se active `allow-cloud` en producción, revise también:

- `apps/mobile/store/privacy-declarations.json` (hoy declara que los documentos
  no se transmiten);
- el texto de `docs/terms-of-use.md` sobre contenido de terceros.

Mientras el ajuste siga en solo-dispositivo, las declaraciones de tienda son
correctas tal cual.
<!-- /dev:nota-interna -->

### 2.2 Progreso de estudio

La app guarda en el dispositivo: preguntas generadas, respuestas del usuario,
evaluaciones, perfil de lagunas, estado de repaso espaciado y sesiones de estudio.

Si el usuario crea una cuenta y pulsa «Sincronizar», se envía a la API
únicamente el **progreso agregado**: evaluaciones, estado de repaso, sesiones y
perfil de lagunas, junto con marcas temporales para resolver conflictos. El
paquete no incluye los documentos ni su texto.

### 2.3 Cuenta (opcional)

Crear una cuenta es opcional. La app funciona completa sin cuenta; en ese caso no
se envía nada a ningún servidor.

Si el usuario crea una cuenta, se tratan:

- **Correo electrónico:** identificador de la cuenta.
- **Contraseña:** nunca se almacena en claro. Se guarda como derivación `scrypt`
  con sal aleatoria por cuenta; la comparación se hace en tiempo constante.
- **Token de sesión:** aleatorio de 32 bytes, para autenticar las peticiones.
- **Progreso agregado:** lo descrito en el punto 2.2.

### 2.4 Qué NO recoge la app

La aplicación **no** recoge ni transmite:

- datos de localización;
- contactos, calendario ni ficheros del dispositivo distintos de los que el
  usuario adjunta de forma explícita;
- identificadores de publicidad (IDFA / GAID);
- datos de uso con fines publicitarios;
- datos de salud, financieros o biométricos.

La app **no** integra SDKs de publicidad, analítica ni rastreo de terceros, y no
realiza seguimiento entre aplicaciones o sitios web. Esto se declara así en el
manifiesto de privacidad de iOS (`NSPrivacyTracking: false`) y en la ficha de
Google Play.

## 3. Dónde se tratan los datos

- **En el dispositivo:** los documentos, su texto, los fragmentos, los embeddings
  y —si no hay cuenta— todo el progreso.
- **En el servidor:** solo si el usuario crea una cuenta y sincroniza. Se tratan
  el correo, la derivación de la contraseña y el progreso agregado.

## 4. Para qué se usan

| Dato | Finalidad | Base jurídica (RGPD) |
| --- | --- | --- |
| Documentos y texto | Generar preguntas y recuperar fragmentos en el dispositivo | No hay tratamiento por nuestra parte: no salen del dispositivo |
| Progreso agregado | Continuar el estudio en otro dispositivo | Ejecución de un contrato (el servicio solicitado) |
| Correo y contraseña | Autenticar la cuenta | Ejecución de un contrato |
| Token de sesión | Mantener la sesión iniciada | Ejecución de un contrato |

No se usan para elaborar perfiles comerciales ni para publicidad. No hay
decisiones automatizadas con efectos jurídicos.

## 5. Conservación

- **En el dispositivo:** hasta que el usuario borre el documento en la app o
  desinstale la aplicación.
- **En el servidor:** mientras exista la cuenta. Al eliminarla, se borran la
  cuenta, la sesión y el progreso asociado.

## 6. Cesiones y encargados

No se venden ni se ceden datos personales a terceros. No hay transferencias
internacionales más allá del proveedor de alojamiento donde se despliegue la API,
que debe documentarse antes de publicar (ver la lista de comprobación de
publicación).

## 7. Derechos del usuario

El usuario puede ejercer los derechos de acceso, rectificación, supresión,
portabilidad, limitación y oposición escribiendo a privacidad@socracia.app. En la
propia app:

- puede **borrar cualquier documento** desde la biblioteca;
- puede **cerrar sesión** y seguir usando la app sin cuenta;
- puede **eliminar la cuenta** desde la propia pantalla de cuenta, sin escribir a
  nadie. El borrado elimina la cuenta y el progreso guardado en el servidor; el
  progreso del dispositivo se conserva para que siga estudiando sin cuenta.

## 8. Menores

La app no está dirigida a menores de 14 años y no recoge datos de forma
consciente de ellos.

## 9. Seguridad

- Las contraseñas se guardan como derivación `scrypt` con sal por cuenta y se
  comparan en tiempo constante.
- Los tokens de sesión son aleatorios de 32 bytes.
- La API impone el identificador de usuario en el servidor a partir del token:
  no acepta el identificador que envíe el cliente, lo que impide escribir el
  progreso de otra cuenta manipulando la petición.
- Las comunicaciones con la API deben ir siempre sobre HTTPS.

Ningún sistema es infalible; si se detecta una brecha, se notificará conforme al
RGPD.

## 10. Cambios en esta política

Cualquier cambio se reflejará en este documento y en su fecha de actualización.
Los cambios sustanciales se anunciarán en la ficha de la aplicación.

## 11. Reclamaciones

El usuario puede reclamar ante la Agencia Española de Protección de Datos
(<https://www.aepd.es>) o ante la autoridad de control de su país de residencia.
