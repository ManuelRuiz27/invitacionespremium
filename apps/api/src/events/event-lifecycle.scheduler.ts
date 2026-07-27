import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventLifecycleService } from './event-lifecycle.service';

@Injectable()
export class EventLifecycleScheduler {
  private readonly logger = new Logger(EventLifecycleScheduler.name);

  constructor(@Inject(EventLifecycleService) private readonly lifecycle: EventLifecycleService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'events-enter-event-day' })
  async advanceEventsToEventDay(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      const transitioned = await this.lifecycle.advanceEventsToEventDay();
      if (transitioned > 0) {
        this.logger.log({ event: 'events_entered_event_day', count: transitioned });
      }
    } catch (error) {
      this.logger.error({
        event: 'event_day_transition_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
    }
  }
}
