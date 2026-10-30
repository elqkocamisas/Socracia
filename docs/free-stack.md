# Stack de coste cero

Registro de cada servicio que sostiene la plataforma, su límite gratuito
**verificado en su página oficial** y qué ocurre cuando se agota. El principio es
innegociable: ninguna pieza exige tarjeta, ninguna caduca y ninguna obliga a
pasar a un plan de pago para que el producto siga funcionando.

Los límites gratuitos cambian sin aviso y a menudo se anuncian en la propia
página de precios, no en la de documentación. Por eso cada cifra lleva su fecha
de comprobación y su enlace: una cifra sin fecha es una cifra que miente.

**Fecha de verificación: 2026-10-30.** Ninguna se da de memoria.

---

## 1. Resumen

| Pieza          | Servicio                 | Plan                        | ¿Tarjeta? | ¿Caduca?    |
| -------------- | ------------------------ | --------------------------- | --------- | ----------- |
| Base de datos  | **Neon** Postgres        | Free                        | No        | No          |
| API            | **Render** web service   | Free                        | No        | No (duerme) |
| Web estática   | **Cloudflare Pages**     | Free                        | No        | No          |
| CI             | **GitHub Actions**       | Free (repo público)         | No        | No          |
| LLM            | **BYOK** por tenant      | Plan gratuito del proveedor | No        | No          |
| Almacenamiento | En la propia base (Neon) | Free                        | No        | No          |

## 2. Servicios descartados por incumplir el principio

| Servicio                        | Motivo del descarte                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Postgres gratuito de Render** | «Free Render Postgres databases expire **30 days after creation**». Caduca: prohibido por la regla 3.                                 |
| **Disco persistente de Render** | Solo en planes de pago (`starter` en adelante). El plan gratuito **pierde el sistema de ficheros** en cada suspensión o redespliegue. |
| **APM o colas de pago**         | Cualquier plan gratuito de observabilidad con retención útil o colas gestionadas exige tarjeta.                                       |
| **Subdominios comodín**         | No son gratuitos de forma fiable y dependen del proveedor de DNS. El tenant se resuelve por código (ver D-054).                       |

---

## 3. Base de datos — Neon Postgres (elegido)

**Enlace:** <https://neon.com/pricing> · **Verificado:** 2026-10-30

| Límite             | Valor                                      |
| ------------------ | ------------------------------------------ |
| Proyectos          | 100                                        |
| Cómputo            | 100 CU-horas / mes **por proyecto**        |
| Almacenamiento     | **1 GB por proyecto**                      |
| Tamaño de cómputo  | Hasta 2 CU (8 GB RAM); por defecto 0.25 CU |
| Escalado a cero    | Tras **5 minutos** sin actividad           |
| Tarjeta de crédito | **No requerida**                           |
| Límite temporal    | Ninguno («no time limits»)                 |

El escalado a cero es lo que hace viable el plan: solo se consume cómputo
mientras hay consultas activas. A 0.25 CU, las 100 CU-horas cubren unas **400
horas de cómputo activo**, más de la mitad de las horas de un mes.

**Al agotar el cómputo (100 CU-horas):** el proyecto deja de aceptar consultas
hasta el siguiente ciclo. La API debe responder `503` con `Retry-After` y la app
sigue en modo local-first (la regla 2 lo exige y el Sprint 1 lo prueba).

**Al agotar el almacenamiento (1 GB):** las escrituras fallan. El presupuesto por
tenant (regla 4) debe mantener el total por debajo de 1 GB con margen: cuota por
tenant, retención e instantáneas compactas, con alerta al 80 %.

**Neon frente a Supabase:**

| Criterio      | Neon                        | Supabase                            |
| ------------- | --------------------------- | ----------------------------------- |
| Base de datos | 1 GB / proyecto             | 500 MB / proyecto                   |
| Cómputo       | 100 CU-horas, escala a cero | Compartido, 500 MB RAM              |
| Inactividad   | Escala a cero (no pausa)    | **Pausa el proyecto tras 1 semana** |
| Proyectos     | 100                         | **2 activos**                       |
| RLS           | Sí (Postgres estándar)      | Sí, con `auth.uid()` integrado      |

Se elige **Neon** por el tamaño (1 GB frente a 500 MB) y porque **la pausa por
inactividad de Supabase rompe el arranque en frío de forma más agresiva**: un
proyecto pausado no despierta con una petición, hay que reactivarlo desde el
panel. Neon escala a cero y vuelve «in a few hundred milliseconds». Supabase
queda como alternativa documentada: si en el futuro pesa más su capa de
autenticación integrada, el puerto de repositorio permite cambiar sin tocar el
dominio.

## 4. API — Render web service

**Enlace:** <https://render.com/docs/free> · **Verificado:** 2026-10-30

| Límite                     | Valor                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| Horas de instancia         | **750 / mes** por espacio de trabajo                                     |
| Suspensión por inactividad | Tras **15 minutos** sin tráfico entrante                                 |
| Sistema de ficheros        | **Se pierde** en cada suspensión, reinicio o despliegue                  |
| Postgres gratuito          | **Caduca a los 30 días** — descartado                                    |
| Al agotar las 750 horas    | Render **suspende todos** los servicios gratuitos hasta el mes siguiente |

**Al dormirse (cold start):** la primera petición tarda decenas de segundos. El
cliente reintenta con backoff (regla 2). Un servicio dormido **no consume** horas
de instancia, así que el presupuesto de 750 horas se gasta solo despierto.

