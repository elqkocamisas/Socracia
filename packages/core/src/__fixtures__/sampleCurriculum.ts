/**
 * Temario de ejemplo, de autoría propia.
 *
 * Reproduce el estilo y la estructura de un tema de oposiciones (enunciados
 * reglados, definiciones y clasificaciones) sin reproducir texto de terceros.
 * Se usa como corpus de referencia en las pruebas del motor mayéutico.
 */
export const SAMPLE_CURRICULUM_TEXT = `Tema 1. El procedimiento administrativo

El procedimiento administrativo es el cauce formal a través del cual la Administración elabora y exterioriza sus decisiones, garantizando los derechos del interesado y la transparencia de la actuación pública. Se entiende por interesado la persona física o jurídica que promueve el procedimiento o que ostenta derechos que pueden resultar afectados por la resolución. La Administración electrónica consiste en el uso de medios electrónicos para tramitar los procedimientos, de modo que la sede electrónica sustituye al registro presencial tradicional.

Tema 2. La eficacia de los actos administrativos

El acto administrativo es la declaración unilateral de voluntad de la Administración sujeta al derecho administrativo. La eficacia del acto administrativo se caracteriza por desplegar efectos desde su notificación al interesado, salvo que la norma disponga lo contrario. La suspensión del acto consiste en la paralización temporal de sus efectos mientras se resuelve el recurso correspondiente.

Tema 3. La revisión de los actos

El recurso de alzada es el recurso que se interpone ante el órgano superior jerárquico del que dictó el acto impugnado. La revisión de oficio se caracteriza por habilitar a la Administración para anular sus propios actos nulos de pleno derecho sin necesidad de instancia externa. La revocación de actos consiste en la retirada de un acto de gravamen por razones de oportunidad o legalidad sobrevenida.`;

/** Documento de ejemplo que acompaña al temario en las pruebas. */
export const SAMPLE_DOCUMENT = {
  id: 'doc-temario-1',
  title: 'Temario de ejemplo — procedimiento y actos administrativos',
  mimeType: 'text/plain',
  sourceKind: 'document' as const,
  uri: 'file:///socracia/ejemplos/temario-1.txt',
  sizeBytes: SAMPLE_CURRICULUM_TEXT.length,
  ingestedAt: 0,
  cloudConsent: false,
};
