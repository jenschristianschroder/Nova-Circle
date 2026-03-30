import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventShareRepositoryPort } from '../domain/event-share.repository.port.js';
import type { EventShare } from '../domain/event-share.js';
import { EventSharePolicy } from '../domain/event-share-policy.js';

export class ListEventSharesUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly shareRepo: EventShareRepositoryPort,
  ) {}

  async execute(caller: IdentityContext, eventId: string): Promise<EventShare[]> {
    const event = await this.eventRepo.findById(eventId);

    EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'list shares');

    return this.shareRepo.listByEvent(eventId);
  }
}
