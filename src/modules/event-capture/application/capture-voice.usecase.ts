import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { ISpeechToTextAdapter } from './speech-to-text.port.js';
import type { CapturePipelineService, CaptureResult } from './capture-pipeline.service.js';

export interface CaptureVoiceCommand {
  /** URI of the audio blob that has already been stored. */
  readonly audioBlobUri: string;
  readonly groupId: string | null;
}

/**
 * Accepts a pre-stored audio blob URI, transcribes it via the speech-to-text adapter,
 * then passes the transcript through the shared capture pipeline.
 *
 * The normalization step (Step 2) is: audio blob → transcript string.
 * All subsequent pipeline steps are identical to text capture.
 */
export class CaptureVoiceUseCase {
  constructor(
    private readonly sttAdapter: ISpeechToTextAdapter,
    private readonly pipeline: CapturePipelineService,
  ) {}

  async execute(caller: IdentityContext, command: CaptureVoiceCommand): Promise<CaptureResult> {
    if (!command.audioBlobUri.trim()) {
      throw Object.assign(new Error('audioBlobUri must not be empty'), {
        code: 'VALIDATION_ERROR',
      });
    }

    // Step 2: Normalize – transcribe audio to text.
    const transcript = await this.sttAdapter.transcribe(command.audioBlobUri);

    // Pass the transcript through the shared pipeline (steps 3–6).
    return this.pipeline.run(caller, {
      text: transcript.transcript,
      groupId: command.groupId,
      rawInputType: 'voice',
      audioBlobReference: command.audioBlobUri,
      imageBlobReference: null,
    });
  }
}
