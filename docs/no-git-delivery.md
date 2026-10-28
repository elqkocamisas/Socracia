# Entrega, arranque y publicación sin Git

Hay entornos donde Git no está disponible o no se quiere usar: una máquina
corporativa sin permisos, una entrega a un tercero, un despliegue que parte de
un archivo, o un equipo que simplemente no usa control de versiones. Esta guía
cubre las tres fases: **obtener el código**, **arrancarlo** y **publicarlo en
las tiendas**.

## 1. Obtener el código sin Git

### Opción A — Paquete de código fuente (recomendada)

Un `.tar.gz` con el código y un manifiesto de integridad. No necesita Git ni
red saliente desde la máquina de destino.

```bash
npm run package:source
# Crea dist/socracia-0.1.0-fuente.tar.gz y dist/socracia-0.1.0.manifest.json
```

Para instalarlo en la máquina de destino:

```bash
mkdir socracia && tar -xzf socracia-0.1.0-fuente.tar.gz -C socracia
cd socracia && npm ci && npm run verify
```

El paquete **no** incluye `node_modules` (se regeneran con `npm ci`, que es
reproducible gracias a `package-lock.json`), ni artefactos de build, ni
secretos. `packageRelease.test.ts` comprueba que un fichero de credenciales
nunca pueda colarse.

### Opción B — Copia directa de un directorio

Si ya tiene el proyecto en otra máquina, copie el directorio excluyendo lo
reinstalable:

```bash
rsync -a --exclude node_modules --exclude dist --exclude .git \
      --exclude .expo --exclude coverage ./socracia/ destino:/socracia/
```

### Opción C — Archivo ZIP del repositorio

Si el código está en GitHub y la máquina de destino tiene navegador pero no Git,
descargue «Code → Download ZIP» de la rama que quiera. **Aviso:** el ZIP de
GitHub no trae `.git`, así que pierde el historial; para un despliegue
reproducible prefiera la opción A.

### Verificar la integridad de la entrega

```bash
sha256sum -c <(node -e '
  const m = require("./dist/socracia-0.1.0.manifest.json");
  for (const f of m.files) console.log(f.sha256 + "  " + f.path);
')
```

## 2. Arrancar el proyecto sin Git

Los pasos no cambian respecto a un clon con Git:

```bash
npm ci            # instala exactamente lo del lockfile
npm run verify    # lint + typecheck + pruebas de los tres workspaces
npm start         # arranca Expo (app móvil)
```

Requisitos: Node 20 o superior y npm. Para el móvil, la app Expo Go en el
teléfono o un emulador. No hace falta Git en ningún paso.

Si el proyecto se entrega como archivo y no hay `package-lock.json` (por
ejemplo, un ZIP de GitHub), use `npm install` en lugar de `npm ci`; el resultado
puede diferir en versiones menores.

## 3. Publicar en las tiendas sin Git

La publicación con EAS Build y EAS Submit **no depende de Git** para funcionar,
aunque EAS registre por defecto el commit actual cuando hay repositorio.

```bash
npm install -g eas-cli
eas login
eas build --profile production --platform android
eas build --profile production --platform ios
eas submit --profile production --platform android
eas submit --profile production --platform ios
```

En un directorio sin `.git`, EAS puede avisar de que no hay control de
versiones. Dos formas de resolverlo:

- **Añadir el directorio como origen de EAS** y dejar que gestione el proyecto:
  `eas project:init`.
- **Versionar a mano**: suba `version` en `app.json` y deje que
  `autoIncrement: true` (ya configurado en `eas.json`) incremente
  `versionCode` y `buildNumber` en cada build.

Sin Git no hay historial de qué se publicó, así que guarde junto a cada envío:
el `.tar.gz` de origen, el `manifest.json` y el binario resultante. Es la
alternativa práctica a la etiqueta de git que sugiere
`docs/store-release-checklist.md`.

## 4. Comparación de las opciones

| Opción                 | Necesita Git | Trae historial | Reproducible | Tamaño  |
| ---------------------- | ------------ | -------------- | ------------ | ------- |
| A. Paquete de fuente   | No           | No             | Sí (lockfile)| ~380 KB |
| B. Copia con rsync     | No           | No             | Sí           | Variable|
| C. ZIP de GitHub       | No           | No             | Aceptable    | ~1 MB   |
| Clon con Git           | Sí           | Sí             | Sí           | ~1 MB   |

La opción A es la única que además produce un manifiesto con huellas, que es lo
que permite demostrar que la entrega no se alteró por el camino.

## 5. Qué se pierde sin Git

- **Historial de cambios:** no se puede reconstruir por qué se tomó cada
  decisión. Mitigación: `docs/decisions.md` es el registro, y se mantiene
  actualizado a mano.
- **Ramas y revisión:** no hay pull requests. Mitigación: revise con
  `npm run verify` antes de empaquetar y guarde el manifiesto de cada entrega.
- **Etiquetas de versión:** no hay `git tag`. Mitigación: el nombre del archivo
  lleva la versión y el manifiesto la registra con fecha y huellas.

Si en algún momento se recupera Git, el paquete A se puede convertir en
repositorio con `git init && git add . && git commit`; el historial empezaría
ahí, pero nada del código se pierde.
