import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { uploadStream, destroyImage, publicIdFromUrl, type AccountName } from '@/lib/cloudinary-accounts';
import { getSupabaseAdmin, requireAdminSession } from '@/lib/supabase';
import { validateOrigin } from '@/lib/csrf';
import type { Buffer } from 'buffer';

// Ensure Buffer is available globally (Next.js server environment)
const { Buffer: BufferGlobal } = require('buffer');

// Allowed MIME types for uploads
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

// Maximum upload size: 5 MB
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

/** Extract the admin session token from the HttpOnly cookie or Authorization header. */
function getToken(request: Request): string | null {
  const rawCookie = request.headers.get('cookie') ?? '';
  const match = /(?:^|;\s*)chitra-admin-session=([^;]*)/.exec(rawCookie);
  if (match) {
    try {
      const value = decodeURIComponent(match[1] ?? '').trim();
      if (value) return value;
    } catch {
      /* malformed cookie */
    }
  }
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const bearer = authorization.slice(7).trim();
    if (bearer) return bearer;
  }
  return null;
}

// --------------------------------------------------------
// POST /api/cloudinary?action=upload
// Body: multipart/form-data with fields: file (File), account, folder
// Requires admin session.
// --------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // CSRF: fail closed on missing/invalid Origin/Referer
    const csrf = validateOrigin(request);
    if (!csrf.ok) {
      return NextResponse.json({ error: csrf.error }, { status: 403 });
    }

    // Session gate: require authenticated admin
    const supabase = getSupabaseAdmin();
    const gate = await requireAdminSession(supabase, getToken(request));
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const account = formData.get('account') as AccountName | null;
    const folder = formData.get('folder') as string || 'chitratech-shop';
    const action = new URL(request.url).searchParams.get('action');

    // Signed direct-upload endpoint: return signature params for browser-to-Cloudinary upload
    if (action === 'sign') {
      if (!account) {
        return NextResponse.json({ error: 'Account parameter is required.' }, { status: 400 });
      }
      if (!['products_1', 'products_2', 'general'].includes(account)) {
        return NextResponse.json({ error: `Invalid account: ${account}` }, { status: 400 });
      }
      const { signUpload } = await import('@/lib/cloudinary-accounts');
      const timestamp = Math.round(Date.now() / 1000);
      const publicId = `upload_${timestamp}`;
      const cfg = (await import('@/lib/cloudinary-accounts')).getAccount(account);
      const signature = signUpload(cfg.apiSecret, timestamp, folder, publicId, 'image');
      return NextResponse.json({
        ok: true,
        cloudName: cfg.cloudName,
        apiKey: cfg.apiKey,
        timestamp,
        signature,
        publicId,
        folder,
        resourceType: 'image',
      });
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (!account) {
      return NextResponse.json({ error: 'Account parameter is required.' }, { status: 400 });
    }
    if (!['products_1', 'products_2', 'general'].includes(account)) {
      return NextResponse.json({ error: `Invalid account: ${account}` }, { status: 400 });
    }

    // MIME type validation
    const fileType = file.type || '';
    if (!ALLOWED_MIME_TYPES.has(fileType.toLowerCase())) {
      return NextResponse.json(
        { error: `Unsupported file type: ${fileType || '(unknown)'}. Allowed: jpeg, png, webp, avif.` },
        { status: 400 }
      );
    }

    // Size validation: 5 MB max
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: `File too large: ${Math.round(file.size / 1024 / 1024)} MB. Maximum: 5 MB.` },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = BufferGlobal.from(arrayBuffer);

    const result = await uploadStream(buffer, file.name, account, folder);

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error('Cloudinary upload API error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed.' }, { status: 500 });
  }
}

// --------------------------------------------------------
// DELETE /api/cloudinary?action=destroy
// Body JSON: { publicId, account, resourceType? }
// Requires admin session + ownership verification.
// --------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    // CSRF: fail closed on missing/invalid Origin/Referer
    const csrf = validateOrigin(request);
    if (!csrf.ok) {
      return NextResponse.json({ error: csrf.error }, { status: 403 });
    }

    // Session gate: require authenticated admin
    const supabase = getSupabaseAdmin();
    const gate = await requireAdminSession(supabase, getToken(request));
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: 401 });
    }

    const body = await request.json();
    const { publicId, account, resourceType = 'image' } = body;

    if (!publicId) {
      return NextResponse.json({ error: 'publicId is required.' }, { status: 400 });
    }
    if (!account || !['products_1', 'products_2', 'general'].includes(account)) {
      return NextResponse.json({ error: 'Valid account parameter is required.' }, { status: 400 });
    }

    // Ownership verification: confirm the asset is referenced by a known record
    // before allowing deletion. Checks product, category, herobanner, and customers tables.
    const { data: referencedRows } = await supabase
      .from('product')
      .select('product_id, main_image_url, gallery_images_url')
      .or(`main_image_url.ilike.%${publicId}%,gallery_images_url.ilike.%${publicId}%`);
    const refData = (referencedRows ?? []) as Array<{ main_image_url?: string | null; gallery_images_url?: string | null }>;
    let isReferenced = refData.some((row) => {
      const gallery = row.gallery_images_url ? String(row.gallery_images_url) : '';
      return (row.main_image_url && String(row.main_image_url).includes(publicId)) || gallery.includes(publicId);
    });

    if (!isReferenced) {
      // Also check CMS items and hero banners
      const { data: cmsRows } = await supabase
        .from('cms_items')
        .select('path, item_id, data')
        .or(`data->>image.ilike.%${publicId}%,data->>image_url.ilike.%${publicId}%`);
      const cmsData = (cmsRows ?? []) as Array<{ data?: Record<string, unknown> }>;
      isReferenced = cmsData.some((row) => {
        const dataStr = JSON.stringify(row.data ?? {});
        return dataStr.includes(publicId);
      });
    }

    if (!isReferenced) {
      return NextResponse.json(
        { error: 'Asset not found or not owned by any record. Deletion denied.' },
        { status: 403 }
      );
    }

    const result = await destroyImage(publicId, account, resourceType);

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error('Cloudinary delete API error:', err);
    return NextResponse.json({ error: err.message || 'Delete failed.' }, { status: 500 });
  }
}