import {
  BusinessPlan,
  BusinessPlanBlockMapItem,
  BusinessPlanBlockType,
  BusinessPlanEditingSession,
  BusinessPlanLink,
  BusinessPlanStatus,
} from '../types';

export type BusinessPlanEditorBlock = {
  id: string;
  type: BusinessPlanBlockType;
  text: string;
  level?: number;
  ordered?: boolean;
  order?: number;
  language?: string;
  linkId?: string;
};

type BlockSeed = Omit<BusinessPlanEditorBlock, 'id'>;

export type ImportedBusinessPlanDraft = {
  title: string;
  summary: string;
  content: string;
  tags: string[];
};

export function normalizeLineBreaks(value: string) {
  return value.replace(/\r\n/g, '\n');
}

export function createBusinessPlanEditorId(prefix = 'bp') {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createParagraphBlock(partial: Partial<BusinessPlanEditorBlock> = {}): BusinessPlanEditorBlock {
  return {
    id: partial.id ?? createBusinessPlanEditorId('block'),
    type: 'paragraph',
    text: partial.text ?? '',
    level: undefined,
    ordered: undefined,
    order: undefined,
    language: undefined,
    linkId: undefined,
  };
}

export function replaceBlockById(blocks: BusinessPlanEditorBlock[], nextBlock: BusinessPlanEditorBlock) {
  return blocks.map((block) => (block.id === nextBlock.id ? nextBlock : block));
}

export function insertBlockAfter(blocks: BusinessPlanEditorBlock[], afterBlockId: string, nextBlock: BusinessPlanEditorBlock) {
  const index = blocks.findIndex((block) => block.id === afterBlockId);
  if (index === -1) {
    return [...blocks, nextBlock];
  }

  const next = [...blocks];
  next.splice(index + 1, 0, nextBlock);
  return next;
}

export function removeBlockById(blocks: BusinessPlanEditorBlock[], blockId: string) {
  const next = blocks.filter((block) => block.id !== blockId);
  return next.length > 0 ? next : [createParagraphBlock()];
}

export function reconcileEditorBlocks(
  remoteBlocks: BusinessPlanEditorBlock[],
  currentBlocks: BusinessPlanEditorBlock[],
  activeBlockDraft: BusinessPlanEditorBlock | null,
) {
  const next = remoteBlocks.map((block) =>
    activeBlockDraft && block.id === activeBlockDraft.id ? activeBlockDraft : block,
  );

  if (activeBlockDraft && !remoteBlocks.some((block) => block.id === activeBlockDraft.id)) {
    const localIndex = currentBlocks.findIndex((block) => block.id === activeBlockDraft.id);
    const insertIndex = localIndex >= 0 ? Math.min(localIndex, next.length) : next.length;
    next.splice(insertIndex, 0, activeBlockDraft);
  }

  return next;
}

export function toBusinessPlanBlockMap(blocks: BusinessPlanEditorBlock[]): BusinessPlanBlockMapItem[] {
  return blocks.map((block) => ({ id: block.id, type: block.type }));
}

export function sanitizeBusinessPlanBlocks(
  blocks: BusinessPlanEditorBlock[],
  options: { ensureOneBlock?: boolean } = {},
) {
  const ensureOneBlock = options.ensureOneBlock ?? true;
  const next = blocks
    .map((block) => normalizeEditorBlock(block))
    .filter((block) => {
      if (block.type === 'divider' || block.type === 'card') return true;
      if (block.type === 'code') return true;
      return block.text.trim().length > 0;
    });

  if (next.length === 0 && ensureOneBlock) {
    return [createParagraphBlock()];
  }

  return next;
}

export function serializeBusinessPlanBlocks(blocks: BusinessPlanEditorBlock[]) {
  const sanitized = sanitizeBusinessPlanBlocks(blocks);
  const chunks: string[] = [];

  sanitized.forEach((block, index) => {
    chunks.push(serializeBusinessPlanBlock(block));
    const next = sanitized[index + 1];
    if (!next) return;

    const isContinuousList =
      block.type === 'list-item' &&
      next.type === 'list-item' &&
      Boolean(block.ordered) === Boolean(next.ordered);

    chunks.push(isContinuousList ? '\n' : '\n\n');
  });

  return normalizeLineBreaks(chunks.join('')).trim();
}

export function parseBusinessPlanBlocks(markdown: string, blockMap: BusinessPlanBlockMapItem[] = []) {
  const lines = normalizeLineBreaks(markdown).split('\n');
  const seeds: BlockSeed[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index] ?? '';
    const trimmed = rawLine.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const cardMatch = trimmed.match(/^\[\[card:([^[\]]+)\]\]$/);
    if (cardMatch) {
      seeds.push({
        type: 'card',
        text: '',
        linkId: cardMatch[1],
      });
      index += 1;
      continue;
    }

    if (trimmed === '---' || trimmed === '***') {
      seeds.push({
        type: 'divider',
        text: '',
      });
      index += 1;
      continue;
    }

    const codeMatch = trimmed.match(/^```(.*)$/);
    if (codeMatch) {
      const codeLines: string[] = [];
      const language = codeMatch[1]?.trim() ?? '';
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length && lines[index].trim().startsWith('```')) {
        index += 1;
      }

      seeds.push({
        type: 'code',
        text: codeLines.join('\n'),
        language,
      });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      seeds.push({
        type: 'heading',
        text: headingMatch[2].trim(),
        level: headingMatch[1].length,
      });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }

      seeds.push({
        type: 'quote',
        text: quoteLines.join('\n'),
      });
      continue;
    }

    const unorderedListMatch = trimmed.match(/^(-|\*|\+)\s+(.+)$/);
    const orderedListMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (unorderedListMatch || orderedListMatch) {
      seeds.push({
        type: 'list-item',
        text: unorderedListMatch?.[2] ?? orderedListMatch?.[2] ?? '',
        ordered: Boolean(orderedListMatch),
        order: orderedListMatch ? Number(orderedListMatch[1]) : undefined,
      });
      index += 1;
      continue;
    }

    const paragraphLines = [rawLine];
    index += 1;

    while (index < lines.length) {
      const nextLine = lines[index] ?? '';
      const nextTrimmed = nextLine.trim();
      if (!nextTrimmed) {
        index += 1;
        break;
      }

      if (isSpecialMarkdownLine(nextTrimmed)) {
        break;
      }

      paragraphLines.push(nextLine);
      index += 1;
    }

    seeds.push({
      type: 'paragraph',
      text: paragraphLines.join('\n').trimEnd(),
    });
  }

  if (seeds.length === 0) {
    return [createParagraphBlock()];
  }

  return assignBlockIds(seeds, blockMap);
}

