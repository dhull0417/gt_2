import * as ImagePicker from "expo-image-picker";
import { getSupabaseClient } from "./supabase";

type Bucket = "profile-pictures" | "group-images";

export async function pickAndUploadImage(
  bucket: Bucket,
  filePath: string,
  clerkToken: string
): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  const uri = asset.uri;

  const response = await fetch(uri);
  const blob = await response.blob();

  const extension = uri.split(".").pop()?.toLowerCase() ?? "jpg";
  const mimeType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";

  const supabase = getSupabaseClient(clerkToken);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, blob, { contentType: mimeType, upsert: true });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}
