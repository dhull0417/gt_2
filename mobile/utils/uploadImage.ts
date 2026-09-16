import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { AxiosInstance } from "axios";
import { getSupabaseClient } from "./supabase";
import { requestImageCrop } from "../components/ImageCropperHost";
import { reportPermissionStatus } from "./permissions";

type Bucket = "profile-pictures" | "group-images" | "chat-images";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

interface UploadedImage {
  url: string;
  width: number;
  height: number;
}

async function processAndUpload(
  localUri: string,
  bucket: Bucket,
  filePath: string,
  clerkToken: string
): Promise<UploadedImage> {
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
  return {
    url: `${data.publicUrl}?t=${Date.now()}`,
    width: manipulated.width,
    height: manipulated.height,
  };
}

/** Ensure photo library access. If canAskAgain is false (permanently denied), offer a Settings deep-link instead of a dead-end prompt. */
export async function ensurePhotoLibraryPermission(api?: AxiosInstance): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.status === "granted") {
    if (api) reportPermissionStatus(api, { photoLibrary: "granted" });
    return true;
  }

  if (current.canAskAgain) {
    const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (api) reportPermissionStatus(api, { photoLibrary: requested.status as "granted" | "denied" | "undetermined" });
    if (requested.status === "granted") return true;
    if (!requested.canAskAgain) {
      offerSettings();
    }
    return false;
  }

  if (api) reportPermissionStatus(api, { photoLibrary: current.status as "granted" | "denied" | "undetermined" });
  offerSettings();
  return false;
}

function offerSettings() {
  Alert.alert(
    "Photo access needed",
    "Allow photo library access in Settings to add a picture.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ]
  );
}

/** Opens the image picker; returns a local URI (no upload). Android skips native allowsEditing (its toolbar has no visible confirm/cancel) and uses ImageCropperHost instead. */
export async function pickImageUri(api?: AxiosInstance): Promise<string | null> {
  const hasPermission = await ensurePhotoLibraryPermission(api);
  if (!hasPermission) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    ...(Platform.OS === "ios" ? { allowsEditing: true, aspect: [1, 1] as [number, number] } : {}),
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (Platform.OS !== "android") return asset.uri;

  return requestImageCrop(asset.uri, asset.width, asset.height);
}

/** Upload a local URI that was already picked. */
export async function uploadImageFromUri(
  localUri: string,
  bucket: Bucket,
  filePath: string,
  clerkToken: string
): Promise<string> {
  const { url } = await processAndUpload(localUri, bucket, filePath, clerkToken);
  return url;
}

/** Upload a local URI, returning the final (post-resize) dimensions alongside the URL. */
export async function uploadImageFromUriWithDimensions(
  localUri: string,
  bucket: Bucket,
  filePath: string,
  clerkToken: string
): Promise<UploadedImage> {
  return processAndUpload(localUri, bucket, filePath, clerkToken);
}

/** Delete an image from Supabase Storage by its public URL; ignores URLs outside the given bucket. */
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
  const { url } = await processAndUpload(uri, bucket, filePath, clerkToken);
  return url;
}
