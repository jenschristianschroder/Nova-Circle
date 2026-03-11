import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { IImageExtractionAdapter } from './image-extraction.port.js';
import type { CapturePipelineService, CaptureResult } from './capture-pipeline.service.js';

export interface CaptureImageCommand {
  /** URI of the image blob that has already been stored. */
  readonly imageBlobUri: string;
  readonly groupId: string | null;
}

/**
 * Accepts a pre-stored image blob URI, extracts candidate fields via the image extraction adapter,
 * then passes the results through the shared capture pipeline.
 *
 * The normalization step (Step 2) is: image blob → ExtractionCandidate (text + structured fields).
 * All subsequent pipeline steps are identical to text capture.
 */
export class CaptureImageUseCase {
  constructor(
    private readonly imageAdapter: IImageExtractionAdapter,
    private readonly pipeline: CapturePipelineService,
  ) {}

  async execute(caller: IdentityContext, command: CaptureImageCommand): Promise<CaptureResult> {
    if (!command.imageBlobUri.trim()) {
      throw Object.assign(new Error('imageBlobUri must not be empty'), { code: 'VALIDATION_ERROR' });
    }

    // Step 2: Normalize – extract text and structured fields from image.
    const extraction = await this.imageAdapter.extractFields(command.imageBlobUri);

    // Pass through the shared pipeline (steps 3–6).
    // Pre-extracted fields are forwarded so the pipeline can merge them with text-based extraction.
    return this.pipeline.run(caller, {
      text: extraction.extractedText ?? '',
      groupId: command.groupId,
      rawInputType: 'image',
      audioBlobReference: null,
      imageBlobReference: command.imageBlobUri,
      preExtractedFields: extraction.fields,
    });
  }
}
