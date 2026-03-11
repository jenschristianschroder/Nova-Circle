import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { CapturePipelineService, CaptureResult } from './capture-pipeline.service.js';

export interface CaptureTextCommand {
  readonly text: string;
  readonly groupId: string | null;
}

/**
 * Accepts a typed natural language text input and runs it through the shared capture pipeline.
 * Returns either a created event ID or a persisted EventDraft with issue codes.
 */
export class CaptureTextUseCase {
  constructor(private readonly pipeline: CapturePipelineService) {}

  async execute(caller: IdentityContext, command: CaptureTextCommand): Promise<CaptureResult> {
    const trimmed = command.text.trim();
    if (!trimmed) {
      throw Object.assign(new Error('text must not be empty'), { code: 'VALIDATION_ERROR' });
    }

    return this.pipeline.run(caller, {
      text: trimmed,
      groupId: command.groupId,
      rawInputType: 'text',
      audioBlobReference: null,
      imageBlobReference: null,
    });
  }
}
