# Lista de comprobación de publicación en tiendas

Estado a 28 de octubre de 2026. Marque cada casilla **antes** de enviar a
revisión. Los puntos marcados como **bloqueante** provocan rechazo automático o
impiden la subida.

## 0. Puerta de calidad local

- [ ] `npm run verify` pasa (lint + typecheck + pruebas de los tres workspaces).
- [ ] El bundle de producción se genera:
      `cd apps/mobile && npx expo export --platform ios && npx expo export --platform android`.
- [ ] `storeAssets.test.ts` y `storeListing.test.ts` pasan: validan tamaños de
      icono, transparencia, caja segura de Android y longitud de los textos.
- [ ] **Bloqueante:** no hay secretos versionados. Compruebe con
      `git grep -nE "serviceAccount|BEGIN PRIVATE KEY|password" -- ':!*.md'`.

## 1. Identidad y versionado

- [ ] `app.json` declara `bundleIdentifier` y `package` definitivos
      (`com.socracia.app`). **No se pueden cambiar después de publicar.**
- [ ] `version` de `app.json` coincide con la de `package.json` (lo prueba
      `buildConfig.test.ts`).
- [ ] `versionCode` (Android) y `buildNumber` (iOS) suben en cada envío.
      En `eas.json`, `autoIncrement: true` lo hace por usted.
- [ ] Sustituya `ascAppId` en `eas.json` por el identificador real de App Store
      Connect.

## 2. Assets (bloqueante si faltan o tienen el tamaño erróneo)

- [ ] Icono de iOS: 1024×1024, **sin canal alfa**.
- [ ] Icono de Android: adaptativo con primer plano y color de fondo.
- [ ] Icono de ficha de Play: 512×512, sin transparencia.
- [ ] Splash: 1024×1024.
- [ ] Capturas de pantalla: mínimo 3 por plataforma y tamaño. Ya están
      versionadas en `apps/mobile/store/screenshots/` y las valida
      `storeListing.test.ts` (existencia, tamaño exacto y que cada una muestre
      una pantalla distinta). Se generan con
      `npm run generate:screenshots` a partir del **código real** de la app
      (mismo flujo: importar → preguntar → responder → progreso → cuenta).
  - App Store: 6,7" (1290×2796) y, si declara iPad, 12,9".
  - Google Play: teléfono (mínimo 1080×1920) y, opcional, tableta.
- [ ] **Limitación conocida de las capturas versionadas:** se obtienen del
      render web (`react-native-web`), no de un dispositivo. Reproducen la
      interfaz y la lógica reales, pero el aspecto nativo puede diferir en
      tipografía y sombras. Repítalas en simulador o dispositivo antes de
      enviar a revisión:
      `cd apps/mobile && npx expo start` y captura manual, o añada una variante
      del script que use un dispositivo real.
- [ ] Regenerar los assets tras cualquier cambio de marca:
      `node scripts/generate-assets.mjs`.
- [ ] Regenerar las capturas tras cualquier cambio de interfaz:
      `npm run generate:screenshots` (requiere `npm run build` previo).

## 3. Privacidad (bloqueante)

- [ ] `docs/privacy-policy.md` publicado en una **URL pública** y enlazado en
      `store/listing.json`.
- [ ] `docs/terms-of-use.md` publicado en una URL pública.
- [ ] **Sustituya los buzones de contacto** (`privacidad@`, `legal@`,
      `soporte@socracia.app`) por direcciones reales y atendidas. Un contacto
      que rebota es motivo de rechazo en App Store.
- [ ] App Store Connect → App Privacy: declarado según
      `store/privacy-declarations.json`. «Data Not Collected» salvo correo y
      progreso.
- [ ] Play Console → Data safety: declarado según el mismo fichero. Marque
      «no» en uso compartido con terceros.
- [ ] Manifiesto de privacidad de iOS presente en `app.json`
      (`NSPrivacyTracking: false`), con las razones de cada API sensible.
- [ ] Política de privacidad accesible **desde dentro de la app**, no solo en la
      ficha de la tienda (lo exige App Store). Implementado: «Cuenta → Legal y
      privacidad», con el texto generado desde `docs/` por
      `npm run generate:legal`. Verifique que abre **sin conexión**.
- [ ] El ajuste «Cuenta → Privacidad» está en **solo-dispositivo** en el build
      que envía (es el valor por defecto). Si lo cambia a procesamiento en la
      nube, actualice `store/privacy-declarations.json` y el apartado 2.1 de la
      política **en el mismo envío**: declarar «no se transmiten documentos» con
      la nube activada es una declaración falsa.
