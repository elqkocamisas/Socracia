# Política de privacidad de Socracia

**Última actualización:** 28 de octubre de 2026

Socracia es una aplicación de autoaprendizaje basada en la mayéutica. Esta
política describe qué datos trata la aplicación y con qué finalidad. Está
redactada para reflejar lo que el código hace realmente; si el comportamiento
cambia, este documento debe cambiar en el mismo pull request.

## Resumen en una frase

Los documentos que el usuario adjunta **no se suben** a nuestros servidores: se
procesan en el dispositivo. Si el usuario lo autoriza expresamente, algunos
fragmentos del temario y sus respuestas pueden enviarse para que un modelo
redacte y evalúe las preguntas. Sin esa autorización, no sale nada del
dispositivo salvo el progreso agregado, y solo si hay cuenta y sincronización.

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

Estos documentos, su texto, sus fragmentos y sus embeddings **no se suben a
ningún servidor**: no hay ninguna ruta en la API que acepte un documento. Su
procesamiento —extracción, fragmentación, embeddings e índice— ocurre entero en
el dispositivo.

La única excepción es la del punto 2.3: si el usuario autoriza el asistente con
modelo, el **fragmento concreto** que respalda cada pregunta viaja junto a esa
pregunta para que el modelo la redacte o la evalúe. Nunca viaja el documento
completo. Sin esa autorización, ni siquiera los fragmentos salen del dispositivo.

La app incluye un ajuste de procesamiento en «Cuenta → Privacidad». De fábrica
está en **solo-dispositivo**, que es el modo descrito aquí. El modo elegido se
guarda en el dispositivo y cada documento importado registra si se autorizó o no,
de modo que el usuario puede auditar qué material se procesó fuera.

<!-- dev:nota-interna -->

El asistente con modelo (punto 2.3) ya existe en el código y es la ruta real por
la que puede salir contenido. Cuando cambie el modo por defecto, revise también:

- `apps/mobile/store/privacy-declarations.json` (hoy declara la transmisión
  transitoria del asistente como recogida solo con consentimiento);
- el texto de `docs/terms-of-use.md` sobre contenido generado con modelo.

Mientras el ajuste siga en solo-dispositivo por defecto, las declaraciones de
tienda son correctas tal cual.
<!-- /dev:nota-interna -->

### 2.2 Progreso de estudio

La app guarda en el dispositivo: preguntas generadas, respuestas del usuario,
evaluaciones, perfil de lagunas, estado de repaso espaciado y sesiones de estudio.

Si el usuario crea una cuenta y pulsa «Sincronizar», se envía a la API
únicamente el **progreso agregado**: evaluaciones, estado de repaso, sesiones y
perfil de lagunas, junto con marcas temporales para resolver conflictos. El
paquete no incluye los documentos ni su texto.

### 2.3 Asistente con modelo (opcional y bajo consentimiento)

La app puede apoyarse en un modelo de lenguaje para evaluar respuestas y redactar
las preguntas y las repreguntas. Cuando está activo, deja de evaluarse todo en el
dispositivo y algunas peticiones van a un servidor. Para que eso ocurra hacen
falta **dos** condiciones a la vez:

1. que la versión instalada tenga habilitado el asistente con modelo, y
2. que el usuario lo autorice en **«Cuenta → Privacidad»**, que de fábrica está en
   **solo-dispositivo**.

Cuando el usuario lo autoriza, con cada pregunta que responde se envían al
servidor:

- el **enunciado de la pregunta** y la **respuesta del alumno**;
- la **respuesta de referencia** y los **términos clave** del concepto, derivados
  del temario;
- el **fragmento del temario** que respalda la pregunta (no el documento
  completo), para que el modelo no invente y se pueda citar la fuente.

El servidor reenvía esos datos al proveedor del modelo, que devuelve el texto.
**El servidor no los almacena ni los escribe en ningún registro**: los atiende en
memoria y los descarta al responder. No se usan para entrenar modelos ni para
perfiles comerciales. La clave del proveedor vive solo en el servidor; la
aplicación nunca la lleva incorporada y no habla con el proveedor directamente.

El usuario revoca este permiso en cualquier momento desde la misma pantalla. La
revocación es inmediata: a partir de ese momento la evaluación vuelve a hacerse
en el dispositivo y no se envía ninguna petición más. Esta autorización es
distinta de la de procesar documentos: son ajustes separados y se auditan por
separado.

### 2.4 Cuenta (opcional)

Crear una cuenta es opcional. La app funciona completa sin cuenta; en ese caso no
se envía nada a ningún servidor.

Si el usuario crea una cuenta, se tratan:

- **Correo electrónico:** identificador de la cuenta.
- **Contraseña:** nunca se almacena en claro. Se guarda como derivación `scrypt`
  con sal aleatoria por cuenta; la comparación se hace en tiempo constante.
- **Token de sesión:** aleatorio de 32 bytes, para autenticar las peticiones.
- **Progreso agregado:** lo descrito en el punto 2.2.

### 2.5 Qué NO recoge la app

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
  y —si no hay cuenta ni asistente con modelo— todo el progreso.
- **En el servidor:** solo si el usuario crea una cuenta y sincroniza. Se tratan
  el correo, la derivación de la contraseña y el progreso agregado. Además, si el
  usuario autoriza el asistente con modelo, se tratan de forma **transitoria** los
  datos del punto 2.3 (pregunta, respuesta, referencia y fragmento citado), sin
  almacenarlos.

## 4. Para qué se usan

| Dato                         | Finalidad                                                  | Base jurídica (RGPD)                                           |
| ---------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| Documentos y texto           | Generar preguntas y recuperar fragmentos en el dispositivo | No hay tratamiento por nuestra parte: no salen del dispositivo |
| Progreso agregado            | Continuar el estudio en otro dispositivo                   | Ejecución de un contrato (el servicio solicitado)              |
| Correo y contraseña          | Autenticar la cuenta                                       | Ejecución de un contrato                                       |
| Token de sesión              | Mantener la sesión iniciada                                | Ejecución de un contrato                                       |
| Pregunta, respuesta y pasaje | Evaluar y redactar con modelo (asistente con modelo)       | Consentimiento explícito, revocable en cualquier momento       |

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
