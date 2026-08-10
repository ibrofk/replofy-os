import { File, Image, Paperclip, Video, X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type { AIContextAttachment } from '../../services/standaloneClient';
import {
  aiAttachmentKind,
  filesToAIContextAttachments,
  formatAIAttachmentSize,
  MAX_AI_ATTACHMENTS,
} from '../../utils/aiAttachments';

export function AIAttachmentPicker({
  attachments,
  onChange,
  onError,
  disabled = false,
}: {
  attachments: AIContextAttachment[];
  onChange: (attachments: AIContextAttachment[]) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    event.target.value = '';
    if (!files?.length) return;
    try {
      const next = await filesToAIContextAttachments(files);
      if (attachments.length + next.length > MAX_AI_ATTACHMENTS) {
        throw new Error(`Attach up to ${MAX_AI_ATTACHMENTS} files per message.`);
      }
      onChange([...attachments, ...next]);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Could not attach the selected files.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
          <Paperclip className="h-3.5 w-3.5" />
          Attach files
          <input type="file" multiple accept="*/*" disabled={disabled || attachments.length >= MAX_AI_ATTACHMENTS} onChange={(event) => void handleChange(event)} className="sr-only" />
        </label>
        <span className="text-[11px] text-zinc-500">Images, videos, PDFs, documents, and text files · 15 MB each</span>
      </div>
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => {
            const kind = aiAttachmentKind(attachment);
            const icon = kind === 'image'
              ? <Image className="h-3.5 w-3.5" />
              : kind === 'video'
                ? <Video className="h-3.5 w-3.5" />
                : <File className="h-3.5 w-3.5" />;
            return (
              <div key={attachment.id} className="flex max-w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700">
                {kind === 'image' ? <img src={attachment.dataUrl} alt="" className="h-7 w-7 rounded object-cover" /> : icon}
                <span className="max-w-48 truncate" title={attachment.fileName}>{attachment.fileName}</span>
                <span className="shrink-0 text-zinc-400">{formatAIAttachmentSize(attachment.fileSize)}</span>
                <button type="button" onClick={() => onChange(attachments.filter((item) => item.id !== attachment.id))} disabled={disabled} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-800 disabled:opacity-50" aria-label={`Remove ${attachment.fileName}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