export function normalizeImportedBusinessPlanDraft(
  source: {
    markdown?: string;
    html?: string;
    plainText?: string;
    fallbackTitle?: string;
  },
): ImportedBusinessPlanDraft {
  const baseMarkdown = source.html?.trim()
    ? convertRichTextToMarkdown(source.html)
    : normalizeLineBreaks(source.markdown ?? source.plainText ?? '');
  const { body, title, summary, tags } = extractFrontmatter(baseMarkdown);
  const normalizedBody = normalizeLineBreaks(body).trim();
  const blocks = sanitizeBusinessPlanBlocks(parseBusinessPlanBlocks(normalizedBody), { ensureOneBlock: false });
  const content = blocks.length > 0 ? serializeBusinessPlanBlocks(blocks) : '';
  const outline = extractOutlineFromBlocks(blocks);
  const derivedTitle = title?.trim() || outline[0]?.title || source.fallbackTitle?.trim() || 'Imported Business Plan';
  const derivedSummary = summary?.trim() || extractImportedSummary(blocks);

  return {
    title: derivedTitle,
    summary: derivedSummary,
    content,
    tags,
  };
}

export function convertRichTextToMarkdown(html: string) {
  const normalizedHtml = html.trim();
  if (!normalizedHtml) return '';

  if (!globalThis.DOMParser) {
    return stripHtml(normalizedHtml);
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(normalizedHtml, 'text/html');
  const blocks = serializeHtmlBlockNodes(Array.from(document.body.childNodes));

  return blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeBusinessPlan(id: string, data: Record<string, unknown>): BusinessPlan {
  const createdAt = typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString();
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : createdAt;
  const content = normalizeLineBreaks(typeof data.content === 'string' ? data.content : '');
  const blockMap = normalizeBusinessPlanBlockMap(data.blockMap);
  const resolvedBlockMap = blockMap.length > 0
    ? blockMap
    : parseBusinessPlanBlocks(content, []).map((block) => ({ id: block.id, type: block.type }));

  return {
    id,
    title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Untitled plan',
    summary: typeof data.summary === 'string' ? data.summary : '',
    content,
    status: isBusinessPlanStatus(data.status) ? data.status : 'draft',
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
      : [],
    links: normalizeBusinessPlanLinks(data.links),
    contentRevision: typeof data.contentRevision === 'number' && Number.isFinite(data.contentRevision)
      ? Math.max(0, Math.floor(data.contentRevision))
      : 0,
    blockMap: resolvedBlockMap,
    createdAt,
    updatedAt,
    authorId: typeof data.authorId === 'string' ? data.authorId : '',
    companyId: typeof data.companyId === 'string' ? data.companyId : undefined,
  };
}

export function buildBusinessPlanRecord(plan: BusinessPlan) {
  const sanitizedBlocks = sanitizeBusinessPlanBlocks(parseBusinessPlanBlocks(plan.content, plan.blockMap));

  const record: Record<string, unknown> = {
    title: plan.title,
    summary: plan.summary,
    content: serializeBusinessPlanBlocks(sanitizedBlocks),
    status: plan.status,
    tags: [...plan.tags],
    links: plan.links.map((link) => ({ ...link })),
    contentRevision: plan.contentRevision,
    blockMap: sanitizedBlocks.map((block) => ({ id: block.id, type: block.type })),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    authorId: plan.authorId,
  };

  if (plan.companyId !== undefined && plan.companyId !== null) {
    record.companyId = plan.companyId;
  }

  return record;
}

export function normalizeBusinessPlanEditingSession(
  id: string,
  data: Record<string, unknown>,
): BusinessPlanEditingSession | null {
  const sessionId = typeof data.sessionId === 'string' && data.sessionId.trim() ? data.sessionId : id;
  const userId = typeof data.userId === 'string' && data.userId.trim() ? data.userId : '';
  const displayName = typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : '';
  const color = typeof data.color === 'string' && data.color.trim() ? data.color.trim() : '';
  const planId = typeof data.planId === 'string' && data.planId.trim() ? data.planId.trim() : '';
  const activeBlockId = typeof data.activeBlockId === 'string' && data.activeBlockId.trim() ? data.activeBlockId.trim() : '';
  const createdAt = typeof data.createdAt === 'string' && data.createdAt.trim() ? data.createdAt : '';
  const updatedAt = typeof data.updatedAt === 'string' && data.updatedAt.trim() ? data.updatedAt : createdAt;

  if (!sessionId || !userId || !displayName || !color || !planId || !activeBlockId || !createdAt || !updatedAt) {
    return null;
  }

  return {
    sessionId,
    userId,
    displayName,
    color,
    planId,
    activeBlockId,
    createdAt,
    updatedAt,
  };
}

export function extractOutlineFromBlocks(blocks: BusinessPlanEditorBlock[]) {
  return blocks
    .filter((block) => block.type === 'heading')
    .map((block) => ({
      id: block.id,
      level: block.level ?? 2,
      title: block.text.trim(),
    }));
}

export function countWordsFromBlocks(blocks: BusinessPlanEditorBlock[]) {
  const text = blocks
    .map((block) => {
      if (block.type === 'divider' || block.type === 'card') return '';
      return block.text;
    })
    .join(' ')
    .trim();
  const words = text.match(/\S+/g);
  return words ? words.length : 0;
}

export function renderInlineMarkdown(value: string) {
  const codeSegments: string[] = [];
  let working = value.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `__CODE_${codeSegments.length}__`;
    codeSegments.push(
      `<code class="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-800">${escapeHtml(code)}</code>`,
    );
    return token;
  });

  working = escapeHtml(working);
  working = working.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-950">$1</strong>');
  working = working.replace(/\*([^*]+)\*/g, '<em class="italic text-zinc-700">$1</em>');
  working = working.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
    const safeHref = sanitizeHref(String(href));
    if (!safeHref) return label;

    return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer" class="text-zinc-950 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-700">${label}</a>`;
  });

  codeSegments.forEach((segment, index) => {
    working = working.replaceAll(`__CODE_${index}__`, segment);
  });

  return working;
}

