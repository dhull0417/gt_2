import { StyleSheet, Text, View } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@/utils/api';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { openLink } from '@/utils/openLink';

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string;
}

interface Props {
  url: string;
  isOwn: boolean;
  onLongPress?: () => void;
}

// Title / description / thumbnail card under a message that contains a web link. Fetched through the
// backend (which blocks internal addresses and caps time and size) and cached for a day, so each
// link is looked up once. Shows nothing at all when there's no preview — the plain link remains.
export function LinkPreviewCard({ url, isOwn, onLongPress }: Props) {
  const colors = useThemeColors();
  const api = useApiClient();
  const { data: preview } = useQuery<LinkPreview | null, Error>({
    queryKey: ['linkPreview', url],
    queryFn: async () => {
      const res = await api.get('/api/link-preview', { params: { url } });
      return (res.data?.preview ?? null) as LinkPreview | null;
    },
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  if (!preview) return null;

  return (
    <PressableOpacity
      onPress={() => openLink('url', preview.url)}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.8}
      style={[
        styles.card,
        isOwn
          ? { backgroundColor: 'rgba(255,255,255,0.16)' }
          : { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
      ]}
    >
      {preview.image ? (
        <Image source={{ uri: preview.image }} style={styles.image} contentFit="cover" transition={150} />
      ) : null}
      <View style={styles.body}>
        <Text style={[styles.site, { color: isOwn ? 'rgba(255,255,255,0.75)' : colors.textFaint }]} numberOfLines={1}>
          {preview.siteName}
        </Text>
        {preview.title ? (
          <Text style={[styles.title, { color: isOwn ? '#fff' : colors.textPrimary }]} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}
        {preview.description ? (
          <Text style={[styles.desc, { color: isOwn ? 'rgba(255,255,255,0.8)' : colors.textMuted }]} numberOfLines={2}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </PressableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, overflow: 'hidden', marginTop: 6, width: 240 },
  image: { width: '100%', height: 126 },
  body: { paddingHorizontal: 10, paddingVertical: 8 },
  site: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  title: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  desc: { fontSize: 12, marginTop: 2 },
});
