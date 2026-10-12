'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Underline,
  Undo2,
  Unlink,
} from 'lucide-react';

// Refined, dependency-free rich-text editor for CMS content.
// contenteditable surface + document.execCommand toolbar with:
//   - live active-state highlighting (follows the caret)
//   - headings / quote / paragraph blocks
//   - lists, indent/outdent, alignment
//   - link add/remove (context aware)
//   - undo / redo, horizontal rule, clear formatting
//   - paste cleanup (semantic tags only — no Word/inline styles)
//   - placeholder overlay when empty
// Emits HTML on every change. Legacy plain-text ("## heading" / "- bullet")
// content is auto-converted to HTML when first opened.

type ActiveState = Record<string, boolean>;

const looksLikeHtml = (value: string) => /<\s*(p|h[1-6]|ul|ol|li|strong|b|i|u|a|div|br|blockquote)\b/i.test(value);

export function legacyToHtml(text: string): string {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current.length > 0) blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);

  return blocks
    .map(block => {
      const first = block[0].trim();
      if (first.startsWith('## ')) return `<h2>${escapeHtml(first.slice(3))}</h2>`;
      if (first.startsWith('### ')) return `<h3>${escapeHtml(first.slice(4))}</h3>`;
      if (block.every(line => /^\s*[-*]\s+/.test(line))) {
        return `<ul>${block.map(line => `<li>${escapeHtml(line.trim().replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${block.map(line => escapeHtml(line.trim())).join(' ')}</p>`;
    })
    .join('');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Paste path: keep only the tags this editor produces; strip every attribute
// except href, so pasted Word / Google Docs / web content stays clean.
const ALLOWED_TAGS = new Set(['P', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A', 'BR', 'BLOCKQUOTE']);

function sanitizePasteHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Element) => {
    [...node.children].forEach(child => {
      walk(child);
      if (!ALLOWED_TAGS.has(child.tagName.toUpperCase())) {
        const parent = child.parentNode;
        if (!parent) return;
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        parent.removeChild(child);
        return;
      }
      [...child.attributes].forEach(attr => {
        const isHref = attr.name.toUpperCase() === 'HREF' && /^(https?:|\/|mailto:)/i.test(attr.value);
        if (!isHref) child.removeAttribute(attr.name);
      });
      if (child.tagName === 'A') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

function toBlocks(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return '';
  if (/^<(p|h2|h3|ul|ol|blockquote|div)\b/i.test(trimmed)) return trimmed;
  return `<p>${trimmed}</p>`;
}

function isBlank(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length === 0;
}

const BASE_BTN =
  'inline-flex h-8 w-8 items-center justify-center border border-transparent text-[#444] transition hover:border-[#ded8d0] hover:bg-white hover:text-[#111] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#111]/30';
const ACTIVE_BTN = 'border-[#111] bg-[#111] text-white shadow-sm';

function ToolButton({ title, isActive, onClick, children }: { title: string; isActive?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={isActive} className={`${BASE_BTN} ${isActive ? ACTIVE_BTN : ''}`} onMouseDown={event => event.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 my-1 w-px self-stretch bg-[#ded8d0]" aria-hidden />;
}

export default function RichTextEditor({ value, onChange, minHeight = 'min-h-56' }: { value: string; onChange: (html: string) => void; minHeight?: string }) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const lastValueRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  const [active, setActive] = useState<ActiveState>({});
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const refreshState = useCallback(() => {
    const el = surfaceRef.current;
    const selection = typeof document !== 'undefined' ? document.getSelection() : null;
    if (!el || !selection || !selection.anchorNode || !el.contains(selection.anchorNode)) return;
    const q = (command: string): boolean => {
      try {
        return document.queryCommandState(command);
      } catch {
        return false;
      }
    };
    let block = '';
    try {
      block = document.queryCommandValue('formatBlock').toLowerCase();
    } catch {
      block = '';
    }
    let inLink = false;
    let node: Node | null = selection.anchorNode;
    while (node && node !== el) {
      if (node instanceof HTMLAnchorElement) {
        inLink = true;
        break;
      }
      node = node.parentNode;
    }
    setActive({
      bold: q('bold'),
      italic: q('italic'),
      underline: q('underline'),
      ul: q('insertUnorderedList'),
      ol: q('insertOrderedList'),
      h2: block === 'h2',
      h3: block === 'h3',
      quote: block === 'blockquote',
      paragraph: block === 'p' || block === 'div' || block === '',
      left: q('justifyLeft') && !q('justifyCenter') && !q('justifyRight'),
      center: q('justifyCenter'),
      right: q('justifyRight'),
      link: inLink,
    });
  }, []);

  // Load content on mount; re-sync only on OUTSIDE changes (switching CMS
  // items) — never while typing, which would move the caret.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const html = looksLikeHtml(value) ? value : legacyToHtml(value);
    if (html !== lastValueRef.current && el.innerHTML !== html) {
      el.innerHTML = html;
    }
    lastValueRef.current = value;
    setEmpty(isBlank(el.innerHTML));
  }, [value]);

  useEffect(() => {
    document.addEventListener('selectionchange', refreshState);
    return () => document.removeEventListener('selectionchange', refreshState);
  }, [refreshState]);

  const sync = () => {
    const el = surfaceRef.current;
    if (!el) return;
    setEmpty(isBlank(el.innerHTML));
    onChangeRef.current(el.innerHTML);
    refreshState();
  };

  const exec = (command: string, argument?: string) => {
    surfaceRef.current?.focus();
    document.execCommand(command, false, argument);
    sync();
  };

  const insertHorizontalRule = () => {
    surfaceRef.current?.focus();
    document.execCommand('insertHorizontalRule');
    document.execCommand('formatBlock', false, '<p>');
    sync();
  };

  const findAnchor = (): HTMLAnchorElement | null => {
    const el = surfaceRef.current;
    const selection = document.getSelection();
    if (!el || !selection?.anchorNode) return null;
    let node: Node | null = selection.anchorNode;
    while (node && node !== el) {
      if (node instanceof HTMLAnchorElement) return node;
      node = node.parentNode;
    }
    return null;
  };

  const handleLink = () => {
    const anchor = findAnchor();
    if (anchor) {
      exec('unlink');
      return;
    }
    const selection = document.getSelection();
    const selectedText = selection?.toString() ?? '';
    const url = window.prompt('Link URL (https://…)', 'https://');
    if (!url) return;
    surfaceRef.current?.focus();
    if (selectedText) {
      document.execCommand('createLink', false, url);
    } else {
      document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    }
    sync();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rawHtml = event.clipboardData.getData('text/html');
    const plain = event.clipboardData.getData('text/plain');
    const clean = rawHtml
      ? toBlocks(sanitizePasteHtml(rawHtml))
      : `<p>${plain
          .split(/\r?\n\s*\r?\n/)
          .filter(Boolean)
          .map(paragraph => escapeHtml(paragraph).replace(/\r?\n/g, '<br>'))
          .join('</p><p>')}</p>`;
    document.execCommand('insertHTML', false, clean);
    sync();
  };

  return (
    <div className="border border-[#ded8d0] bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[#ded8d0] bg-[#f7f3ee] p-1.5">
        <ToolButton title="Bold" isActive={active.bold} onClick={() => exec('bold')}><Bold size={15} /></ToolButton>
        <ToolButton title="Italic" isActive={active.italic} onClick={() => exec('italic')}><Italic size={15} /></ToolButton>
        <ToolButton title="Underline" isActive={active.underline} onClick={() => exec('underline')}><Underline size={15} /></ToolButton>
        <ToolButton title="Clear formatting" onClick={() => exec('removeFormat')}><RemoveFormatting size={15} /></ToolButton>
        <ToolbarDivider />
        <ToolButton title="Paragraph" isActive={active.paragraph} onClick={() => exec('formatBlock', '<p>')}><Pilcrow size={15} /></ToolButton>
        <ToolButton title="Heading 2" isActive={active.h2} onClick={() => exec('formatBlock', '<h2>')}><Heading2 size={15} /></ToolButton>
        <ToolButton title="Heading 3" isActive={active.h3} onClick={() => exec('formatBlock', '<h3>')}><Heading3 size={15} /></ToolButton>
        <ToolButton title="Quote" isActive={active.quote} onClick={() => exec('formatBlock', '<blockquote>')}><Quote size={15} /></ToolButton>
        <ToolbarDivider />
        <ToolButton title="Bulleted list" isActive={active.ul} onClick={() => exec('insertUnorderedList')}><List size={15} /></ToolButton>
        <ToolButton title="Numbered list" isActive={active.ol} onClick={() => exec('insertOrderedList')}><ListOrdered size={15} /></ToolButton>
        <ToolButton title="Indent" onClick={() => exec('indent')}><IndentIncrease size={15} /></ToolButton>
        <ToolButton title="Outdent" onClick={() => exec('outdent')}><IndentDecrease size={15} /></ToolButton>
        <ToolbarDivider />
        <ToolButton title="Align left" isActive={active.left} onClick={() => exec('justifyLeft')}><AlignLeft size={15} /></ToolButton>
        <ToolButton title="Align center" isActive={active.center} onClick={() => exec('justifyCenter')}><AlignCenter size={15} /></ToolButton>
        <ToolButton title="Align right" isActive={active.right} onClick={() => exec('justifyRight')}><AlignRight size={15} /></ToolButton>
        <ToolbarDivider />
        <ToolButton title={active.link ? 'Remove link' : 'Add link'} isActive={active.link} onClick={handleLink}>
          {active.link ? <Unlink size={15} /> : <Link2 size={15} />}
        </ToolButton>
        <ToolButton title="Horizontal rule" onClick={insertHorizontalRule}><Minus size={15} /></ToolButton>
        <ToolbarDivider />
        <ToolButton title="Undo" onClick={() => exec('undo')}><Undo2 size={15} /></ToolButton>
        <ToolButton title="Redo" onClick={() => exec('redo')}><Redo2 size={15} /></ToolButton>
      </div>
      <div className="relative">
        {empty ? <span className="pointer-events-none absolute left-4 top-3 text-sm text-gray-400">Start writing your content…</span> : null}
        <div
          ref={surfaceRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Content"
          onInput={sync}
          onKeyUp={refreshState}
          onMouseUp={refreshState}
          onFocus={refreshState}
          onPaste={handlePaste}
          className={`${minHeight} max-h-[420px] overflow-auto px-4 py-3 text-sm leading-6 text-[#111] outline-none [&_a]:text-[#8f1f35] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#8f1f35] [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-[#555] [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-[#111] [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[#111] [&_hr]:my-3 [&_hr]:border-[#ded8d0] [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-6`}
        />
      </div>
      <div className="flex items-center justify-between border-t border-[#ded8d0] bg-[#faf8f5] px-3 py-1.5 text-[11px] text-[#888]">
        <span>Rich text · HTML</span>
        <span>Ctrl+B / I / U supported</span>
      </div>
    </div>
  );
}