export function renderBlockPreviewHtml(block: BusinessPlanEditorBlock) {
  switch (block.type) {
    case 'heading': {
      const level = block.level ?? 2;
      const className =
        level === 1
          ? 'text-4xl font-black tracking-tight text-zinc-950'
          : level === 2
            ? 'text-2xl font-black tracking-tight text-zinc-950'
            : 'text-lg font-bold tracking-tight text-zinc-950';
      return `<div class="${className}">${renderInlineMarkdown(block.text.trim() || 'Untitled')}</div>`;
    }
    case 'quote':
      return `<div class="border-l-2 border-zinc-300 pl-4 text-sm italic leading-7 text-zinc-600">${renderInlineMarkdown(block.text)}</div>`;
    case 'list-item': {
      const marker = block.ordered ? `${block.order ?? 1}.` : '&#8226;';
      return `<div class="flex items-start gap-3 text-sm leading-7 text-zinc-700"><span class="mt-0.5 shrink-0 text-zinc-400">${marker}</span><div class="min-w-0 flex-1">${renderInlineMarkdown(block.text)}</div></div>`;
    }
    case 'code':
      return `<pre class="overflow-x-auto rounded-[1.5rem] border border-zinc-900/5 bg-zinc-950 px-4 py-4 font-mono text-xs leading-6 text-zinc-100"><code>${escapeHtml(block.text)}</code></pre>`;
    case 'divider':
      return '<div class="h-px w-full bg-gradient-to-r from-transparent via-zinc-300 to-transparent"></div>';
    default:
      return `<div class="text-[15px] leading-8 text-zinc-700">${renderInlineMarkdown(block.text)}</div>`;
  }
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function findInlineCardLinkIds(content: string) {
  const matches = normalizeLineBreaks(content).match(/\[\[card:([^[\]]+)\]\]/g) ?? [];
  return matches.map((match) => match.replace('[[card:', '').replace(']]', ''));
}

function extractFrontmatter(markdown: string) {
  const normalized = normalizeLineBreaks(markdown).trimStart();
  if (!normalized.startsWith('---\n')) {
    return {
      body: markdown,
      title: '',
      summary: '',
      tags: [] as string[],
    };
  }

  const closingIndex = normalized.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    return {
      body: markdown,
      title: '',
      summary: '',
      tags: [] as string[],
    };
  }

  const frontmatter = normalized.slice(4, closingIndex);
  const body = normalized.slice(closingIndex + 5);
  const data = parseFrontmatter(frontmatter);

  return {
    body,
    title: firstFrontmatterValue(data, ['title', 'name']),
    summary: firstFrontmatterValue(data, ['summary', 'description', 'excerpt']),
    tags: normalizeImportedTags(data.tags),
  };
}

