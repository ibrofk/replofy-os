import assert from 'node:assert/strict';
import test from 'node:test';
import { aiContextAttachmentSchema, aiContextEnvelopeSchema } from './types.js';

function attachment(fileSize = 1) {
  return {
    id: 'attachment-1',
    fileName: 'notes.txt',
    mimeType: 'text/plain',
    fileSize,
    dataUrl: 'data:text/plain;base64,SGk=',
  };
}

test('AI context accepts a valid attachment and preserves its metadata', () => {
  const parsed = aiContextEnvelopeSchema.safeParse({
    userPrompt: 'Analyze this file.',
    attachments: [attachment(2)],
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.attachments[0]?.fileName, 'notes.txt');
    assert.equal(parsed.data.attachments[0]?.fileSize, 2);
  }
});

test('AI context rejects oversized individual and combined attachments', () => {
  assert.equal(aiContextAttachmentSchema.safeParse(attachment(15 * 1024 * 1024 + 1)).success, false);
  assert.equal(aiContextEnvelopeSchema.safeParse({
    userPrompt: 'Analyze these files.',
    attachments: [
      attachment(15 * 1024 * 1024),
      { ...attachment(), id: 'attachment-2', fileSize: 15 * 1024 * 1024 },
      { ...attachment(), id: 'attachment-3', fileSize: 10 * 1024 * 1024 + 1 },
    ],
  }).success, false);
});
