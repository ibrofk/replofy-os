import type { AIContextAttachment } from '../services/standaloneClient';

export const MAX_AI_ATTACHMENTS = 5;
export const MAX_AI_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_AI_ATTACHMENT_TOTAL_BYTES = 40 * 1024 * 1024;

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error(`Could not read ${file.name}.`));
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function attachmentId(file: File) {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `${file.name}-${file.size}-${file.lastModified}-${Date.now()}`;
}

export async function filesToAIContextAttachments(files: FileList | File[]) {
  const candidates = Array.from(files);
  if (candidates.length > MAX_AI_ATTACHMENTS) {
    throw new Error(`Attach up to ${MAX_AI_ATTACHMENTS} files per message.`);
  }
  const totalBytes = candidates.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_AI_ATTACHMENT_TOTAL_BYTES) {
    throw new Error('The selected files are too large together. Keep the total under 40 MB.');
  }

  return Promise.all(candidates.map(async (file): Promise<AIContextAttachment> => {
    if (file.size > MAX_AI_ATTACHMENT_BYTES) {
      throw new Error(`${file.name} is too large. Each file must be 15 MB or smaller.`);
    }
    return {
      id: attachmentId(file),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
      dataUrl: await readAsDataUrl(file),
    };
  }));
}

export function formatAIAttachmentSize(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${Math.round(bytes / 1_024)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(bytes >= 10 * 1_024 * 1_024 ? 0 : 1)} MB`;
}

export function aiAttachmentKind(attachment: Pick<AIContextAttachment, 'mimeType'>) {
  if (attachment.mimeType.startsWith('image/')) return 'image';
  if (attachment.mimeType.startsWith('video/')) return 'video';
  if (attachment.mimeType.startsWith('audio/')) return 'audio';
  return 'file';
}
