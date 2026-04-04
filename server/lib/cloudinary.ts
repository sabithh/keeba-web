import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadedAsset {
  url: string;
  publicId: string;
}

function sanitizePublicId(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .slice(0, 50);
}

export function uploadBufferToCloudinary(
  fileBuffer: Buffer,
  filename: string
): Promise<UploadedAsset> {
  const publicIdSeed = `${Date.now()}-${sanitizePublicId(filename)}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "keeba",
        public_id: publicIdSeed,
        resource_type: "auto",
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary upload failed"));
          return;
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    stream.end(fileBuffer);
  });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  await Promise.allSettled([
    cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
      invalidate: true,
    }),
    cloudinary.uploader.destroy(publicId, {
      resource_type: "raw",
      invalidate: true,
    }),
    cloudinary.uploader.destroy(publicId, {
      resource_type: "video",
      invalidate: true,
    }),
  ]);
}
