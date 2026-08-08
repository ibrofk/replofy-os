import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Heading1, Heading2, Heading3, List, ListOrdered,
  CheckSquare, Quote, Code, GripVertical, Type,
  Bold, Italic, X, Minus, Sparkles, Square
} from 'lucide-react';

export type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'bullet' | 'number' | 'todo' | 'quote' | 'code' | 'card' | 'divider';

export interface BlockData {
  id: string;
  type: BlockType;
  text: string;
  checked?: boolean;
  cardId?: string;
  indent?: number;
}

type DropPosition = 'before' | 'after';
const EXTERNAL_CHANGE_SYNC_MS = 80;

const COMMANDS = [
  { id: 'paragraph', label: 'Text', icon: Type, type: 'paragraph' as BlockType },
  { id: 'h1', label: 'Heading 1', icon: Heading1, type: 'h1' as BlockType },
  { id: 'h2', label: 'Heading 2', icon: Heading2, type: 'h2' as BlockType },
  { id: 'h3', label: 'Heading 3', icon: Heading3, type: 'h3' as BlockType },
  { id: 'bullet', label: 'Bullet List', icon: List, type: 'bullet' as BlockType },
  { id: 'number', label: 'Numbered List', icon: ListOrdered, type: 'number' as BlockType },
  { id: 'todo', label: 'To-do List', icon: CheckSquare, type: 'todo' as BlockType },
  { id: 'quote', label: 'Quote', icon: Quote, type: 'quote' as BlockType },
  { id: 'code', label: 'Code Block', icon: Code, type: 'code' as BlockType },
  { id: 'divider', label: 'Divider', icon: Minus, type: 'divider' as BlockType },
  { id: 'card', label: 'Insert Card', icon: Sparkles, type: 'card' as BlockType },
];

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const htmlToMd = (html: string) => {
  if (!html) return '';
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const traverse = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    let inner = '';
    el.childNodes.forEach(child => inner += traverse(child));
    if (el.tagName === 'B' || el.tagName === 'STRONG') return `**${inner}**`;
    if (el.tagName === 'I' || el.tagName === 'EM') return `*${inner}*`;
    if (el.tagName === 'STRIKE' || el.tagName === 'DEL' || el.tagName === 'S') return `~~${inner}~~`;
    if (el.tagName === 'CODE') return `\`${inner}\``;
    if (el.tagName === 'BR') return '\n';
    return inner;
  };
  return traverse(tempDiv);
};

const parseMarkdown = (markdown: string): BlockData[] => {
  if (!markdown) return [{ id: `block-${Date.now()}`, type: 'paragraph', text: '', indent: 0 }];

  return markdown.split('\n').map((line, i) => {
    const id = `block-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`;
    const leadingSpaces = line.match(/^(\s*)/)?.[1].length || 0;
    const indent = Math.floor(leadingSpaces / 2);
    const trimmed = line.trim();

    const cardMatch = trimmed.match(/^\[\[card:([^[\]]+)\]\]$/);
    if (cardMatch) {
      return { id, type: 'card', text: '', cardId: cardMatch[1], indent };
    }

    if (trimmed === '---' || trimmed === '***' || trimmed === '___') return { id, type: 'divider', text: '', indent };
    if (trimmed.startsWith('# ')) return { id, type: 'h1', text: trimmed.slice(2), indent };
    if (trimmed.startsWith('## ')) return { id, type: 'h2', text: trimmed.slice(3), indent };
    if (trimmed.startsWith('### ')) return { id, type: 'h3', text: trimmed.slice(4), indent };
    if (trimmed.startsWith('#### ')) return { id, type: 'h4', text: trimmed.slice(5), indent };
    if (trimmed.startsWith('> ')) return { id, type: 'quote', text: trimmed.slice(2), indent };
    if (trimmed.startsWith('```')) return { id, type: 'code', text: trimmed.slice(3), indent };
    if (trimmed.startsWith('- [ ] ')) return { id, type: 'todo', text: trimmed.slice(6), checked: false, indent };
    if (trimmed.startsWith('- [x] ')) return { id, type: 'todo', text: trimmed.slice(6), checked: true, indent };
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ')) return { id, type: 'bullet', text: trimmed.slice(2), indent };
    if (/^\d+\. /.test(trimmed)) return { id, type: 'number', text: trimmed.replace(/^\d+\. /, ''), indent };

    return { id, type: 'paragraph', text: trimmed, indent };
  });
};

const reconcileBlockIds = (prevBlocks: BlockData[], nextBlocks: BlockData[]): BlockData[] => {
  if (prevBlocks.length === 0) return nextBlocks;
  const usedIds = new Set<string>();
  return nextBlocks.map((block, i) => {
    const prev = prevBlocks[i];
    if (prev && prev.type === block.type && !usedIds.has(prev.id)) {
      usedIds.add(prev.id);
      return { ...block, id: prev.id };
    }
    return block;
  });
};

