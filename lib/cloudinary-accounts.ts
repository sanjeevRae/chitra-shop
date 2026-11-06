export type AccountName = 'products_1' | 'products_2' | 'general';

type AccountConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

const ACCOUNTS: Record<AccountName, AccountConfig> = {
  products_1: {
    cloudName: process.env.CLOUDINARY_1_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_1_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_1_API_SECRET || '',
  },
  products_2: {
    cloudName: process.env.CLOUDINARY_2_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_2_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_2_API_SECRET || '',
  },
  general: {
    cloudName: process.env.CLOUDINARY_3_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_3_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_3_API_SECRET || '',
  },
};

function getAccount(account: AccountName): AccountConfig {
  const cfg = ACCOUNTS[account];
  if (!cfg.cloudName || !cfg.apiKey || !cfg.apiSecret) {
    throw new Error(
      `Cloudinary ${account} is not configured. Check that CLOUDINARY_${account.toUpperCase()}_CLOUD_NAME, _API_KEY and _API_SECRET are set.`,
    );
  }
  return cfg;
}

function signUpload(
  apiSecret: string,
  timestamp: number,
  folder: string,
  publicId: string,
  resourceType: 'image' | 'video' = 'image',
): string {
  // Build sorted parameter string for Cloudinary signature
  // Parameters must be sorted alphabetically by key
  const params: string[] = [];
  if (folder) params.push(`folder=${folder}`);
  if (publicId) params.push(`public_id=${publicId}`);
  params.push(`timestamp=${timestamp}`);
  // Sort alphabetically
  params.sort();
  const paramString = params.join('&');
  const crypto = require('crypto');
  return crypto.createHash('sha1').update(paramString + apiSecret).digest('hex');
}

export async function uploadStream(
  buffer: Buffer,
  filename: string | null,
  account: AccountName,
  folder: string,
): Promise<{
  secureUrl: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  resourceType: 'image' | 'video';
  folder: string;
  account: string;
}> {
  const cfg = getAccount(account);
  const timestamp = Math.round(Date.now() / 1000);

  let publicId = '';
  if (filename) {
    const nameWithoutExt = filename
      .replace(/\.[^ .]+$/, '')
      .replace(/\s+/g, '_')
      .replace(/[^\w\-_]/g, '_')
      .replace(/_+$/, '_')
      .trim();
    publicId = nameWithoutExt || `upload_${timestamp}`;
  } else {
    publicId = `upload_${timestamp}`;
  }

  const signature = signUpload(cfg.apiSecret, timestamp, folder, publicId, 'image');

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`;

  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buffer)]), filename || 'upload');
  formData.append('folder', folder);
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);
  formData.append('api_key', cfg.apiKey);
  formData.append('public_id', publicId);
  formData.append('resource_type', 'image');

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Cloudinary upload failed (${response.status}): ${txt}`);
  }

  const payload = (await response.json()) as {
    secure_url: string;
    public_id: string;
    width?: number;
    height?: number;
    format?: string;
  };

  return {
    secureUrl: payload.secure_url || '',
    publicId: payload.public_id || publicId,
    width: payload.width,
    height: payload.height,
    format: payload.format,
    resourceType: 'image',
    folder,
    account: account,
  };
}

export async function destroyImage(
  publicId: string,
  account: AccountName,
  resourceType: 'image' | 'video' = 'image',
): Promise<{ success: boolean }> {
  const cfg = getAccount(account);
  const timestamp = Math.round(Date.now() / 1000);
  const signature = signUpload(cfg.apiSecret, timestamp, '', publicId, resourceType);

  const destroyUrl = `https://api.cloudinary.com/v1_1/${cfg.cloudName}/destroy`;

  const formData = new FormData();
  formData.append('file', ''); // empty file for delete
  formData.append('timestamp', timestamp.toString());
  formData.append('signature', signature);
  formData.append('api_key', cfg.apiKey);
  formData.append('public_id', publicId);
  formData.append('resource_type', resourceType);

  const response = await fetch(destroyUrl, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Cloudinary delete failed (${response.status}): ${txt}`);
  }

  return { success: true };
}

export function publicIdFromUrl(secureUrl: string): { account: string; publicId: string } {
  try {
    const url = new URL(secureUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    let publicId = '';
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      const dotIdx = seg.lastIndexOf('.');
      if (dotIdx > 0) {
        publicId = segments[i - 1] || '';
        break;
      }
    }
    let account = 'unknown';
    for (const [name, cfg] of Object.entries(ACCOUNTS) as [string, AccountConfig][]) {
      if (cfg.cloudName && url.hostname.includes(cfg.cloudName)) {
        account = name;
        break;
      }
    }
    return { account, publicId };
  } catch {
    return { account: 'unknown', publicId: '' };
  }
}

export type { AccountConfig };