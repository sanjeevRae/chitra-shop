import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { uploadStream, destroyImage, publicIdFromUrl, type AccountName } from '@/lib/cloudinary-accounts';
import type { Buffer } from 'buffer';

// Ensure Buffer is available globally (Next.js server environment)
const { Buffer: BufferGlobal } = require('buffer');

// --------------------------------------------------------
// POST /api/cloudinary?action=upload
// Body: multipart/form-data with fields: file (File), account, folder
// --------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const account = formData.get('account') as AccountName | null;
    const folder = formData.get('folder') as string || 'chitratech-shop';

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (!account) {
      return NextResponse.json({ error: 'Account parameter is required.' }, { status: 400 });
    }
    if (!['products_1', 'products_2', 'general'].includes(account)) {
      return NextResponse.json({ error: `Invalid account: ${account}` }, { status: 400 });
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
// --------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { publicId, account, resourceType = 'image' } = body;

    if (!publicId) {
      return NextResponse.json({ error: 'publicId is required.' }, { status: 400 });
    }
    if (!account || !['products_1', 'products_2', 'general'].includes(account)) {
      return NextResponse.json({ error: 'Valid account parameter is required.' }, { status: 400 });
    }

    const result = await destroyImage(publicId, account, resourceType);

    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error('Cloudinary delete API error:', err);
    return NextResponse.json({ error: err.message || 'Delete failed.' }, { status: 500 });
  }
}