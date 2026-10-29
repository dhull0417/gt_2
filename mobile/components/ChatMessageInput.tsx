import { useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Text, StyleSheet, ActivityIndicator, Image, ScrollView, Alert, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { ensureCameraPermission, ensurePhotoLibraryPermission, uploadImageFromUriWithDimensions } from '@/utils/uploadImage';
import { useApiClient } from '@/utils/api';
import type { PendingImage } from '@/types/chat';
import { useThemeColors } from '@/contexts/AppearanceContext';
import {
  applyMention,
  extractMentions,
  filterMembers,
  findActiveMention,
  type MentionMember,
} from '@/utils/chatMentions';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MAX_PHOTOS = 4;
interface PendingEntry { key: string; localUri: string; uploaded?: PendingImage }

const TRAY_LAYOUT_ANIM = LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity);

interface Props {
  // mentions: Clerk ids of the people @mentioned in the text.
  onSend: (text: string, image?: PendingImage, mentions?: string[]) => Promise<void>;
  // People who can be @mentioned (everyone in the group except you). Omit to turn mentions off, e.g. in a DM.
  mentionMembers?: MentionMember[];
  onTyping?: () => void;
  onCreateEvent?: () => void;
  onCreatePoll?: () => void;
  // Photos are stored under chat/<groupId>/ so access can be limited to the group's members.
  groupId: string;
}

