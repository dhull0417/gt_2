import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { getSupabaseClient } from "./supabase";

type Bucket = "profile-pictures" | "group-images";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function processAndUpload(
  localUri: string,
  bucket: Bucket,
  filePath: string,
  clerkToken: string
): Promise<string> {
  const manipulated = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 800 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  if (!manipulated.base64) throw new Error("Failed to process image.");

  const arrayBuffer = base64ToArrayBuffer(manipulated.base64);
  const supabase = getSupabaseClient(clerkToken);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, arrayBuffer, { contentType: "image/jpeg", upsert: true });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return `${data.publicUrl}?t=${Date.now()}`;
}

/** Open the image picker and return a local URI without uploading. */
export async function pickImageUri(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

/** Upload a local URI that was already picked. */
export async function uploadImageFromUri(
  localUri: string,
  bucket: Bucket,
  filePath: string,
  clerkToken: string
): Promise<string> {
  return processAndUpload(localUri, bucket, filePath, clerkToken);
}

/**
 * Delete an image from Supabase Storage by its public URL.
 * Silently ignores URLs that don't belong to the given bucket.
 */
export async function deleteStorageImage(
  imageUrl: string,
  bucket: Bucket,
  clerkToken: string
): Promise<void> {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return;
  const path = imageUrl.slice(idx + marker.length).split("?")[0];
  const supabase = getSupabaseClient(clerkToken);
  await supabase.storage.from(bucket).remove([path]);
}

/** Pick and immediately upload in one step (used for profile pictures). */
export async function pickAndUploadImage(
  bucket: Bucket,
  filePath: string,
  clerkToken: string
): Promise<string | null> {
  const uri = await pickImageUri();
  if (!uri) return null;
  return processAndUpload(uri, bucket, filePath, clerkToken);
}