const serializeMarkdown = (blocks: BlockData[]): string => {
  return blocks.map((b, i) => {
    const spaces = '  '.repeat(b.indent || 0);
    if (b.type === 'card') return `${spaces}[[card:${b.cardId}]]`;
    if (b.type === 'number') return `${spaces}1. ${b.text}`;
    switch (b.type) {
      case 'h1': return `${spaces}# ${b.text}`;
      case 'h2': return `${spaces}## ${b.text}`;
      case 'h3': return `${spaces}### ${b.text}`;
      case 'h4': return `${spaces}#### ${b.text}`;
      case 'quote': return `${spaces}> ${b.text}`;
      case 'code': return `${spaces}\`\`\`\n${b.text}\n\`\`\``;
      case 'todo': return `${spaces}- [${b.checked ? 'x' : ' '}] ${b.text}`;
      case 'bullet': return `${spaces}- ${b.text}`;
      case 'divider': return `${spaces}---`;
      default: return `${spaces}${b.text}`;
    }
  }).join('\n');
};

const mdToHtml = (text: string) => {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\*(.*?)\*/g, '<i>$1</i>');
  html = html.replace(/~~(.*?)~~/g, '<strike>$1</strike>');
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  return html;
};

interface EditableBlockProps {
  html: string;
  tagName: string;
  className?: string;
  onChange: (html: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
  onBlur: () => void;
  placeholder?: string;
  id: string;
  contentEditable?: boolean;
  onMouseDownCapture?: React.MouseEventHandler<HTMLElement>;
  onClickCapture?: React.MouseEventHandler<HTMLElement>;
  onPointerDownCapture?: React.PointerEventHandler<HTMLElement>;
}

const EditableBlock = React.memo(({
  html,
  tagName,
  className,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  placeholder,
  id,
  contentEditable = true,
  onMouseDownCapture,
  onClickCapture,
  onPointerDownCapture,
}: EditableBlockProps) => {
  const contentEditableRef = useRef<HTMLElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (contentEditableRef.current && contentEditableRef.current.innerHTML !== html) {
      if (document.activeElement !== contentEditableRef.current) {
        contentEditableRef.current.innerHTML = html;
      }
    }
  }, [html]);