export function ChatMessageInput({ onSend, onTyping, onCreateEvent, onCreatePoll, mentionMembers, groupId }: Props) {
  const colors = useThemeColors();
  const { getToken } = useAuth();
  const api = useApiClient();
  const [text, setText] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  // Where to put the cursor once a picked @mention has been written into the text. Applied through the
  // ref after the new text renders, not via a controlled `selection` prop: on Android that prop can be
  // applied before the longer text lands, which jumps the cursor (or throws on an out-of-range index).
  const inputRef = useRef<TextInput>(null);
  const pendingCursor = useRef<number | null>(null);
  const [picked, setPicked] = useState<MentionMember[]>([]);
  const activeMention = useMemo(
    () => (mentionMembers?.length ? findActiveMention(text, cursor) : null),
    [mentionMembers, text, cursor]
  );
  const suggestions = useMemo(
    () => (activeMention && mentionMembers ? filterMembers(mentionMembers, activeMention.query) : []),
    [activeMention, mentionMembers]
  );

  const pickMention = (member: MentionMember) => {
    if (!activeMention) return;
    const next = applyMention(text, activeMention, cursor, member.name);
    pendingCursor.current = next.cursor;
    setText(next.text);
    setCursor(next.cursor);
    setPicked((prev) => (prev.some((p) => p.clerkId === member.clerkId) ? prev : [...prev, member]));
  };
  useEffect(() => {
    if (pendingCursor.current === null) return;
    const pos = Math.min(pendingCursor.current, text.length);
    pendingCursor.current = null;
    inputRef.current?.setSelection(pos, pos);
  }, [text]);
  const attachAnim = useRef(new Animated.Value(0)).current;

  const toggleAttachMenu = () => {
    const next = !attachMenuOpen;
    LayoutAnimation.configureNext(TRAY_LAYOUT_ANIM);
    setAttachMenuOpen(next);
    Animated.timing(attachAnim, {
      toValue: next ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  const closeAttachMenu = () => {
    if (!attachMenuOpen) return;
    LayoutAnimation.configureNext(TRAY_LAYOUT_ANIM);
    setAttachMenuOpen(false);
    Animated.timing(attachAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  // Up to MAX_PHOTOS pictures can be attached to one send. Each is uploaded as soon as it's chosen.
  const addPhotos = async (uris: string[]) => {
    if (!uris.length) return;
    const room = MAX_PHOTOS - pendingImages.length;
    const chosen = uris.slice(0, Math.max(room, 0));
    if (uris.length > chosen.length) Alert.alert('Photo limit', `You can attach up to ${MAX_PHOTOS} photos at a time.`);
    if (!chosen.length) return;

    const entries = chosen.map((localUri) => ({ key: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`, localUri } as PendingEntry));
    setPendingImages((prev) => [...prev, ...entries]);
    setUploading(true);
    try {
      const token = await getToken({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      await Promise.all(entries.map(async (entry) => {
        try {
          const filePath = `chat/${groupId}/${entry.key}.jpg`;
          const uploaded = await uploadImageFromUriWithDimensions(entry.localUri, 'chat-images', filePath, token);
          setPendingImages((prev) => prev.map((p) => (p.key === entry.key ? { ...p, uploaded } : p)));
        } catch {
          setPendingImages((prev) => prev.filter((p) => p.key !== entry.key));
          Alert.alert('Upload failed', 'Could not upload one of the photos. Please try again.');
        }
      }));
    } catch {
      setPendingImages((prev) => prev.filter((p) => !entries.some((e) => e.key === p.key)));
      Alert.alert('Upload failed', 'Could not upload the image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const pickImage = async () => {
    const hasPermission = await ensurePhotoLibraryPermission(api);
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: Math.max(MAX_PHOTOS - pendingImages.length, 1),
    });
    if (result.canceled || !result.assets?.length) return;
    await addPhotos(result.assets.map((a) => a.uri));
  };

  const takePhoto = async () => {
    if (!(await ensureCameraPermission())) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false });
    if (result.canceled || !result.assets?.[0]) return;
    await addPhotos([result.assets[0].uri]);
  };

  const readyImages = pendingImages.filter((p) => p.uploaded);
  const canSend = !uploading && (!!text.trim() || readyImages.length > 0);

  // Doesn't await onSend: a send can stay paused for a while offline (it's
  // queued, not lost — see useMessages/chatMutations), and this input
  // shouldn't stay locked for that whole time. The caller (group-chat screen)
  // already surfaces genuine failures via Alert, so nothing else to do here.
  const handleSend = () => {
    if (!canSend) return;
    const images = readyImages.map((p) => p.uploaded!);
    const trimmed = text.trim();
    const mentions = extractMentions(trimmed, picked);
    setText('');
    setCursor(0);
    setPicked([]);
    setPendingImages([]);
    // The text goes with the first photo; every extra photo is its own message right after it.
    if (images.length === 0) {
      onSend(trimmed, undefined, mentions.length ? mentions : undefined).catch(() => {});
      return;
    }
    (async () => {
      try {
        await onSend(trimmed, images[0], mentions.length ? mentions : undefined);
        for (const extra of images.slice(1)) await onSend('', extra);
      } catch { /* the chat screen already surfaces send failures */ }
    })();
  };

  const plusRotation = attachAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <View>
      {pendingImages.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.previewRow}>
          {pendingImages.map((img) => (
            <View key={img.key} style={styles.previewContainer}>
              <Image source={{ uri: img.localUri }} style={styles.previewImage} />
              {!img.uploaded && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              )}
              <PressableOpacity accessibilityLabel="Remove"
                style={[styles.removeBtn, { backgroundColor: colors.textSecondary }]}
                onPress={() => setPendingImages((prev) => prev.filter((p) => p.key !== img.key))}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Feather name="x" size={13} color="#fff" />
              </PressableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {suggestions.length > 0 && (
        <View style={[styles.suggestions, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          {suggestions.map((m) => (
            <PressableOpacity key={m.clerkId} style={styles.suggestionRow} onPress={() => pickMention(m)} activeOpacity={0.6}>
              <View style={[styles.suggestionAt, { backgroundColor: colors.brand + '20' }]}>
                <Text style={{ color: colors.brand, fontWeight: '800', fontSize: 13 }}>@</Text>
              </View>
              <Text style={[styles.suggestionName, { color: colors.textPrimary }]} numberOfLines={1}>{m.name}</Text>
            </PressableOpacity>
          ))}
        </View>
      )}

      {attachMenuOpen && (
        <View style={[styles.tray, { backgroundColor: colors.surface }]}>
          <View style={styles.trayRow}>
            <PressableOpacity
              style={styles.trayItem}
              onPress={() => { closeAttachMenu(); pickImage(); }}
            >
              <View style={[styles.trayIconWrap, { backgroundColor: colors.brand + '20' }]}>
                <Feather name="image" size={20} color={colors.brand} />
              </View>
              <Text style={[styles.trayItemLabel, { color: colors.textSecondary }]}>Photos</Text>
            </PressableOpacity>

            <PressableOpacity
              style={styles.trayItem}
              onPress={() => { closeAttachMenu(); takePhoto(); }}
            >
              <View style={[styles.trayIconWrap, { backgroundColor: '#F59E0B20' }]}>
                <Feather name="camera" size={20} color="#F59E0B" />
              </View>
              <Text style={[styles.trayItemLabel, { color: colors.textSecondary }]}>Camera</Text>
            </PressableOpacity>

            {onCreateEvent && (
              <PressableOpacity
                style={styles.trayItem}
                onPress={() => { closeAttachMenu(); onCreateEvent(); }}
              >
                <View style={[styles.trayIconWrap, { backgroundColor: '#10B98120' }]}>
                  <Feather name="calendar" size={20} color="#10B981" />
                </View>
                <Text style={[styles.trayItemLabel, { color: colors.textSecondary }]}>Event</Text>
              </PressableOpacity>
            )}

            {onCreatePoll && (
              <PressableOpacity
                style={styles.trayItem}
                onPress={() => { closeAttachMenu(); onCreatePoll(); }}
              >
                <View style={[styles.trayIconWrap, { backgroundColor: '#7C3AED20' }]}>
                  <Feather name="bar-chart-2" size={20} color="#7C3AED" />
                </View>
                <Text style={[styles.trayItemLabel, { color: colors.textSecondary }]}>Poll</Text>
              </PressableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={[styles.container, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <PressableOpacity
          style={styles.photoBtn}
          onPress={toggleAttachMenu}
          disabled={uploading}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Animated.View style={{ transform: [{ rotate: plusRotation }] }}>
            <Feather name="plus-circle" size={24} color={uploading ? colors.borderStrong : colors.brand} />
          </Animated.View>
        </PressableOpacity>

        <TextInput
          ref={inputRef}
          style={[styles.input, { backgroundColor: colors.backgroundAlt, color: colors.textPrimary }]}
          value={text}
          onChangeText={(val) => { setText(val); if (val) onTyping?.(); }}
          onSelectionChange={(e) => setCursor(e.nativeEvent.selection.start)}
          onFocus={closeAttachMenu}
          placeholder="Message..."
          placeholderTextColor={colors.placeholder}
          multiline
          maxLength={2000}
          returnKeyType="default"
        />

        <PressableOpacity
          style={[styles.sendBtn, { backgroundColor: colors.brand }, !canSend && { backgroundColor: colors.borderStrong }]}
          onPress={handleSend}
          disabled={!canSend}
        >
          <Text style={styles.sendLabel}>Send</Text>
        </PressableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewRow: { paddingHorizontal: 12, gap: 8 },
  previewContainer: {
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
  suggestions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  suggestionAt: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  suggestionName: { fontSize: 15, fontWeight: '600', flex: 1 },
  tray: {
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  trayRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  trayItem: {
    alignItems: 'center',
    marginRight: 24,
  },
  trayIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  trayItemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
});
