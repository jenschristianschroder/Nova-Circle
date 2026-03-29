import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventShareRepositoryPort } from '../domain/event-share.repository.port.js';

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
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    if (event.groupId !== null) {
      throw Object.assign(new Error('Only personal events can be shared to groups'), {
        code: 'FORBIDDEN',
      });
    }

    if (event.ownerId !== caller.userId) {
      throw Object.assign(new Error('Only the event owner can revoke shares'), {
        code: 'FORBIDDEN',
      });
    }

    const share = await this.shareRepo.findById(shareId);
    if (!share || share.eventId !== eventId) {
      throw Object.assign(new Error('Share not found'), { code: 'NOT_FOUND' });
    }

    await this.shareRepo.delete(shareId);

    return { shareId: share.id, groupId: share.groupId };
  }
}