function parseFrontmatter(frontmatter: string) {
  const result: Record<string, string | string[]> = {};
  const lines = normalizeLineBreaks(frontmatter).split('\n');
  let currentListKey: string | null = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const listItemMatch = trimmed.match(/^-\s+(.+)$/);
    if (listItemMatch && currentListKey) {
      const existing = Array.isArray(result[currentListKey]) ? result[currentListKey] : [];
      result[currentListKey] = [...existing, listItemMatch[1].trim()];
      return;
    }

    const entryMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!entryMatch) {
      currentListKey = null;
      return;
    }

    const key = entryMatch[1].toLowerCase();
    const rawValue = entryMatch[2].trim();
    currentListKey = null;

    if (!rawValue) {
      result[key] = [];
      currentListKey = key;
      return;
    }

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      result[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map((value) => value.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      return;
    }

    result[key] = rawValue.replace(/^['"]|['"]$/g, '');
  });

  return result;
}

function firstFrontmatterValue(
  data: Record<string, string | string[]>,
  keys: string[],
) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function normalizeImportedTags(value: string | string[] | undefined) {
  if (!value) return [];

  const candidates = Array.isArray(value)
    ? value
    : value.split(/[,\n;]/);
  const unique: string[] = [];
  const seen = new Set<string>();

  candidates.forEach((candidate) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(trimmed);
  });

  return unique.slice(0, 20);
}

