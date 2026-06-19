import { getSupabaseAdminClient } from "./supabase.server";

export const RESUME_BUCKET = "resumes";

// Ensure the resumes bucket exists (idempotent). Private bucket.
async function ensureBucket() {
  const admin = getSupabaseAdminClient();
  const { data } = await admin.storage.getBucket(RESUME_BUCKET);
  if (!data) {
    await admin.storage.createBucket(RESUME_BUCKET, {
      public: false,
      fileSizeLimit: "10MB",
      allowedMimeTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
    });
  }
}

export async function uploadResumeFile(opts: {
  userId: string;
  fileName: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<{ path: string; signedUrl: string }> {
  await ensureBucket();
  const admin = getSupabaseAdminClient();
  const safeName = opts.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${opts.userId}/${Date.now()}-${safeName}`;

  const { error } = await admin.storage
    .from(RESUME_BUCKET)
    .upload(path, opts.bytes, { contentType: opts.contentType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: signed } = await admin.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7-day signed URL

  return { path, signedUrl: signed?.signedUrl ?? "" };
}
