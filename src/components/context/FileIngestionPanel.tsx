import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload, X, Eye } from 'lucide-react';
import { extractFilePayload, processPayload, IngestionResult, IngestionPayload, IngestionItemAction } from '../../services/contextIngestionService';
import { UserProfile } from '../../types';
import { FileReviewPanel } from './FileReviewPanel';

type QueuedFile = {
  id: string;
  file: File;
  status: 'queued' | 'extracting' | 'review' | 'processing' | 'done' | 'error';
  message?: string;
  result?: IngestionResult;
  payload?: IngestionPayload;
  extractionData?: { content: string; mimeType: string; contentHash: string; fileSize: number };
};

interface FileIngestionPanelProps {
  userProfile: UserProfile;
  mode: 'onboarding' | 'library';
  onFinished?: () => void;
  onSkip?: () => void;
  className?: string;
}

export function FileIngestionPanel({
  userProfile,
  mode,
  onFinished,
  onSkip,
  className = '',
}: FileIngestionPanelProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [reviewFile, setReviewFile] = useState<{ queuedFile: QueuedFile; payload: IngestionPayload; actions?: IngestionItemAction[] } | null>(null);

  const actor = useMemo(
    () => ({
      userId: userProfile.id,
      companyId: userProfile.companyId ?? null,
    }),
    [userProfile.id, userProfile.companyId]
  );

  const enqueueFiles = (files: File[]) => {
    if (files.length === 0) return;

    const next = files.map((file, index) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${index}`,
      file,
      status: 'queued' as const,
    }));

    setQueue((current) => [...current, ...next]);
    setSummary('');
  };

  const handleSelectFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    enqueueFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    enqueueFiles(Array.from(event.dataTransfer.files || []));
  };

  const updateQueueItem = (id: string, patch: Partial<QueuedFile>) => {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const extractQueuedFiles = async () => {
    const queuedItems = queue.filter(item => item.status === 'queued');
    if (queuedItems.length === 0 || isProcessing) return;

    setIsProcessing(true);

    for (const item of queuedItems) {
      updateQueueItem(item.id, { status: 'extracting', message: 'Extracting with AI...' });

      try {
        const { payload, content, mimeType, contentHash, fileSize } = await extractFilePayload(item.file);
        const reviewReadyItem: QueuedFile = {
          ...item,
          status: 'review',
          message: 'Ready for review',
          payload,
          extractionData: { content, mimeType, contentHash, fileSize },
        };
        updateQueueItem(item.id, {
          ...reviewReadyItem,
        });
        if (queuedItems.length === 1) {
          setReviewFile({ queuedFile: reviewReadyItem, payload: reviewReadyItem.payload! });
        }
      } catch (error) {
        updateQueueItem(item.id, {
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to extract',
        });
      }
    }

    setIsProcessing(false);
  };

  const handleApprovePayload = async (editablePayload: IngestionPayload) => {
    if (!reviewFile) return;

    const { queuedFile, payload: _originalPayload } = reviewFile;
    setIsProcessing(true);
    setReviewFile(null);
    updateQueueItem(queuedFile.id, { status: 'processing', message: 'Processing file...' });

    try {
      const { content, mimeType, contentHash, fileSize } = queuedFile.extractionData!;
      const result = await processPayload(
        queuedFile.file,
        actor,
        editablePayload,
        content,
        mimeType,
        contentHash,
        fileSize
      );

      if (result.status === 'done') {
        updateQueueItem(queuedFile.id, {
          status: 'done',
          message: result.sourceTitle ? `Updated ${result.sourceTitle}` : 'Imported successfully',
          result,
        });
        setReviewFile({ queuedFile: queuedFile, payload: editablePayload, actions: result.actions });
      } else {
        updateQueueItem(queuedFile.id, {
          status: 'error',
          message: result.error || 'Failed to process file',
          result,
        });
      }

      const doneCount = queue.filter(q => q.id !== queuedFile.id).filter(q => q.status === 'done').length + (result.status === 'done' ? 1 : 0);
      const totalProcessed = queue.filter(q => q.id !== queuedFile.id).filter(q => q.status === 'done' || q.status === 'error').length + 1;
      if (totalProcessed === queue.length) {
        const successCount = queue.filter(q => q.id !== queuedFile.id).filter(q => q.status === 'done').length + (result.status === 'done' ? 1 : 0);
        const createdCount = queue.filter(q => q.id !== queuedFile.id).filter(q => q.status === 'done' && (q.result?.sourceVersion || 0) === 1).length + (result.status === 'done' && (result.sourceVersion || 0) === 1 ? 1 : 0);
        const updatedCount = successCount - createdCount;
        setSummary(
          successCount > 0
            ? `${successCount} file${successCount === 1 ? '' : 's'} processed. ${createdCount} created, ${updatedCount} updated.`
            : 'No files were processed successfully.'
        );
        if (mode === 'onboarding') {
          onFinished?.();
        }
      }
    } catch (error) {
      updateQueueItem(queuedFile.id, {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to process',
      });
    }

    setIsProcessing(false);
  };

  const handleRejectPayload = () => {
    if (!reviewFile) return;
    updateQueueItem(reviewFile.queuedFile.id, {
      status: 'error',
      message: 'Rejected by user',
    });
    setReviewFile(null);
  };

  const openReview = (item: QueuedFile) => {
    if (item.status === 'review' && item.payload) {
      setReviewFile({ queuedFile: item, payload: item.payload });
    }
  };

  const processQueuedFiles = async () => {
    if (queue.length === 0 || isProcessing) return;

    const hasQueued = queue.some(item => item.status === 'queued');
    if (hasQueued) {
      await extractQueuedFiles();
      return;
    }

    const hasReview = queue.some(item => item.status === 'review');
    if (hasReview && !reviewFile) {
      const firstReview = queue.find(item => item.status === 'review');
      if (firstReview?.payload) {
        setReviewFile({ queuedFile: firstReview, payload: firstReview.payload });
      }
      return;
    }
  };

  const clearCompleted = () => {
    setQueue((current) => current.filter((item) => item.status === 'queued' || item.status === 'extracting' || item.status === 'review'));
    setSummary('');
  };

  const queueCount = queue.length;
  const queuedCount = queue.filter(item => item.status === 'queued').length;
  const reviewCount = queue.filter(item => item.status === 'review').length;

  return (
    <div className={`rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden ${className}`}>
      <div className="p-6 border-b border-zinc-200 bg-zinc-50/70">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              {mode === 'onboarding' ? 'Upload your files' : 'Add new files'}
            </h2>
            <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
              {mode === 'onboarding'
                ? 'Drop one or more documents. Replofy will extract data with AI, let you review it, then reuse matching records, update existing items, and create new ones.'
                : 'Upload revised docs or new notes at any time. You can review and edit extracted data before it gets processed.'}
            </p>
          </div>
          {mode === 'onboarding' && onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="px-3 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 rounded-lg transition-colors"
            >
              Skip
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50/80 p-6 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-50"
        >
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-zinc-900 flex items-center justify-center">
            <Upload className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-900">Drag files here or choose them manually</h3>
          <p className="text-xs text-zinc-500 mt-1">TXT, MD, CSV, JSON, and PDF up to 10MB each.</p>
          <label className="inline-flex mt-4 cursor-pointer items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors">
            <FileText className="w-4 h-4" />
            Select files
            <input
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.pdf"
              className="hidden"
              onChange={handleSelectFiles}
            />
          </label>
        </div>

        {queueCount > 0 && (
          <div className="space-y-3">
            {queue.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                    <span className="truncate text-sm font-medium text-zinc-900">{item.file.name}</span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{Math.round(item.file.size / 1024)} KB</p>
                  {item.message && (
                    <p className={`text-xs mt-2 ${item.status === 'error' ? 'text-zinc-600' : 'text-zinc-500'}`}>{item.message}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.status === 'queued' && <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-600">Queued</span>}
                  {item.status === 'extracting' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Extracting
                    </span>
                  )}
                  {item.status === 'review' && (
                    <button
                      onClick={() => openReview(item)}
                      className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 flex items-center gap-1 hover:bg-zinc-200 transition-colors"
                    >
                      <Eye className="w-3 h-3" />
                      Review
                    </button>
                  )}
                  {item.status === 'processing' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Processing
                    </span>
                  )}
                  {item.status === 'done' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Done
                    </span>
                  )}
                  {item.status === 'error' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Failed
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-500">
            {summary || (
              <>
                Selected {queueCount} file{queueCount === 1 ? '' : 's'}.
                {queuedCount > 0 && ` ${queuedCount} waiting to extract.`}
                {reviewCount > 0 && ` ${reviewCount} ready for review.`}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {queueCount > 0 && (
              <button
                type="button"
                onClick={clearCompleted}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                Clear completed
              </button>
            )}
            <button
              type="button"
              onClick={processQueuedFiles}
              disabled={isProcessing || queueCount === 0}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {queuedCount > 0 ? 'Extract & Review' : reviewCount > 0 ? 'Review Files' : mode === 'onboarding' ? 'Process & Finish' : 'Process Files'}
            </button>
          </div>
        </div>
      </div>

      {/* Review modal */}
      {reviewFile && (
        <FileReviewPanel
          file={reviewFile.queuedFile.file}
          payload={reviewFile.payload}
          onApprove={handleApprovePayload}
          onReject={() => setReviewFile(null)}
          isProcessing={isProcessing}
          actions={reviewFile.actions}
        />
      )}
    </div>
  );
}