function extractImportedSummary(blocks: BusinessPlanEditorBlock[]) {
  const firstParagraph = blocks.find((block) => block.type === 'paragraph' && block.text.trim());
  if (!firstParagraph) return '';

  return truncateText(firstParagraph.text.trim(), 220);
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function serializeHtmlBlockNodes(nodes: Node[], listDepth = 0): string[] {
  const blocks: string[] = [];

  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text) {
        blocks.push(text);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'script' || tagName === 'style') {
      return;
    }

    if (tagName === 'br') {
      return;
    }

    if (tagName === 'hr') {
      blocks.push('---');
      return;
    }

    if (tagName === 'pre') {
      const codeElement = element.querySelector('code');
      const codeText = normalizeLineBreaks((codeElement?.textContent ?? element.textContent ?? '').trimEnd());
      if (codeText) {
        blocks.push(`\`\`\`\n${codeText}\n\`\`\``);
      }
      return;
    }

    if (/^h[1-6]$/.test(tagName)) {
      const level = Number(tagName.slice(1));
      const text = serializeInlineNodes(Array.from(element.childNodes)).trim();
      if (text) {
        blocks.push(`${'#'.repeat(level)} ${text}`);
      }
      return;
    }

    if (tagName === 'ul' || tagName === 'ol') {
      const listMarkdown = serializeHtmlList(element, tagName === 'ol', listDepth);
      if (listMarkdown) {
        blocks.push(listMarkdown);
      }
      return;
    }

    if (tagName === 'blockquote') {
      const quotedBlocks = serializeHtmlBlockNodes(Array.from(element.childNodes), listDepth);
      if (quotedBlocks.length > 0) {
        blocks.push(
          quotedBlocks
            .join('\n')
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n'),
        );
      }
      return;
    }

    if (isHtmlContainerTag(tagName)) {
      const childBlockTags = Array.from(element.children).some((child) => isHtmlBlockTag(child.tagName.toLowerCase()));
      if (childBlockTags) {
        blocks.push(...serializeHtmlBlockNodes(Array.from(element.childNodes), listDepth));
        return;
      }
    }

    const text = serializeInlineNodes(Array.from(element.childNodes)).trim();
    if (text) {
      blocks.push(text);
    }
  });

  return blocks.filter(Boolean);
}

