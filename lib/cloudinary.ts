export type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
};

// Signed direct upload to Cloudinary.
// The client first calls GET /api/cloudinary?action=sign&account=<account>&folder=<folder>
// (authenticated, returns timestamp + signature + apiKey + cloudName + publicId),
// then POSTs the file directly to Cloudinary with the signed params.
// This avoids exposing an unsigned upload preset in the client bundle.
export async function uploadToCloudinary(
  file: File,
  account: 'products_1' | 'products_2' | 'general' = 'general',
  folder = 'chitratech-shop',
): Promise<CloudinaryUploadResult> {
  // Request signed upload params from the authenticated server endpoint
  const signRes = await fetch(
    `/api/cloudinary?action=sign&account=${encodeURIComponent(account)}&folder=${encodeURIComponent(folder)}`,
    { credentials: 'include' },
  );
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get upload signature.');
  }
  const signed = await signRes.json();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signed.apiKey);
  formData.append('timestamp', signed.timestamp);
  formData.append('signature', signed.signature);
  formData.append('public_id', signed.publicId);
  formData.append('folder', signed.folder);
  formData.append('resource_type', 'image');

  const uploadUrl = `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`;

  const response = await fetch(uploadUrl, { method: 'POST', body: formData });

  if (!response.ok) {
    throw new Error('Cloudinary upload failed.');
  }

  const payload = await response.json();

  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id,
    width: payload.width,
    height: payload.height,
    format: payload.format,
  };
}