**Consecuencia para el diseño:** el sistema de ficheros no es persistente. Por
eso el progreso **no** puede vivir en el `DATA_FILE` actual (`JsonFileProgressStore`)
en producción: se pierde en cada suspensión. Esto refuerza la decisión de mover
la persistencia a Neon en el Sprint 1.

## 5. Web estática — Cloudflare Pages

**Enlace:** <https://developers.cloudflare.com/pages/platform/limits/> ·
**Verificado:** 2026-10-30

| Límite                      | Valor                   |
| --------------------------- | ----------------------- |
| Compilaciones               | 500 / mes; 1 simultánea |
| Ficheros por sitio          | 20 000                  |
| Tamaño por fichero          | 25 MiB                  |
| Ancho de banda              | **Ilimitado**           |
| Despliegues de vista previa | Ilimitados              |
| Tarjeta                     | No requerida            |

Es el alojamiento de la consola docente (Sprint 7). GitHub Pages queda como
alternativa (1 GB de sitio, 100 GB/mes de ancho de banda «soft», 10 builds/hora),
pero Cloudflare Pages no impone ese ancho de banda y sirve desde su CDN.

## 6. CI — GitHub Actions

**Enlace:** <https://docs.github.com/en/billing/concepts/product-billing/github-actions>
· **Verificado:** 2026-10-30

| Ámbito                            | Incluido                                              |
| --------------------------------- | ----------------------------------------------------- |
| **Repositorio público**           | **Gratis** en runners estándar, sin límite de minutos |
| Repositorio privado (GitHub Free) | ~2 000 minutos Linux/mes ($12 USD de cómputo)         |
| Almacenamiento de artefactos      | 500 MB                                                |

El repositorio `elqkocamisas/Socracia` es **público** (verificado vía API), así
que las copias periódicas del Sprint 8 no consumen minutos. Si el repositorio
pasara a privado, los ~2 000 minutos mensuales siguen siendo holgados para un
`verify` diario, pero el dato cambia: por eso queda anotado.

## 7. LLM — BYOK por tenant

No hay clave de plataforma. Cada organización aporta su propia clave de un
proveedor con plan gratuito (regla 3 y Sprint 6). La plataforma **no asume el
coste** y puede ofrecer el servicio sin gastar un euro.

| Proveedor     | Plan gratuito                                          | Fuente                                              |
| ------------- | ------------------------------------------------------ | --------------------------------------------------- |
| Google Gemini | Límites por proyecto (RPM / TPM / RPD) sin facturación | <https://ai.google.dev/gemini-api/docs/rate-limits> |
| Groq          | Plan Free con RPM / RPD / TPM / TPD por modelo         | <https://console.groq.com/docs/rate-limits>         |

Los límites varían por modelo y se aplican **por proyecto**, no por clave. Antes
de fijar una cuota por tenant hay que comprobar el modelo concreto: la tabla de
Gemini se carga por JavaScript y las cifras cambian con frecuencia.

> **Aviso de privacidad (bloqueante para Sprint 6).** Algunos planes gratuitos de
> proveedores usan el contenido enviado para mejorar sus productos. Con datos de
> alumnos —posiblemente menores— eso no es aceptable por defecto. El Sprint 6
> exige verificar qué proveedor admite datos de alumnos y **bloquear el modo LLM
> para ese tenant** salvo autorización explícita del administrador; por defecto,
> heurística. Queda pendiente de revisión humana.

**Al agotar la cuota del proveedor:** la ruta responde `429` (ya lo hace
`statusFor` en `apps/api/src/llm.ts`), la app cae a la heurística y la sesión no
se rompe.

## 8. Comportamiento degradado por límite

Cada límite tiene una respuesta probada, no una promesa (regla 2):

| Se agota               | Respuesta                                                                    | Dónde se prueba                   |
| ---------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| Cómputo de Neon        | API `503` + `Retry-After`; app sigue local-first                             | Sprint 1                          |
| Almacenamiento de Neon | Escritura rechazada; el usuario conserva lo local                            | Sprint 1                          |
| Horas de Render        | Suspensión hasta el mes siguiente; la app no depende de la API para estudiar | Sprint 1                          |
| Cold start de Render   | Reintento con backoff en el cliente                                          | Sprint 1                          |
| Cuota del LLM          | Heurística; `429` en la ruta                                                 | Ya parcial (Sprint 6 lo completa) |
| Compilaciones de Pages | Se sirve el último despliegue; no bloquea la app                             | Sprint 7                          |

## 9. Presupuesto de almacenamiento por tenant (regla 4)

Con 1 GB por proyecto de Neon y varios tenants, el reparto es lo que mantiene el
plan vivo:

- **Cuota por tenant** con contador de uso, no una esperanza.
- **Retención**: borrado de lo caducado (evaluaciones antiguas, caché de
  documentos) antes de que crezca.
- **Instantáneas compactas**: el progreso se guarda agregado, no como historial
  completo de cada respuesta.
- **Alerta al 80 %** del límite, con métrica por tenant y sin PII.

Esto se implementa y se prueba en los Sprints 1 y 8.

---

## 10. Cómo mantener este documento

1. Antes de añadir un servicio, abra su página de **precios** oficial (no la de
   documentación) y copie la cifra.
2. Anote la fecha. Un límite sin fecha es una suposición.
3. Escriba qué ocurre al agotarlo. Si la respuesta es «se paga», no cumple el
   principio y no entra.
4. Cada dependencia nueva exige una decisión en `docs/decisions.md` con una
   alternativa gratuita comparada.