function serializeHtmlList(listElement: HTMLElement, ordered: boolean, depth: number) {
  const lines: string[] = [];

  Array.from(listElement.children).forEach((child, index) => {
    if (!(child instanceof HTMLElement) || child.tagName.toLowerCase() !== 'li') {
      return;
    }

    const marker = ordered ? `${index + 1}. ` : '- ';
    const indent = '  '.repeat(depth);
    const inlineNodes = Array.from(child.childNodes).filter((node) => !isHtmlListElement(node));
    const inlineText = serializeInlineNodes(inlineNodes).trim();
    lines.push(`${indent}${marker}${inlineText}`);

    Array.from(child.children).forEach((nested) => {
      if (!(nested instanceof HTMLElement)) {
        return;
      }

      const nestedTag = nested.tagName.toLowerCase();
      if (nestedTag === 'ul' || nestedTag === 'ol') {
        const nestedMarkdown = serializeHtmlList(nested, nestedTag === 'ol', depth + 1);
        if (nestedMarkdown) {
          lines.push(nestedMarkdown);
        }
      }
    });
  });

  return lines.join('\n').trim();
}

function serializeInlineNodes(nodes: Node[]): string {
  return normalizeInlineWhitespace(nodes.map((node) => serializeInlineNode(node)).join(''));
}

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.replace(/\u00a0/g, ' ') ?? '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'br') {
    return '\n';
  }

  const content = serializeInlineNodes(Array.from(element.childNodes));

  switch (tagName) {
    case 'strong':
    case 'b':
      return content ? `**${content}**` : '';
    case 'em':
    case 'i':
      return content ? `*${content}*` : '';
    case 'code':
      return content ? `\`${content.replace(/\n+/g, ' ').trim()}\`` : '';
    case 'a': {
      const href = element.getAttribute('href')?.trim();
      return href && content ? `[${content}](${href})` : content;
    }
    default:
      return content;
  }
}

function normalizeInlineWhitespace(value: string) {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isHtmlBlockTag(tagName: string) {
  return (
    /^h[1-6]$/.test(tagName) ||
    tagName === 'p' ||
    tagName === 'div' ||
    tagName === 'section' ||
    tagName === 'article' ||
    tagName === 'main' ||
    tagName === 'header' ||
    tagName === 'footer' ||
    tagName === 'ul' ||
    tagName === 'ol' ||
    tagName === 'blockquote' ||
    tagName === 'pre' ||
    tagName === 'hr'
  );
}

function isHtmlContainerTag(tagName: string) {
  return (
    tagName === 'div' ||
    tagName === 'section' ||
    tagName === 'article' ||
    tagName === 'main' ||
    tagName === 'header' ||
    tagName === 'footer'
  );
}

function isHtmlListElement(node: Node) {
  return node.nodeType === Node.ELEMENT_NODE && ['ul', 'ol'].includes((node as HTMLElement).tagName.toLowerCase());
}

function assignBlockIds(seeds: BlockSeed[], blockMap: BusinessPlanBlockMapItem[]) {
  const available = [...blockMap];
  const usedIds = new Set<string>();

  return seeds.map((seed, index) => {
    let reusedId: string | null = null;
    const exactByIndex = available[index];
    if (exactByIndex && exactByIndex.type === seed.type && !usedIds.has(exactByIndex.id)) {
      reusedId = exactByIndex.id;
    } else {
      const typedMatch = available.find((item) => item.type === seed.type && !usedIds.has(item.id));
      reusedId = typedMatch?.id ?? null;
    }

    const nextId = reusedId ?? createBusinessPlanEditorId('block');
    usedIds.add(nextId);

    return {
      id: nextId,
      ...seed,
    };
  });
}

function normalizeEditorBlock(block: BusinessPlanEditorBlock): BusinessPlanEditorBlock {
  if (block.type === 'heading') {
    return {
      ...block,
      text: normalizeLineBreaks(block.text).trimEnd(),
      level: Math.min(6, Math.max(1, Math.floor(block.level ?? 2))),
    };
  }

  if (block.type === 'list-item') {
    return {
      ...block,
      text: normalizeLineBreaks(block.text).trimEnd(),
      ordered: Boolean(block.ordered),
      order: block.ordered ? Math.max(1, Math.floor(block.order ?? 1)) : undefined,
    };
  }

  if (block.type === 'code') {
    return {
      ...block,
      text: normalizeLineBreaks(block.text),
      language: block.language?.trim() ?? '',
    };
  }

  if (block.type === 'card') {
    return {
      ...block,
      text: '',
      linkId: block.linkId ?? '',
    };
  }

  if (block.type === 'divider') {
    return {
      ...block,
      text: '',
    };
  }

  return {
    ...block,
    text: normalizeLineBreaks(block.text).trimEnd(),
  };
}

function serializeBusinessPlanBlock(block: BusinessPlanEditorBlock) {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(Math.min(6, Math.max(1, block.level ?? 2)))} ${block.text.trim() || 'Untitled'}`;
    case 'quote':
      return normalizeLineBreaks(block.text)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'list-item': {
      const lines = normalizeLineBreaks(block.text).split('\n');
      const marker = block.ordered ? `${block.order ?? 1}. ` : '- ';
      return `${marker}${lines[0] ?? ''}${lines.slice(1).map((line) => `\n  ${line}`).join('')}`;
    }
    case 'code':
      return `\`\`\`${block.language ?? ''}\n${normalizeLineBreaks(block.text)}\n\`\`\``;
    case 'divider':
      return '---';
    case 'card':
      return `[[card:${block.linkId ?? ''}]]`;
    case 'paragraph':
    default:
      return normalizeLineBreaks(block.text);
  }
}

