# Política de privacidad de Socracia

**Última actualización:** 30 de octubre de 2026

Socracia es una aplicación de autoaprendizaje basada en la mayéutica. Esta
política describe qué datos trata la aplicación y con qué finalidad. Está
redactada para reflejar lo que el código hace realmente; si el comportamiento
cambia, este documento debe cambiar en el mismo pull request.

## Resumen en una frase

Por defecto, los documentos y las respuestas permanecen en el dispositivo. Si
el usuario inicia sesión, activa el procesamiento en nube y autoriza un documento,
se envían fragmentos citados y respuestas al backend y al proveedor Gemini para
generar preguntas y evaluar respuestas. La sincronización de progreso es una
acción separada y opcional.

## 1. Responsable

- **Aplicación:** Socracia
- **Identificador de paquete:** `com.socracia.app`
- **Contacto de privacidad:** privacidad@socracia.app

<!-- dev:nota-interna -->

Antes de publicar en las tiendas, sustituya la dirección de contacto por un buzón
real y operativo. Un contacto que no responde es motivo de rechazo en App Store.

<!-- /dev:nota-interna -->

## 2. Qué datos trata la app

### 2.1 Documentos que el usuario adjunta

El usuario puede adjuntar ficheros PDF, TXT o MD como temario. La aplicación:

- extrae el texto en el propio dispositivo;
- lo divide en fragmentos y calcula sus embeddings en el propio dispositivo;
- guarda los fragmentos y el índice vectorial en una base de datos SQLite local
  (`expo-sqlite`).

En modo **solo-dispositivo**, ningún contenido del documento sale del teléfono.
El documento completo y sus embeddings nunca se envían. Para usar la generación
y evaluación semántica, el usuario debe iniciar sesión, activar el ajuste de
nube y autorizar el documento al importarlo. En ese caso, la app envía al backend
solo el fragmento citado, la definición y términos del concepto asociado, la
pregunta y la respuesta escrita por el usuario. El backend los remite a Gemini
API; la clave de Gemini permanece en el servidor.

El modo predeterminado es **solo-dispositivo**. La autorización se guarda por
documento al importarlo y no se aplica retroactivamente a documentos anteriores.
Desactivar el ajuste impide nuevos envíos. El proveedor puede tratar o conservar
los datos conforme a sus condiciones de API; borrar el documento local no borra
datos que el proveedor ya haya recibido. La cuota gratuita de Gemini API puede
usar el contenido enviado para mejorar los productos de Google; no use esta
modalidad con material sensible. La cuota, los límites y las condiciones pueden
cambiar, y superar la cuota gratuita puede requerir facturación.

<!-- dev:nota-interna -->

Antes de habilitar `allow-cloud` en una publicación, revise también:

- `apps/mobile/store/privacy-declarations.json`;
- el texto de `docs/terms-of-use.md` sobre contenido de terceros.

Las declaraciones de tienda deben reflejar la transmisión de fragmentos,
respuestas y demás contenido del usuario al backend y a Gemini.
<!-- /dev:nota-interna -->

### 2.2 Progreso de estudio

La app guarda en el dispositivo: preguntas generadas, respuestas del usuario,
evaluaciones, perfil de lagunas, estado de repaso espaciado y sesiones de estudio.

Si el usuario crea una cuenta y pulsa «Sincronizar», se envía a la API
únicamente el **progreso agregado**: evaluaciones, estado de repaso, sesiones y
perfil de lagunas, junto con marcas temporales para resolver conflictos. Esto es
independiente del uso del LLM descrito en 2.1.

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
  y el progreso, tanto si el usuario tiene cuenta como si no.
- **En el servidor y Gemini:** fragmentos, conceptos, preguntas y respuestas
  únicamente cuando están habilitados los controles de autorización.
- **En el servidor de Socracia:** correo, derivación de contraseña y progreso
  agregado si el usuario crea una cuenta y sincroniza.

## 4. Para qué se usan

| Dato                                | Finalidad                                                  | Base jurídica (RGPD)                                                        |
| ----------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Documentos y texto                  | Generar preguntas y recuperar fragmentos en el dispositivo | No salen del dispositivo salvo autorización descrita en 2.1                 |
| Fragmentos y respuestas autorizados | Generación y evaluación semántica                          | Consentimiento explícito mediante el ajuste y la autorización por documento |
| Progreso agregado                   | Continuar el estudio en otro dispositivo                   | Ejecución de un contrato (el servicio solicitado)                           |
| Correo y contraseña                 | Autenticar la cuenta                                       | Ejecución de un contrato                                                    |
| Token de sesión                     | Mantener la sesión iniciada                                | Ejecución de un contrato                                                    |

No se usan para elaborar perfiles comerciales ni para publicidad. No hay
decisiones automatizadas con efectos jurídicos.

## 5. Conservación

- **En el dispositivo:** hasta que el usuario borre el documento en la app o
  desinstale la aplicación.
- **En el servidor:** mientras exista la cuenta. Al eliminarla, se borran la
  cuenta, la sesión y el progreso asociado.

## 6. Cesiones y encargados

Los fragmentos y respuestas autorizados se comparten con Google como proveedor
de procesamiento mediante Gemini API. En su cuota gratuita, Google puede usar
ese contenido para mejorar productos; la modalidad de pago declara que no lo
hace según las condiciones vigentes. La ubicación, conservación, uso y límites
dependen de las condiciones del proveedor y deben revisarse antes de publicar.
El proveedor de alojamiento de la API también debe documentarse en la lista de
comprobación de publicación.

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
