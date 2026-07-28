import { Injectable } from '@nestjs/common';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { AppConfigService } from '../config/app-config.service';
import { DomainError } from '../common/errors/domain-error';

@Injectable()
export class PhoneNormalizer {
  constructor(private readonly config: AppConfigService) {}

  normalize(input: string): string {
    const phone = parsePhoneNumberFromString(input, this.config.phoneDefaultRegion as CountryCode);

    if (!phone?.isValid()) {
      throw new DomainError('CONTACT_PHONE_INVALID', 'The WhatsApp phone number is invalid.');
    }

    return phone.number;
  }
}