function isSpecialMarkdownLine(trimmed: string) {
  return (
    /^#{1,6}\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^(-|\*|\+)\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^```/.test(trimmed) ||
    trimmed === '---' ||
    trimmed === '***' ||
    /^\[\[card:([^[\]]+)\]\]$/.test(trimmed)
  );
}

function sanitizeHref(value: string) {
  if (/^(https?:\/\/|mailto:)/i.test(value)) {
    return value;
  }
  return null;
}

function isBusinessPlanStatus(value: unknown): value is BusinessPlanStatus {
  return value === 'draft' || value === 'review' || value === 'active' || value === 'archived';
}

function normalizeBusinessPlanLinks(value: unknown): BusinessPlanLink[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const link = item as Partial<BusinessPlanLink>;

    if (
      typeof link.id !== 'string' ||
      !link.id.trim() ||
      typeof link.recordId !== 'string' ||
      !link.recordId.trim() ||
      typeof link.createdAt !== 'string' ||
      typeof link.createdBy !== 'string' ||
      !isBusinessPlanLinkType(link.type)
    ) {
      return [];
    }

    return [
      {
        id: link.id,
        type: link.type,
        recordId: link.recordId,
        createdAt: link.createdAt,
        createdBy: link.createdBy,
      },
    ];
  });
}

function normalizeBusinessPlanBlockMap(value: unknown): BusinessPlanBlockMapItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const block = item as Partial<BusinessPlanBlockMapItem>;
    if (
      typeof block.id !== 'string' ||
      !block.id.trim() ||
      !isBusinessPlanBlockType(block.type)
    ) {
      return [];
    }

    return [{ id: block.id, type: block.type }];
  });
}

function isBusinessPlanLinkType(value: unknown): value is BusinessPlanLink['type'] {
  return (
    value === 'task' ||
    value === 'cycleGoal' ||
    value === 'vision' ||
    value === 'blogArticle' ||
    value === 'contextSource' ||
    value === 'apiEndpoint' ||
    value === 'feedback' ||
    value === 'socialPost' ||
    value === 'prompt' ||
    value === 'timeBlock' ||
    value === 'environment' ||
    value === 'teamMember'
  );
}

function isBusinessPlanBlockType(value: unknown): value is BusinessPlanBlockType {
  return (
    value === 'heading' ||
    value === 'paragraph' ||
    value === 'list-item' ||
    value === 'quote' ||
    value === 'code' ||
    value === 'divider' ||
    value === 'card'
  );
}
