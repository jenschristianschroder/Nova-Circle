import { describe, it, expect } from 'vitest';
import { FakeSpeechToTextAdapter } from './fake-speech-to-text.adapter.js';
import type { ISpeechToTextAdapter } from '../application/speech-to-text.port.js';

describe('FakeSpeechToTextAdapter', () => {
  it('satisfies the ISpeechToTextAdapter interface', () => {
    const adapter: ISpeechToTextAdapter = new FakeSpeechToTextAdapter();
    expect(typeof adapter.transcribe).toBe('function');
  });

  it('returns empty transcript with full confidence when constructed without arguments', async () => {
    const adapter = new FakeSpeechToTextAdapter();
    const result = await adapter.transcribe('blob://audio/default.wav');
    expect(result.transcript).toBe('');
    expect(result.confidence).toBe(1.0);
  });

  it('returns the configured transcript and confidence when constructed with a result', async () => {
    const adapter = new FakeSpeechToTextAdapter({
      transcript: 'Team lunch tomorrow at noon',
      confidence: 0.95,
    });
    const result = await adapter.transcribe('blob://audio/test.wav');
    expect(result.transcript).toBe('Team lunch tomorrow at noon');
    expect(result.confidence).toBe(0.95);
  });

  it('ignores the audioBlobUri argument and always returns the configured result', async () => {
    const adapter = new FakeSpeechToTextAdapter({ transcript: 'Fixed output', confidence: 0.8 });
    const resultA = await adapter.transcribe('blob://audio/a.wav');
    const resultB = await adapter.transcribe('blob://audio/b.wav');
    expect(resultA.transcript).toBe('Fixed output');
    expect(resultB.transcript).toBe('Fixed output');
  });

  it('returns the updated result after setResult is called', async () => {
    const adapter = new FakeSpeechToTextAdapter({ transcript: 'Initial', confidence: 1.0 });
    adapter.setResult({ transcript: 'Updated transcript', confidence: 0.7 });
    const result = await adapter.transcribe('blob://audio/any.wav');
    expect(result.transcript).toBe('Updated transcript');
    expect(result.confidence).toBe(0.7);
  });

  it('resolves to a TranscriptResult (not throws) even for an empty blob URI', async () => {
    const adapter = new FakeSpeechToTextAdapter({ transcript: 'Hello', confidence: 0.9 });
    await expect(adapter.transcribe('')).resolves.toMatchObject({ transcript: 'Hello' });
  });
});
