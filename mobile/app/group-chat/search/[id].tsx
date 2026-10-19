import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useContentTopInset } from '@/hooks/useContentTopInset';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { getSupabaseClient } from '@/utils/supabase';
import { ChatImageViewer } from '@/components/ChatImageViewer';
import type { ChatMessage } from '@/types/chat';

const SEARCH_LIMIT = 50;
const PHOTO_PAGE = 60;
const MIN_QUERY = 2;

type Tab = 'search' | 'photos';

// Escape LIKE wildcards so searching "50%" or "a_b" matches the literal text.
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

function Highlighted({ text, query, color, hi }: { text: string; query: string; color: string; hi: string }) {
  const parts = useMemo(() => {
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const out: { t: string; match: boolean }[] = [];
    let i = 0;
    while (i < text.length) {
      const at = q ? lower.indexOf(q, i) : -1;
      if (at === -1) { out.push({ t: text.slice(i), match: false }); break; }
      if (at > i) out.push({ t: text.slice(i, at), match: false });
      out.push({ t: text.slice(at, at + q.length), match: true });
      i = at + q.length;
    }
    return out;
  }, [text, query]);
  return (
    <Text style={{ fontSize: 15, color }} numberOfLines={4}>
      {parts.map((p, i) =>
        p.match ? <Text key={i} style={{ backgroundColor: hi, fontWeight: '700' }}>{p.t}</Text> : p.t
      )}
    </Text>
  );
}

export default function ChatSearchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id ?? '';
  const router = useRouter();
  const colors = useThemeColors();
  const contentTopInset = useContentTopInset();
  const { width } = useWindowDimensions();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [tab, setTab] = useState<Tab>('search');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [viewer, setViewer] = useState<ChatMessage | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const searchEnabled = tab === 'search' && query.length >= MIN_QUERY;
  const { data: results = [], isFetching: searching, isError: searchFailed } = useQuery<ChatMessage[], Error>({
    queryKey: ['chatSearch', groupId, query],
    enabled: searchEnabled && !!groupId,
    retry: false,
    gcTime: 60_000,
    queryFn: async () => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const { data, error } = await getSupabaseClient(token)
        .from('messages')
        .select('*')
        .eq('group_id', groupId)
        .is('deleted_at', null)
        .ilike('content', likePattern(query))
        .order('created_at', { ascending: false })
        .limit(SEARCH_LIMIT);
      if (error) throw error;
      return ((data ?? []) as ChatMessage[]).filter((m) => m.kind !== 'system');
    },
  });

  const photos = useInfiniteQuery<ChatMessage[], Error, { pages: ChatMessage[][] }, readonly unknown[], string | null>({
    queryKey: ['chatPhotos', groupId],
    enabled: tab === 'photos' && !!groupId,
    initialPageParam: null,
    gcTime: 60_000,
    queryFn: async ({ pageParam }) => {
      const token = await getTokenRef.current({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      let q = getSupabaseClient(token)
        .from('messages')
        .select('*')
        .eq('group_id', groupId)
        .not('image_url', 'is', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PHOTO_PAGE);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
    getNextPageParam: (last) => (last.length === PHOTO_PAGE ? last[last.length - 1].created_at : undefined),
  });
  const photoList = useMemo(() => (photos.data?.pages ?? []).flat(), [photos.data]);

  const GAP = 2;
  const size = Math.floor((width - GAP * 2) / 3);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, paddingTop: contentTopInset }} edges={['left', 'right', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <PressableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={{ padding: 4 }}>
          <Feather name="chevron-left" size={26} color="#FF7A6E" />
        </PressableOpacity>
        {tab === 'search' ? (
          <View style={[styles.searchBox, { backgroundColor: colors.backgroundAlt }]}>
            <Feather name="search" size={16} color={colors.textFaint} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              value={input}
              onChangeText={setInput}
              placeholder="Search messages"
              placeholderTextColor={colors.placeholder}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
            />
            {input.length > 0 && (
              <PressableOpacity onPress={() => setInput('')} hitSlop={8}>
                <Feather name="x-circle" size={16} color={colors.textFaint} />
              </PressableOpacity>
            )}
          </View>
        ) : (
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '900', color: colors.textPrimary, marginLeft: 6 }}>Photos</Text>
        )}
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['search', 'photos'] as Tab[]).map((t) => (
          <PressableOpacity key={t} style={[styles.tab, tab === t && { borderBottomColor: colors.brand }]} onPress={() => setTab(t)}>
            <Text style={{ fontWeight: '700', color: tab === t ? colors.brand : colors.textFaint }}>
              {t === 'search' ? 'Messages' : 'Photos'}
            </Text>
          </PressableOpacity>
        ))}
      </View>

      {tab === 'search' ? (
        <FlatList
          key="search-list"
          data={searchEnabled ? results : []}
          keyExtractor={(m) => m.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.center}>
              {searching && searchEnabled ? (
                <ActivityIndicator />
              ) : searchFailed ? (
                <Text style={{ color: colors.textFaint }}>Search isn't available right now.</Text>
              ) : (
                <Text style={{ color: colors.textFaint, textAlign: 'center', paddingHorizontal: 32 }}>
                  {query.length < MIN_QUERY ? 'Type at least 2 letters to search this chat.' : 'No messages found.'}
                </Text>
              )}
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 16 }} />}
          renderItem={({ item }) => (
            <View style={styles.result}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textMuted }}>{item.sender_name}</Text>
                <Text style={{ fontSize: 12, color: colors.textFaint }}>
                  {new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
              <Highlighted text={item.content} query={query} color={colors.textPrimary} hi={colors.brandSoft} />
            </View>
          )}
        />
      ) : (
        <FlatList
          // Different column count than the search list; React Native can't change numColumns in place,
          // so the two lists must be separate instances.
          key="photo-grid"
          data={photoList}
          keyExtractor={(m) => m.id}
          numColumns={3}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP, flexGrow: 1 }}
          onEndReachedThreshold={0.6}
          onEndReached={() => { if (photos.hasNextPage && !photos.isFetchingNextPage) photos.fetchNextPage(); }}
          ListEmptyComponent={
            <View style={styles.center}>
              {photos.isLoading ? (
                <ActivityIndicator />
              ) : (
                <Text style={{ color: colors.textFaint }}>{photos.isError ? "Couldn't load photos." : 'No photos shared yet.'}</Text>
              )}
            </View>
          }
          ListFooterComponent={photos.isFetchingNextPage ? <ActivityIndicator style={{ margin: 16 }} /> : null}
          renderItem={({ item }) => (
            <PressableOpacity onPress={() => setViewer(item)} activeOpacity={0.8}>
              <Image source={{ uri: item.image_url! }} style={{ width: size, height: size }} contentFit="cover" recyclingKey={item.id} />
            </PressableOpacity>
          )}
        />
      )}

      <ChatImageViewer
        visible={!!viewer}
        imageUrl={viewer?.image_url ?? null}
        imageWidth={viewer?.image_width}
        imageHeight={viewer?.image_height}
        onClose={() => setViewer(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, height: 38, marginLeft: 4 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  result: { paddingHorizontal: 16, paddingVertical: 12 },
});
