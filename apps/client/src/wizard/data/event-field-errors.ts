import { ApiError, type UpdateEventInput } from '@invitaciones/api-client';

export type EventFieldErrors = Partial<Record<keyof UpdateEventInput, string>>;

const messages: EventFieldErrors = {
  name: 'Escribe un nombre de entre 1 y 160 caracteres.',
  serviceId: 'Selecciona un servicio de la lista.',
  socialType: 'Selecciona un tipo de evento de la lista.',
  eventDateTime: 'Captura una fecha y hora válidas.',
  eventEndDateTime: 'Revisa la fecha y hora de finalización.',
  timeZone: 'Selecciona una zona horaria de la lista.',
  capacity: 'Escribe una capacidad válida en número entero, mayor que cero.',
  locationUrl: 'Revisa el enlace de ubicación. Copia el enlace directo desde la página de destino.',
  giftRegistryUrl: 'Revisa el enlace de la mesa de regalos. Copia el enlace directo desde la página de destino.'
};

export function eventFieldErrors(error: unknown): EventFieldErrors {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {};
  return Object.fromEntries(
    error.validationFields.flatMap((field) => {
      const message = Object.hasOwn(messages, field) ? messages[field as keyof UpdateEventInput] : undefined;
      return message ? [[field, message]] : [];
    })
  );
}
