import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';

// Server-rendered policy page (Refund / Terms / Shipping).
// Content lives in cms_items where path='policies' and item_id=<slug>;
// admins edit it at Admin > Content (CMS) > Policies (or the Policies tab).
// Format rules for `content`:
//   ## Heading   -> <h2>
//   - item       -> <li> (consecutive lines grouped into a <ul>)
//   blank line   -> paragraph break
//   other text   -> paragraph
type PolicyRow = { title?: string; content?: string; enabled?: unknown };

const looksLikeHtml = (value: string) => /<\s*(p|h[1-6]|ul|ol|li|strong|b|i|u|a|div|br)\b/i.test(value);

// Content only ever comes from the token-gated admin editor, but strip the
// obviously dangerous bits anyway before rendering (belt and braces).
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
}

function isFlaggedOn(flag: unknown): boolean {
  if (typeof flag === 'boolean') return flag;
  if (typeof flag === 'string') return flag.trim().toLowerCase() !== 'false';
  if (typeof flag === 'number') return flag !== 0;
  return true;
}

function renderContent(content: string) {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      if (current.length > 0) blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);

  return blocks.map((block, blockIndex) => {
    const first = block[0].trim();
    if (first.startsWith('## ')) {
      return (
        <h2 key={blockIndex} className="mt-8 mb-3 text-xl sm:text-2xl font-semibold text-gray-900">
          {first.slice(3)}
        </h2>
      );
    }
    if (block.every(line => line.trim().startsWith('- ') || line.trim().startsWith('* '))) {
      return (
        <ul key={blockIndex} className="my-4 list-disc space-y-2 pl-6 text-gray-700">
          {block.map((line, lineIndex) => (
            <li key={lineIndex}>{line.trim().slice(2)}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={blockIndex} className="my-4 leading-7 text-gray-700">
        {block.join(' ')}
      </p>
    );
  });
}

async function loadPolicy(slug: string): Promise<{ title: string; content: string } | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('cms_items')
      .select('data')
      .eq('path', 'policies')
      .eq('item_id', slug)
      .maybeSingle();
    if (error || !data) return null;
    const row = ((data as { data?: unknown }).data ?? {}) as PolicyRow;
    if ('enabled' in row && !isFlaggedOn(row.enabled)) return null;
    const title = String(row.title ?? '').trim();
    const content = String(row.content ?? '').trim();
    if (!title && !content) return null;
    return { title, content };
  } catch {
    return null;
  }
}

export default async function PolicyPage({
  slug,
  fallbackTitle,
  updated,
}: {
  slug: string;
  fallbackTitle: string;
  updated?: string;
}) {
  const policy = await loadPolicy(slug);

  return (
    <main>
      <section className="py-10 lg:py-20">
        <div className="max-w-3xl mx-auto px-4 lg:px-6">
          <p className="mb-2 text-sm font-medium text-gray-500">
            <Link href="/" className="hover:text-violet-600">Home</Link>
            {' / '}
            <span className="text-gray-800">{policy?.title || fallbackTitle}</span>
          </p>
          <h1 className="mb-6 text-2xl sm:text-3xl lg:text-5xl font-medium text-gray-800 -tracking-[1.92px]">
            {policy?.title || fallbackTitle}
          </h1>
          {policy?.content ? (
            looksLikeHtml(policy.content) ? (
              <div
                className="policy-content text-base text-gray-700 [&_a]:text-violet-600 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:my-4 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-500 [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-900 [&_hr]:my-6 [&_hr]:border-gray-200 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:my-4 [&_ol]:pl-6 [&_p]:my-4 [&_p]:leading-7 [&_ul]:list-disc [&_ul]:my-4 [&_ul]:pl-6 sm:[&_h2]:text-2xl"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(policy.content) }}
              />
            ) : (
              <div className="text-base text-gray-700">{renderContent(policy.content)}</div>
            )
          ) : (
            <p className="border border-dashed border-gray-300 bg-gray-50 p-6 text-gray-500">
              This page is being prepared. Please check back soon.
            </p>
          )}
          <p className="mt-10 text-sm text-gray-400">
            Last updated: {updated ?? 'October 2026'}
          </p>
        </div>
      </section>
    </main>
  );
}
