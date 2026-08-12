import { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { uploadImageFromUriWithDimensions } from '@/utils/uploadImage';
import type { PendingImage } from '@/types/chat';

interface Props {
  onSend: (text: string, image?: PendingImage) => Promise<void>;
  onTyping?: () => void;
}

export function ChatMessageInput({ onSend, onTyping }: Props) {
  const { getToken } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ localUri: string; uploaded?: PendingImage } | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access to send images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setPendingImage({ localUri: asset.uri });
    setUploading(true);

    try {
      const token = await getToken({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const filePath = `chat/${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`;
      const { url, width, height } = await uploadImageFromUriWithDimensions(asset.uri, 'chat-images', filePath, token);

      setPendingImage({ localUri: asset.uri, uploaded: { url, width, height } });
    } catch {
      Alert.alert('Upload failed', 'Could not upload the image. Please try again.');
      setPendingImage(null);
    } finally {
      setUploading(false);
    }
  };

  const canSend = !sending && !uploading && (!!text.trim() || !!pendingImage?.uploaded);

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    const image = pendingImage?.uploaded;
    const trimmed = text.trim();
    try {
      await onSend(trimmed, image);
      setText('');
      setPendingImage(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <View>
      {pendingImage && (
        <View style={styles.previewContainer}>
          <Image source={{ uri: pendingImage.localUri }} style={styles.previewImage} />
          {uploading && (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          )}
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => setPendingImage(null)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="x" size={13} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.container}>
        <TouchableOpacity
          style={styles.photoBtn}
          onPress={pickImage}
          disabled={sending || uploading}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Feather name="image" size={22} color={sending || uploading ? '#D1D5DB' : '#4A90E2'} />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(val) => { setText(val); if (val) onTyping?.(); }}
          placeholder="Message..."
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={2000}
          returnKeyType="default"
        />

        <TouchableOpacity
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!canSend}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendLabel}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewContainer: {
    marginHorizontal: 12,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#374151',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  photoBtn: {
    marginRight: 8,
    paddingBottom: 9,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginRight: 8,
  },
  sendBtn: {
    backgroundColor: '#4A90E2',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  sendBtnDisabled: { backgroundColor: '#B0C4E8' },
  sendLabel: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
