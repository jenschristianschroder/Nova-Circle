import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventShareRepositoryPort } from '../domain/event-share.repository.port.js';
import type { EventShare, VisibilityLevel } from '../domain/event-share.js';
import { EventSharePolicy } from '../domain/event-share-policy.js';

export class UpdateEventShareUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly shareRepo: EventShareRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    shareId: string,
    visibilityLevel: VisibilityLevel,
  ): Promise<EventShare> {
    const event = await this.eventRepo.findById(eventId);

    EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'update shares');

    const share = await this.shareRepo.findById(shareId);
    if (!share || share.eventId !== eventId) {
      throw Object.assign(new Error('Share not found'), { code: 'NOT_FOUND' });
    }

    const updated = await this.shareRepo.updateVisibility(shareId, visibilityLevel);
    if (!updated) {
      throw Object.assign(new Error('Share not found'), { code: 'NOT_FOUND' });
    }

    return updated;
  }
}
