import { useMemo, useRef, useState } from 'react';
import { View, TextInput, Text, StyleSheet, ActivityIndicator, Image, Alert, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { ensurePhotoLibraryPermission, uploadImageFromUriWithDimensions } from '@/utils/uploadImage';
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

const TRAY_LAYOUT_ANIM = LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity);

interface Props {
  // mentions: Clerk ids of the people @mentioned in the text.
  onSend: (text: string, image?: PendingImage, mentions?: string[]) => Promise<void>;
  // People who can be @mentioned (everyone in the group except you). Omit to turn mentions off, e.g. in a DM.
  mentionMembers?: MentionMember[];
  onTyping?: () => void;
  onCreateEvent?: () => void;
  onCreatePoll?: () => void;
}

export function ChatMessageInput({ onSend, onTyping, onCreateEvent, onCreatePoll, mentionMembers }: Props) {
  const colors = useThemeColors();
  const { getToken } = useAuth();
  const api = useApiClient();
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<{ localUri: string; uploaded?: PendingImage } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | undefined>();
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
    setText(next.text);
    setCursor(next.cursor);
    setForcedSelection({ start: next.cursor, end: next.cursor });
    setPicked((prev) => (prev.some((p) => p.clerkId === member.clerkId) ? prev : [...prev, member]));
  };
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

  const pickImage = async () => {
    const hasPermission = await ensurePhotoLibraryPermission(api);
    if (!hasPermission) return;

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

  const canSend = !uploading && (!!text.trim() || !!pendingImage?.uploaded);

  // Doesn't await onSend: a send can stay paused for a while offline (it's
  // queued, not lost — see useMessages/chatMutations), and this input
  // shouldn't stay locked for that whole time. The caller (group-chat screen)
  // already surfaces genuine failures via Alert, so nothing else to do here.
  const handleSend = () => {
    if (!canSend) return;
    const image = pendingImage?.uploaded;
    const trimmed = text.trim();
    const mentions = extractMentions(trimmed, picked);
    setText('');
    setCursor(0);
    setPicked([]);
    setPendingImage(null);
    onSend(trimmed, image, mentions.length ? mentions : undefined).catch(() => {});
  };

  const plusRotation = attachAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

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
          <PressableOpacity accessibilityLabel="Remove"
            style={[styles.removeBtn, { backgroundColor: colors.textSecondary }]}
            onPress={() => setPendingImage(null)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="x" size={13} color="#fff" />
          </PressableOpacity>
        </View>
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
          style={[styles.input, { backgroundColor: colors.backgroundAlt, color: colors.textPrimary }]}
          value={text}
          onChangeText={(val) => { setText(val); if (val) onTyping?.(); }}
          onSelectionChange={(e) => {
            setCursor(e.nativeEvent.selection.start);
            if (forcedSelection) setForcedSelection(undefined);
          }}
          selection={forcedSelection}
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
