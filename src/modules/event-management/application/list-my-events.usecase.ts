import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort, DateRangeFilter } from '../domain/event.repository.port.js';
import type { Event } from '../domain/event.js';

export class ListMyEventsUseCase {
  constructor(private readonly eventRepo: EventRepositoryPort) {}

  async execute(caller: IdentityContext, dateRange?: DateRangeFilter): Promise<Event[]> {
    return this.eventRepo.listByOwner(caller.userId, dateRange);
  }
}