- [ ] Si despliega la API: documente el proveedor de alojamiento y si implica
      transferencia internacional de datos (sección 6 de la política).

## 4. Permisos y comportamiento en el dispositivo

- [ ] Android: `blockedPermissions` en `app.json` deja fuera ubicación, cámara,
      micrófono, contactos y almacenamiento externo.
- [ ] **No** bloquee `INTERNET`: la sincronización opcional de cuenta lo
      necesita.
- [ ] iOS: los textos de propósito de cada permiso están en español y explican
      para qué se piden.
- [ ] La app funciona **sin cuenta y sin conexión**: es el modo por defecto.
- [ ] La app no se cierra ni se queda en blanco si falta el backend: pruebe
      `npm run verify` y arranque con la API apagada.

## 5. Cumplimiento de contenido y legal

- [ ] App Store Connect → Export Compliance:
      `ITSAppUsesNonExemptEncryption: false` ya está en `app.json`. Confirme que
      solo usa HTTPS estándar.
- [ ] Declare si la app usa contenido generado o gestionado por IA en la ficha,
      cuando la tienda lo pregunte (Play lo hace en «App content»).
- [ ] Los términos dejan claro que el usuario es responsable de los derechos del
      material que adjunta y que la app no redistribuye documentos.
- [ ] Cada pregunta muestra su fuente: verifíquelo en la pantalla de estudio.
- [ ] Play Console → Content rating: complete el cuestionario. Con temario
      educativo suele bastar «Todos», pero **debe** rellenarlo.

## 6. Cuenta y datos del usuario

- [ ] Si la app permite crear cuenta, App Store exige poder **eliminarla** desde
      la propia app. Ya está implementado en la pantalla de cuenta («Eliminar
      cuenta», con confirmación); verifíquelo en el build final. El progreso
      **local** se conserva a propósito: eliminar la cuenta no borra lo que el
      usuario tiene en su dispositivo.
- [ ] El cierre de sesión **no** borra el progreso local (lo prueba
      `accountJourney.e2e.test.tsx`).
- [ ] Documente en la ficha qué se sincroniza y qué no.
- [ ] El usuario puede **borrar cualquier documento** desde la biblioteca
      (botón «Eliminar», con confirmación). Compruebe que tras borrar un
      documento estudiado, la pantalla de progreso no muestra repasos de sus
      conceptos: el borrado arrastra evaluaciones y estado de repaso
      (`ProgressRepository.removeConcepts`).

## 7. Build y firma

- [ ] `eas build --profile production --platform android` genera **AAB**
      (Google Play rechaza APK).
- [ ] `eas build --profile production --platform ios` genera un IPA firmado.
- [ ] Revise que el perfil de producción **no** incluya el cliente de desarrollo
      (lo prueba `buildConfig.test.ts`).
- [ ] `play-service-account.json` **no** está versionado (está en `.gitignore`).
- [ ] Cuenta de desarrollador de Apple activa (99 €/año) y de Google Play
      (25 € único, más verificación de identidad).
- [ ] Rellene Play Console → «Acceso a la app»: si la app requiere cuenta,
      facilite credenciales de prueba al revisor.

## 8. Envío y revisión

- [ ] Textos de ficha cargados desde `store/listing.json` (ya validados contra
      los límites de caracteres).
- [ ] `eas submit --profile production --platform ios` / `android`.
- [ ] Google Play: empiece por el canal **interno**, no producción.
- [ ] App Store: revise las «Notes for Review»; explique que el RAG es local y
      que no hace falta cuenta para probar el flujo principal.
- [ ] Conteste a los revisores en menos de 48 h: un rechazo por falta de
      respuesta retrasa semanas.

## 9. Después de publicar

- [ ] Etiquete la versión publicada en git.
- [ ] Guarde los `SHA256SUMS` del binario enviado, para poder demostrar qué se
      publicó.
- [ ] Prepare el canal de soporte (correo o página) y revíselo.
- [ ] Planifique la siguiente subida de `versionCode`/`buildNumber`.

## Anexo: qué falta en este repositorio para publicar

Son los únicos puntos que **no** puede resolver el código por sí solo:

1. Publicar la política de privacidad y los términos en una URL pública.
2. Direcciones de correo reales y atendidas.
3. Capturas del build nativo (las versionadas salen del render web; ver
   apartado 2).
4. Cuentas de desarrollador y ficheros de firma.
5. Pipeline de CI (decisión D-029: no se incluye a propósito).
