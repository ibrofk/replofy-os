import React from 'react';

export function EditorArea({
  title,
  onTitleChange,
  onTitleBlur,
  titlePlaceholder = 'Title',
  content,
  onContentChange,
  onContentBlur,
  contentPlaceholder = 'Start writing...',
  children,
}: {
  title?: string;
  onTitleChange?: (value: string) => void;
  onTitleBlur?: () => void;
  titlePlaceholder?: string;
  content?: string;
  onContentChange?: (value: string) => void;
  onContentBlur?: () => void;
  contentPlaceholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto w-full scrollbar-thin">
      <div className="max-w-3xl mx-auto p-8 md:p-12 pb-32">
        {title !== undefined && onTitleChange && (
          <textarea
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onBlur={onTitleBlur}
            rows={1}
            className="w-full text-3xl font-bold bg-transparent outline-none placeholder:text-zinc-300 text-zinc-900 mb-6 tracking-tight leading-tight resize-none overflow-hidden block"
            placeholder={titlePlaceholder}
          />
        )}
        {content !== undefined && onContentChange && (
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            onBlur={onContentBlur}
            className="w-full min-h-[60vh] text-sm bg-transparent outline-none resize-none font-mono text-zinc-800 placeholder:text-zinc-400 leading-relaxed"
            placeholder={contentPlaceholder}
          />
        )}
        {children}
      </div>
    </div>
  );
}
