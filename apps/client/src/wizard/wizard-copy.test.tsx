import type { Event } from '@invitaciones/api-client';
import { AppThemeProvider } from '@invitaciones/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { configuredEvent } from '../test/fixtures';
import { WizardLayout } from './WizardLayout';
import { blockerMessage, errorMessage, operationReference } from './wizard-utils';
import { ApiError } from '@invitaciones/api-client';

const presentations: Array<[Event['status'], string]> = [
  ['DRAFT', 'En preparación'],
  ['CONFIGURED', 'En preparación'],
  ['READY_TO_ACTIVATE', 'Listo para activar'],
  ['ACTIVE', 'Activo'],
  ['EVENT_DAY', 'Día del evento'],
  ['CLOSED', 'Cerrado'],
  ['ALBUM_PUBLISHED', 'Álbum publicado'],
  ['ARCHIVED', 'Archivado'],
  ['CANCELLED', 'Cancelado']
];

describe('wizard copy presentation', () => {
  it.each(presentations)('presents %s as user-facing copy', (status, label) => {
    const { unmount } = render(
      <AppThemeProvider>
        <WizardLayout
          event={{ ...configuredEvent, status }}
          steps={['datos', 'contactos', 'invitacion', 'confirmacion', 'croquis', 'revision']}
          selectedStep="datos"
          editable={status === 'DRAFT' || status === 'CONFIGURED' || status === 'READY_TO_ACTIVATE'}
          saveState="saved"
          message={undefined}
          busy={false}
          onDismissMessage={vi.fn()}
          onGo={vi.fn()}
          onExit={vi.fn()}
        >
          <div>Contenido</div>
        </WizardLayout>
      </AppThemeProvider>
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(status)).not.toBeInTheDocument();
    expect(screen.queryByText('Guardar y continuar')).not.toBeInTheDocument();
    expect(screen.queryByText('Guardar y salir')).not.toBeInTheDocument();
    expect(screen.queryByText(/backend|servidor/i)).not.toBeInTheDocument();
    unmount();
  });

  it.each([
    ['EVENT_NOT_EDITABLE', 'Este evento ya no puede modificarse.'],
    ['EVENT_INVALID_STATE_TRANSITION', 'Este evento todavía no puede activarse.'],
    ['EVENT_LOCATION_URL_MISSING', 'Agrega la ubicación del evento.'],
    ['EVENT_GIFT_REGISTRY_URL_MISSING', 'Agrega la mesa de regalos.'],
    ['CLIENT_NOT_ACTIVE', 'Tu cuenta no está habilitada para realizar esta acción.'],
    ['IDEMPOTENCY_CONFLICT', 'No pudimos completar esta operación. Actualiza la información e inténtalo nuevamente.'],
    ['INVITATION_DESIGN_NOT_FOUND', 'Todavía no hay un diseño de invitación.'],
    ['INVITATION_DESIGN_CONFLICT', 'El diseño cambió al mismo tiempo. Actualiza la vista e inténtalo nuevamente.'],
    ['INVITATION_DESIGN_SERVICE_MISMATCH', 'El diseño actual no corresponde al formato de invitación elegido.'],
    ['INVITATION_DESIGN_EVENT_STATE_LOCKED', 'El diseño ya no puede modificarse en el estado actual del evento.'],
    ['FLIPBOOK_PAGE_LIMIT_EXCEEDED', 'El Flipbook admite un máximo de 10 páginas.'],
    ['HOTSPOT_EXTERNAL_LINK_LIMIT_EXCEEDED', 'Puedes agregar hasta tres enlaces adicionales.'],
    ['HOTSPOT_QR_PAGE_ALREADY_DEFINED', 'Ya elegiste otra página para mostrar el QR.'],
    [
      'HOTSPOT_VISUAL_OWNER_NOT_OPERATIONAL',
      'El orden no cambió porque algunas acciones dependen de la portada o de la página QR. Revisa esas acciones primero.'
    ],
    ['HOTSPOT_COORDINATES_INVALID', 'Coloca el área completamente dentro de la imagen.']
  ])('translates %s into actionable copy', (code, expected) => {
    const error = new ApiError(409, code, 'technical detail', 'op-123');
    expect(errorMessage(error)).toBe(expected);
    expect(operationReference(error)).toBe('Referencia: op-123');
  });

  it.each([
    ['FLYER_RSVP_HOTSPOT_MISSING', 'Falta agregar la acción para confirmar asistencia.'],
    ['FLYER_QR_AREA_HOTSPOT_MISSING', 'Falta indicar dónde mostrar el QR.'],
    [
      'FLIPBOOK_COVER_GIFT_REGISTRY_HOTSPOT_MISSING',
      'Falta agregar en la portada la acción para abrir la mesa de regalos.'
    ],
    ['FLIPBOOK_QR_PAGE_MISSING', 'Falta indicar en qué página se mostrará el QR.']
  ])('translates the design requirement %s without exposing its code', (code, expected) => {
    expect(blockerMessage(code)).toBe(expected);
    expect(blockerMessage(code)).not.toContain(code);
  });
});
