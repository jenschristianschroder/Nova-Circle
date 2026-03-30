import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventShareRepositoryPort } from '../domain/event-share.repository.port.js';
import { EventSharePolicy } from '../domain/event-share-policy.js';

export interface RevokeResult {
  readonly shareId: string;
  readonly groupId: string;
}

export class RevokeEventShareUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly shareRepo: EventShareRepositoryPort,
  ) {}

  async execute(caller: IdentityContext, eventId: string, shareId: string): Promise<RevokeResult> {
    const event = await this.eventRepo.findById(eventId);

    EventSharePolicy.assertOwnerOfPersonalEvent(event, caller, 'revoke shares');

    const share = await this.shareRepo.findById(shareId);
    if (!share || share.eventId !== eventId) {
      throw Object.assign(new Error('Share not found'), { code: 'NOT_FOUND' });
    }

    await this.shareRepo.delete(shareId);

    return { shareId: share.id, groupId: share.groupId };
  }
}