  const handleInput = (e: React.FormEvent<HTMLElement>) => {
    onChange(e.currentTarget.innerHTML);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const handleFocus = (e: React.FocusEvent<HTMLElement>) => {
    setIsFocused(true);
    onFocus();
  };

  const handleBlur = (e: React.FocusEvent<HTMLElement>) => {
    setIsFocused(false);
    onBlur();
  };

  const Tag = tagName as React.ElementType;
  const hasContent = html && html.replace(/<[^>]*>/g, '').trim().length > 0;
  const showPlaceholder = isFocused || hasContent === false;

  return (
    <Tag
      id={id}
      ref={contentEditableRef}
      className={`outline-none min-h-[1.5em] ${showPlaceholder ? `empty:before:content-[attr(data-placeholder)] empty:before:text-zinc-300 empty:before:italic` : ''} ${className}`}
      contentEditable={contentEditable}
      suppressContentEditableWarning
      onMouseDownCapture={onMouseDownCapture}
      onClickCapture={onClickCapture}
      onPointerDownCapture={onPointerDownCapture}
      onInput={handleInput}
      onKeyDown={onKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onPaste={handlePaste}
      data-placeholder={placeholder}
    />
  );
});

export interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  renderCard?: (cardId: string, onRemove: () => void) => React.ReactNode;
  onTriggerCardInsert?: (insertCallback: (cardId: string) => void) => void;
  selectedBlockIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ 
  content, onChange, placeholder, readOnly = false, renderCard, onTriggerCardInsert,
  selectedBlockIds: externalSelectedIds, onSelectionChange
}) => {
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number | null>(null);
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [menuIndex, setMenuIndex] = useState(0);

  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false);
  const [toolbarPosition, setToolbarPosition] = useState({ top: 0, left: 0 });

  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null);
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeCurrent, setMarqueeCurrent] = useState<{ x: number; y: number } | null>(null);
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null);

  const selectedBlockIds = externalSelectedIds !== undefined ? externalSelectedIds : internalSelectedIds;
  
  const setSelectedBlockIds = useCallback((ids: string[] | Set<string>) => {
    const arr = ids instanceof Set ? Array.from(ids) : ids;
    if (externalSelectedIds !== undefined && onSelectionChange) {
      onSelectionChange(arr);
    } else {
      setInternalSelectedIds(arr);
    }
  }, [externalSelectedIds, onSelectionChange]);

  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);
  const pendingEmitTimeoutRef = useRef<number | null>(null);
  const pendingExternalBlocksRef = useRef<BlockData[] | null>(null);
  const lastEmittedContentRef = useRef(content);
  const blocksRef = useRef<BlockData[]>([]);
  const filterQueryRef = useRef('');

  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    lastEmittedContentRef.current = content;
    const parsed = parseMarkdown(content);
    const reconciled = reconcileBlockIds(blocksRef.current, parsed);
    blocksRef.current = reconciled;
    setBlocks(reconciled);
  }, [content]);

  const emitExternalChange = useCallback((nextBlocks: BlockData[]) => {
    const nextContent = serializeMarkdown(nextBlocks);
    if (nextContent === lastEmittedContentRef.current) return;

    lastEmittedContentRef.current = nextContent;
    onChange(nextContent);
  }, [onChange]);

  const flushExternalChange = useCallback(() => {
    if (pendingEmitTimeoutRef.current !== null) {
      window.clearTimeout(pendingEmitTimeoutRef.current);
      pendingEmitTimeoutRef.current = null;
    }

    const pendingBlocks = pendingExternalBlocksRef.current;
    pendingExternalBlocksRef.current = null;
    if (!pendingBlocks) return;

    emitExternalChange(pendingBlocks);
  }, [emitExternalChange]);

  const scheduleExternalChange = useCallback((nextBlocks: BlockData[]) => {
    pendingExternalBlocksRef.current = nextBlocks;
    if (pendingEmitTimeoutRef.current !== null) return;

    pendingEmitTimeoutRef.current = window.setTimeout(() => {
      pendingEmitTimeoutRef.current = null;
      const pendingBlocks = pendingExternalBlocksRef.current;
      pendingExternalBlocksRef.current = null;
      if (!pendingBlocks) return;

      emitExternalChange(pendingBlocks);
    }, EXTERNAL_CHANGE_SYNC_MS);
  }, [emitExternalChange]);

  useEffect(() => () => {
    if (pendingEmitTimeoutRef.current !== null) {
      window.clearTimeout(pendingEmitTimeoutRef.current);
    }
  }, []);

  const updateBlocks = useCallback((newBlocks: BlockData[]) => {
    isInternalUpdate.current = true;
    blocksRef.current = newBlocks;
    setBlocks(newBlocks);
    scheduleExternalChange(newBlocks);
  }, [scheduleExternalChange]);

  const handleBlockDrop = useCallback((targetIndex: number, position: DropPosition) => {
    if (draggedBlockIndex === null || draggedBlockIndex === targetIndex) return;

    const nextBlocks = [...blocks];
    const [moved] = nextBlocks.splice(draggedBlockIndex, 1);
    if (!moved) return;

    const insertionIndex =
      draggedBlockIndex < targetIndex
        ? (position === 'before' ? targetIndex - 1 : targetIndex)
        : (position === 'before' ? targetIndex : targetIndex + 1);
    const clampedIndex = Math.max(0, Math.min(nextBlocks.length, insertionIndex));

    nextBlocks.splice(clampedIndex, 0, moved);
    updateBlocks(nextBlocks);
    setDraggedBlockIndex(null);
    setActiveBlockIndex(clampedIndex);
  }, [blocks, draggedBlockIndex, updateBlocks]);

  const filteredCommands = useMemo(() => {
    if (!filterQuery) return COMMANDS;
    return COMMANDS.filter(c => c.label.toLowerCase().includes(filterQuery.toLowerCase()));
  }, [filterQuery]);

  const handleBlockChange = useCallback((index: number, htmlContent: string) => {
    const mdText = htmlToMd(htmlContent);
    const currentBlocks = blocksRef.current;
    const currentType = currentBlocks[index]?.type;

    if (mdText === '---') return changeType(index, 'divider');

    if (currentType === 'paragraph') {
      if (mdText.startsWith('# ')) return changeType(index, 'h1');
      if (mdText.startsWith('## ')) return changeType(index, 'h2');
      if (mdText.startsWith('### ')) return changeType(index, 'h3');
      if (mdText.startsWith('#### ')) return changeType(index, 'h4');
      if (mdText.startsWith('> ')) return changeType(index, 'quote');
      if (mdText.startsWith('- ') || mdText.startsWith('* ')) return changeType(index, 'bullet');
      if (mdText.startsWith('1. ')) return changeType(index, 'number');
      if (mdText.startsWith('[] ') || mdText.startsWith('[ ] ')) return changeType(index, 'todo');
      if (mdText.startsWith('```')) return changeType(index, 'code');
    }

    const newBlocks = [...currentBlocks];
    newBlocks[index] = { ...newBlocks[index], text: mdText };
    updateBlocks(newBlocks);

    const slashMatch = mdText.match(/^\/(.*)$/);
    if (slashMatch) {
      const query = slashMatch[1];
      setFilterQuery(query);
      filterQueryRef.current = query;
      const blockEl = document.getElementById(currentBlocks[index].id);
      if (blockEl && editorRef.current) {
        const rect = blockEl.getBoundingClientRect();
        const editorRect = editorRef.current.getBoundingClientRect();
        setMenuPosition({
          top: rect.bottom - editorRect.top + 5,
          left: Math.max(0, rect.left - editorRect.left)
        });
        setShowMenu(true);
        if (query !== filterQueryRef.current) setMenuIndex(0);
      }
    } else {
      setShowMenu(false);
      setFilterQuery('');
      filterQueryRef.current = '';
    }
  }, [updateBlocks]);

  const changeType = useCallback((index: number, type: BlockType) => {
    if (type === 'card' && onTriggerCardInsert) {
      setShowMenu(false);
      const currentBlocks = blocksRef.current;
      const newBlocks = [...currentBlocks];
      newBlocks[index].text = newBlocks[index].text.replace(/^\//, '');
      updateBlocks(newBlocks);
      
      onTriggerCardInsert((cardId) => {
        const latestBlocks = blocksRef.current;
        const insertBlocks = [...latestBlocks];
        if (insertBlocks[index].text.trim() === '') {
          insertBlocks[index] = { ...insertBlocks[index], type: 'card', cardId };
          const nextHtmlId = `block-${Date.now()}-1`;
          insertBlocks.splice(index + 1, 0, { id: nextHtmlId, type: 'paragraph', text: '', indent: insertBlocks[index].indent });
          updateBlocks(insertBlocks);
          setTimeout(() => document.getElementById(nextHtmlId)?.focus(), 50);
        } else {
          insertBlocks.splice(index + 1, 0, { id: `block-${Date.now()}-rel`, type: 'card', text: '', cardId, indent: insertBlocks[index].indent });
          const nextHtmlId = `block-${Date.now()}-2`;
          insertBlocks.splice(index + 2, 0, { id: nextHtmlId, type: 'paragraph', text: '', indent: insertBlocks[index].indent });
          updateBlocks(insertBlocks);
          setTimeout(() => document.getElementById(nextHtmlId)?.focus(), 50);
        }
      });
      return;
    }

    const currentBlocks = blocksRef.current;
    const newBlocks = [...currentBlocks];
    newBlocks[index] = { ...newBlocks[index], type };
    newBlocks[index].text = newBlocks[index].text
      .replace(/^\/.*$/, '')
      .replace(/^#+\s/, '')
      .replace(/^-\s/, '')
      .replace(/^\*\s/, '')
      .replace(/^\[\]\s/, '')
      .replace(/^1\.\s/, '');

    if (type === 'todo') newBlocks[index].checked = false;
    updateBlocks(newBlocks);
    setShowMenu(false);
    setTimeout(() => document.getElementById(newBlocks[index].id)?.focus(), 0);
  }, [onTriggerCardInsert, updateBlocks]);

  const formatSelection = useCallback((format: 'bold' | 'italic' | 'code' | 'strike') => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    
    let command = '';
    switch (format) {
      case 'bold': command = 'bold'; break;
      case 'italic': command = 'italic'; break;
      case 'strike': command = 'strikeThrough'; break;
      case 'code':
        const range = sel.getRangeAt(0);
        const selectedText = range.toString();
        document.execCommand('insertHTML', false, `<code>${selectedText}</code>`);
        command = '';
        break;
    }
    if (command) document.execCommand(command, false);
    
    if (activeBlockIndex !== null) {
      const el = document.getElementById(blocks[activeBlockIndex].id);
      if (el) handleBlockChange(activeBlockIndex, el.innerHTML);
    }
    setShowFloatingToolbar(false);
  }, [activeBlockIndex, blocks, handleBlockChange]);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setShowFloatingToolbar(false);
      return;
    }
    if (activeBlockIndex !== null && document.activeElement?.id === blocks[activeBlockIndex]?.id) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const editorRect = editorRef.current?.getBoundingClientRect();
      if (rect && editorRect && rect.width > 0) {
        setToolbarPosition({
          top: rect.top - editorRect.top - 40,
          left: Math.max(10, (rect.left - editorRect.left) + (rect.width / 2) - 60)
        });
        setShowFloatingToolbar(true);
      }
    }
  }, [activeBlockIndex, blocks]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  useEffect(() => {
    if (activeBlockIndex === null) {
      flushExternalChange();
    }
  }, [activeBlockIndex, flushExternalChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const change = e.shiftKey ? -1 : 1;
      const currentIndent = blocks[index].indent || 0;
      const newIndent = Math.max(0, Math.min(6, currentIndent + change));
      if (newIndent !== currentIndent) {
        const newBlocks = [...blocks];
        newBlocks[index] = { ...newBlocks[index], indent: newIndent };
        updateBlocks(newBlocks);
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); formatSelection('bold'); return;
        case 'i': e.preventDefault(); formatSelection('italic'); return;
      }
    }

    if (showMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMenuIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMenuIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands.length > 0) changeType(index, filteredCommands[menuIndex].type);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowMenu(false);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (index > 0 && blocks[index - 1].type === 'card') {
        e.preventDefault();
        setActiveBlockIndex(index - 1);
        (document.activeElement as HTMLElement)?.blur();
      }
    } else if (e.key === 'ArrowDown') {
      if (index < blocks.length - 1 && blocks[index + 1].type === 'card') {
        e.preventDefault();
        setActiveBlockIndex(index + 1);
        (document.activeElement as HTMLElement)?.blur();
      }
    }

    if (e.key === 'Backspace' && blocks[index].type === 'card') {
      e.preventDefault();
      const newBlocks = [...blocks];
      newBlocks.splice(index, 1);
      if (newBlocks.length === 0) newBlocks.push({ id: `block-${Date.now()}`, type: 'paragraph', text: '', indent: 0 });
      updateBlocks(newBlocks);
      setActiveBlockIndex(Math.max(0, index - 1));
      setTimeout(() => document.getElementById(newBlocks[Math.max(0, index - 1)].id)?.focus(), 0);
      return;
    }

    if (e.key === 'Enter' && blocks[index].type === 'card') {
      e.preventDefault();
      const newBlock = { id: `block-${Date.now()}`, type: 'paragraph' as BlockType, text: '', indent: blocks[index].indent };
      const newBlocks = [...blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      updateBlocks(newBlocks);
      setTimeout(() => {
        setActiveBlockIndex(index + 1);
        document.getElementById(newBlock.id)?.focus();
      }, 10);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const currentBlock = blocks[index];
      const el = e.currentTarget as HTMLElement;

      if (el.textContent === '' && currentBlock.type !== 'paragraph') {
        changeType(index, 'paragraph');
        return;
      }

      const newBlock: BlockData = { id: `block-${Date.now()}`, type: 'paragraph', text: '', indent: currentBlock.indent };
      if (['bullet', 'number', 'todo'].includes(currentBlock.type)) {
        newBlock.type = currentBlock.type;
      }

      const newBlocks = [...blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      updateBlocks(newBlocks);

      setTimeout(() => {
        setActiveBlockIndex(index + 1);
        document.getElementById(newBlock.id)?.focus();
      }, 10);
    } else if (e.key === 'Backspace') {
      const el = e.currentTarget as HTMLElement;
      if (el.textContent === '') {
        if (blocks[index].type !== 'paragraph') {
          e.preventDefault();
          changeType(index, 'paragraph');
          return;
        }
        if (index > 0) {
          e.preventDefault();
          const newBlocks = [...blocks];
          newBlocks.splice(index, 1);
          updateBlocks(newBlocks);
          setTimeout(() => {
            const prevEl = document.getElementById(blocks[index - 1].id);
            if (prevEl && blocks[index - 1].type !== 'card') {
              prevEl.focus();
              const range = document.createRange();
              range.selectNodeContents(prevEl);
              range.collapse(false);
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
            setActiveBlockIndex(index - 1);
          }, 0);
        }
      }
    }
  }, [blocks, showMenu, filteredCommands, menuIndex, updateBlocks, changeType, formatSelection]);

  const isBlockSelected = useCallback((blockId: string) => {
    return selectedBlockIds.includes(blockId);
  }, [selectedBlockIds]);

  const handleBlockSelect = useCallback((index: number, event?: React.MouseEvent) => {
    const blockId = blocks[index].id;
    
    if (event?.shiftKey && selectionAnchorIndex !== null) {
      const start = Math.min(selectionAnchorIndex, index);
      const end = Math.max(selectionAnchorIndex, index);
      const rangeIds = blocks.slice(start, end + 1).map(b => b.id);
      const newSelection = [...new Set([...selectedBlockIds, ...rangeIds])];
      setSelectedBlockIds(newSelection);
    } else if (event?.ctrlKey || event?.metaKey) {
      const newSelection = selectedBlockIds.includes(blockId)
        ? selectedBlockIds.filter(id => id !== blockId)
        : [...selectedBlockIds, blockId];
      setSelectedBlockIds(newSelection);
      setSelectionAnchorIndex(index);
    } else {
      setSelectedBlockIds([blockId]);
      setSelectionAnchorIndex(index);
    }
  }, [blocks, selectedBlockIds, selectionAnchorIndex, setSelectedBlockIds]);

  const handleEditorMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === editorRef.current || (e.target as HTMLElement).classList.contains('editor-blank-area')) {
      setIsMarqueeSelecting(true);
      setMarqueeStart({ x: e.clientX, y: e.clientY });
      setMarqueeCurrent({ x: e.clientX, y: e.clientY });
      setSelectedBlockIds([]);
    }
  }, [setSelectedBlockIds]);

  const handleEditorMouseMove = useCallback((e: React.MouseEvent) => {
    if (isMarqueeSelecting && marqueeStart) {
      setMarqueeCurrent({ x: e.clientX, y: e.clientY });
      
      const editorRect = editorRef.current?.getBoundingClientRect();
      if (!editorRect) return;
      
      const x1 = Math.min(marqueeStart.x, e.clientX);
      const y1 = Math.min(marqueeStart.y, e.clientY);
      const x2 = Math.max(marqueeStart.x, e.clientX);
      const y2 = Math.max(marqueeStart.y, e.clientY);
      
      const selectedIds: string[] = [];
      blocks.forEach((block) => {
        const blockEl = document.getElementById(block.id);
        if (blockEl) {
          const blockRect = blockEl.getBoundingClientRect();
          if (!(blockRect.right < x1 || blockRect.left > x2 || blockRect.bottom < y1 || blockRect.top > y2)) {
            selectedIds.push(block.id);
          }
        }
      });
      
      setSelectedBlockIds(selectedIds);
    }
  }, [isMarqueeSelecting, marqueeStart, blocks, setSelectedBlockIds]);

  const handleEditorMouseUp = useCallback(() => {
    if (isMarqueeSelecting) {
      setIsMarqueeSelecting(false);
      setMarqueeStart(null);
      setMarqueeCurrent(null);
    }
  }, [isMarqueeSelecting]);

  useEffect(() => {
    const handleGlobalMouseUp = () => handleEditorMouseUp();
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [handleEditorMouseUp]);

  const getContainerStyles = (type: BlockType) => {
    switch (type) {
      case 'h1': return 'mt-8 mb-4';
      case 'h2': return 'mt-6 mb-3';
      case 'h3': return 'mt-4 mb-2';
      case 'h4': return 'mt-3 mb-2';
      case 'quote': return 'my-3';
      case 'code': return 'my-2';
      case 'card': return 'my-2';
      case 'divider': return 'my-4';
      default: return 'my-1';
    }
  };

  const getTextStyles = (type: BlockType) => {
    switch (type) {
      case 'h1': return 'text-3xl md:text-4xl font-black tracking-tight leading-tight text-zinc-950 border-b-2 border-zinc-100 pb-4';
      case 'h2': return 'text-xl md:text-2xl font-bold tracking-tight leading-tight text-zinc-900 border-b border-zinc-100 pb-2';
      case 'h3': return 'text-lg md:text-xl font-semibold leading-snug text-zinc-800 bg-zinc-50/60 px-3 py-1.5 rounded-lg';
      case 'h4': return 'text-base md:text-lg font-semibold leading-snug text-zinc-700';
      case 'quote': return 'border-l-4 border-zinc-300 pl-4 py-2 italic text-zinc-600 bg-zinc-50/50 rounded-r-lg text-sm';
      case 'code': return 'font-mono text-xs bg-zinc-950 p-4 rounded-[1.5rem] text-zinc-100 leading-6 border border-zinc-900/5';
      default: return 'text-[15px] leading-8 text-zinc-700';
    }
  };

  const getBlockGutter = (isSelected: boolean, isHovered: boolean) => {
    if (isSelected) {
      return 'w-6 opacity-100';
    }
    return isHovered ? 'w-6 opacity-100' : 'w-0 opacity-0';
  };

  const renderDropZone = (targetIndex: number, position: DropPosition) => (
    <div
      className="relative h-2"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        handleBlockDrop(targetIndex, position);
      }}
    >
      <div
        className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 rounded-full transition-colors ${
          draggedBlockIndex !== null ? 'bg-blue-400/80' : 'bg-transparent'
        }`}
      />
    </div>
  );

  let listCounters: Record<number, number> = {};

  const marqueeStyle = isMarqueeSelecting && marqueeStart && marqueeCurrent ? {
    position: 'fixed' as const,
    left: Math.min(marqueeStart.x, marqueeCurrent.x),
    top: Math.min(marqueeStart.y, marqueeCurrent.y),
    width: Math.abs(marqueeCurrent.x - marqueeStart.x),
    height: Math.abs(marqueeCurrent.y - marqueeStart.y),
    border: '2px dashed #3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    pointerEvents: 'none' as const,
    zIndex: 9999,
  } : null;

  return (
    <div 
      className="relative w-full pb-48 group/editor" 
      ref={editorRef}
      onMouseDown={handleEditorMouseDown}
      onMouseMove={handleEditorMouseMove}
      onMouseUp={handleEditorMouseUp}
    >
      {marqueeStyle && <div style={marqueeStyle} />}
      {blocks.length === 0 && (
        <div className="text-zinc-400 absolute top-2 pointer-events-none">
          {placeholder || 'Type "/" for commands...'}
        </div>
      )}

      {blocks.map((block, index) => {
        const indent = block.indent || 0;
        let currentNumber: number | undefined;

        if (block.type === 'number') {
          for (let i = indent + 1; i < 6; i++) listCounters[i] = 0;
          listCounters[indent] = (listCounters[indent] || 0) + 1;
          currentNumber = listCounters[indent];
        } else {
          for (let i = indent; i < 6; i++) listCounters[i] = 0;
        }

        const isActive = activeBlockIndex === index;

        if (block.type === 'card') {
          const isSelected = isActive || isBlockSelected(block.id);
          const isHovered = hoveredBlockIndex === index;
          return (
            <React.Fragment key={block.id}>
              {draggedBlockIndex !== null && renderDropZone(index, 'before')}
              <div
                className={`group/block relative flex items-start transition-all outline-none ${getContainerStyles(block.type)} ${draggedBlockIndex === index ? 'opacity-50' : ''} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 rounded-lg' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleBlockSelect(index, e); }}
                onMouseDown={(e) => { if (e.button === 0) handleBlockSelect(index, e); }}
                onMouseEnter={() => setHoveredBlockIndex(index)}
                onMouseLeave={() => setHoveredBlockIndex(null)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                tabIndex={0}
                style={{ paddingLeft: `${indent * 1.5}rem` }}
              >
                <div className={`flex-shrink-0 transition-all duration-150 ${getBlockGutter(isSelected, isHovered)}`}>
                  <div className="flex items-center gap-0.5 h-full">
                    {isSelected && (
                      <div className="w-1.5 h-full bg-blue-500 rounded-full" />
                    )}
                    {(isSelected || isHovered) && (
                      <div
                        className="cursor-grab active:cursor-grabbing p-2 -m-1 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100"
                        draggable
                        onDragStart={(e) => {
                          setDraggedBlockIndex(index);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', block.id);
                        }}
                        onDragEnd={() => setDraggedBlockIndex(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleBlockDrop(index, 'before');
                        }}
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  {renderCard && block.cardId ? renderCard(block.cardId, () => {
                    const newBlocks = [...blocks];
                    newBlocks.splice(index, 1);
                    if (newBlocks.length === 0) newBlocks.push({ id: `block-${Date.now()}`, type: 'paragraph', text: '', indent: 0 });
                    updateBlocks(newBlocks);
                  }) : (
                    <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-[1.25rem] text-sm text-zinc-500 font-mono">
                      [[card:{block.cardId}]]
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        }

        if (block.type === 'divider') {
          const isSelected = isActive || isBlockSelected(block.id);
          const isHovered = hoveredBlockIndex === index;
          return (
            <React.Fragment key={block.id}>
              {draggedBlockIndex !== null && renderDropZone(index, 'before')}
              <div
                className={`group/block relative flex items-center transition-all outline-none py-2 ${getContainerStyles(block.type)} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 rounded-lg' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleBlockSelect(index, e); }}
                onMouseDown={(e) => { if (e.button === 0) handleBlockSelect(index, e); }}
                onMouseEnter={() => setHoveredBlockIndex(index)}
                onMouseLeave={() => setHoveredBlockIndex(null)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                tabIndex={0}
                style={{ paddingLeft: `${indent * 1.5}rem` }}
              >
                <div className={`flex-shrink-0 transition-all duration-150 ${getBlockGutter(isSelected, isHovered)}`}>
                  <div className="flex items-center gap-0.5 h-full">
                    {isSelected && (
                      <div className="w-1.5 h-full bg-blue-500 rounded-full" />
                    )}
                    {(isSelected || isHovered) && (
                      <div
                        className="cursor-grab active:cursor-grabbing p-2 -m-1 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100"
                        draggable
                        onDragStart={(e) => {
                          setDraggedBlockIndex(index);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', block.id);
                        }}
                        onDragEnd={() => setDraggedBlockIndex(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleBlockDrop(index, 'before');
                        }}
                      >
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 h-px w-full bg-gradient-to-r from-transparent via-zinc-300 to-transparent pointer-events-none" />
              </div>
            </React.Fragment>
          );
        }

        let prefix = null;
        if (block.type === 'bullet') prefix = <span className="text-zinc-400">{'\u2022'}</span>;
        if (block.type === 'number') prefix = <span className="text-zinc-400 text-sm">{currentNumber}.</span>;
        if (block.type === 'todo') {
          prefix = (
            <input
              type="checkbox"
              checked={block.checked}
              onChange={(e) => {
                const newBlocks = [...blocks];
                newBlocks[index].checked = e.target.checked;
                updateBlocks(newBlocks);
              }}
              className="w-4 h-4 rounded border-zinc-300 pointer-events-auto"
            />
          );
        }

        const tagMap = {
          paragraph: 'div', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4',
          bullet: 'div', number: 'div', todo: 'div', quote: 'blockquote', code: 'pre'
        };

        const isSelected = isActive || isBlockSelected(block.id);
        const isHovered = hoveredBlockIndex === index;

        return (
          <React.Fragment key={block.id}>
            {draggedBlockIndex !== null && renderDropZone(index, 'before')}
            <div
              className={`group/block relative flex items-start transition-all ${getContainerStyles(block.type)} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 rounded-lg' : ''}`}
              style={{ paddingLeft: `${indent * 1.5 + (prefix ? 1.5 : 0)}rem` }}
              onClick={(e) => { e.stopPropagation(); handleBlockSelect(index, e); }}
              onMouseDown={(e) => { if (e.button === 0) handleBlockSelect(index, e); }}
              onMouseEnter={() => setHoveredBlockIndex(index)}
              onMouseLeave={() => setHoveredBlockIndex(null)}
            >
              <div className={`flex-shrink-0 transition-all duration-150 ${getBlockGutter(isSelected, isHovered)}`}>
                <div className="flex items-start gap-0.5 h-full pt-1">
                  {isSelected && (
                    <div className="w-1.5 h-5 bg-blue-500 rounded-full" />
                  )}
                  {(isSelected || isHovered) && (
                    <div
                      className="cursor-grab active:cursor-grabbing p-2 -m-1 text-zinc-400 hover:text-zinc-600 rounded hover:bg-zinc-100"
                      contentEditable={false}
                      draggable
                      onDragStart={(e) => {
                        setDraggedBlockIndex(index);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', block.id);
                      }}
                      onDragEnd={() => setDraggedBlockIndex(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleBlockDrop(index, 'before');
                      }}
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-w-0 flex-1 items-start gap-3">
                {prefix && (
                  <div className={`shrink-0 ${block.type === 'todo' ? 'pt-1.5' : 'pt-[0.55rem]'}`}>
                    {prefix}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <EditableBlock
                    id={block.id}
                    tagName={tagMap[block.type]}
                    html={mdToHtml(block.text)}
                    onChange={(html) => handleBlockChange(index, html)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    onFocus={() => setActiveBlockIndex(index)}
                    onBlur={() => setActiveBlockIndex(null)}
                    placeholder={index === 0 && blocks.length === 1 && !block.text ? placeholder : ''}
                    className={`${getTextStyles(block.type)} ${block.checked ? 'line-through text-zinc-400' : ''}`}
                    contentEditable={!readOnly}
                    onMouseDownCapture={(event) => event.stopPropagation()}
                    onClickCapture={(event) => event.stopPropagation()}
                    onPointerDownCapture={(event) => event.stopPropagation()}
                  />
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}

      {draggedBlockIndex !== null && blocks.length > 0 && renderDropZone(blocks.length - 1, 'after')}

      {showFloatingToolbar && !readOnly && (
        <div
          className="absolute z-50 flex items-center gap-1 p-1 bg-zinc-900 rounded-xl shadow-xl transition-all duration-100"
          style={{ top: toolbarPosition.top, left: toolbarPosition.left }}
        >
          <button onMouseDown={(e) => { e.preventDefault(); formatSelection('bold'); }} className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg">
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button onMouseDown={(e) => { e.preventDefault(); formatSelection('italic'); }} className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg">
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button onMouseDown={(e) => { e.preventDefault(); formatSelection('code'); }} className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg">
            <Code className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showMenu && !readOnly && (
        <div
          className="absolute z-50 min-w-[200px] max-w-[280px] bg-white border border-zinc-200 rounded-[1.25rem] shadow-[0_20px_50px_rgba(15,23,42,0.12)] overflow-hidden"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <div className="border-b border-zinc-100 px-3 py-2.5 bg-zinc-50/50">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">Commands</p>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {filteredCommands.length > 0 ? (
              filteredCommands.map((command, idx) => (
                <button
                  key={command.id}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-xl transition-colors ${idx === menuIndex ? 'bg-zinc-950 text-white' : 'text-zinc-700 hover:bg-zinc-50'}`}
                  onMouseEnter={() => setMenuIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (activeBlockIndex !== null) changeType(activeBlockIndex, command.type);
                  }}
                >
                  <div className={`flex items-center justify-center w-7 h-7 rounded-lg border ${idx === menuIndex ? 'border-white/10 bg-white/10' : 'border-zinc-200 bg-white'}`}>
                    <command.icon className="w-3.5 h-3.5" />
                  </div>
                  <span className={`text-xs font-semibold ${idx === menuIndex ? 'text-white' : 'text-zinc-950'}`}>{command.label}</span>
                </button>
              ))
            ) : (
              <div className="p-3 text-xs text-center text-zinc-500">No commands found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
