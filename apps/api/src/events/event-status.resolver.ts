import { EventStatus, type EventSocialType } from '../generated/prisma/client';

export interface EventPreparationData {
  name: string | null;
  serviceId: string | null;
  socialType: EventSocialType | null;
  eventDateTime: Date | null;
  timeZone: string | null;
  capacity: number | null;
}

export interface EventActivationChecklist {
  basicDataComplete: boolean;
  contactsImplemented: boolean;
  designImplemented: boolean;
  confirmationImplemented: boolean;
  floorplanValidationImplemented: boolean;
  financialValidationImplemented: boolean;
}

export function resolvePreparationStatus(data: EventPreparationData): EventStatus {
  const checklist = resolveActivationChecklist(data);
  if (!checklist.basicDataComplete) {
    return EventStatus.DRAFT;
  }

  if (
    checklist.contactsImplemented &&
    checklist.designImplemented &&
    checklist.confirmationImplemented &&
    checklist.floorplanValidationImplemented &&
    checklist.financialValidationImplemented
  ) {
    return EventStatus.READY_TO_ACTIVATE;
  }

  return EventStatus.CONFIGURED;
}

export function resolveActivationChecklist(data: EventPreparationData): EventActivationChecklist {
  return {
    basicDataComplete:
      data.name !== null &&
      data.name.trim().length > 0 &&
      data.serviceId !== null &&
      data.socialType !== null &&
      data.eventDateTime !== null &&
      data.timeZone !== null &&
      data.capacity !== null,
    contactsImplemented: false,
    designImplemented: false,
    confirmationImplemented: false,
    floorplanValidationImplemented: false,
    financialValidationImplemented: false
  };
}
