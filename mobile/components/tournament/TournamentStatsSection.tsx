// Group Stats: tournament titles, per-person and per-team records, and past events.
import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useApiClient } from '@/utils/api';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { makeStyles, Segmented } from '@/components/tournament/ui';
import { tournamentApi } from '@/utils/tournamentApi';
import { FORMAT_LABEL } from '@/utils/tournament';

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function TournamentStatsSection({ groupId }: { groupId: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const api = useApiClient();
  const router = useRouter();
  const [view, setView] = useState<'people' | 'teams' | 'events'>('people');
  const { data } = useQuery({ queryKey: ['tournamentStats', groupId], queryFn: () => tournamentApi.getStats(api, groupId) });

  if (!data || data.events.length === 0) return null;
  const name = (uid: string) => data.names[uid]?.firstName?.trim() || 'Former member';
  const fullName = (uid: string) => {
    const n = data.names[uid];
    return n ? `${n.firstName ?? ''} ${n.lastName ?? ''}`.trim() || 'Member' : 'Former member';
  };
  const Row = ({ title, sub, right }: { title: string; sub: string; right: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionLabel} numberOfLines={1}>{title}</Text>
        <Text style={styles.optionSub}>{sub}</Text>
      </View>
      <Text style={[styles.cardTitle, { marginLeft: 8 }]}>{right}</Text>
    </View>
  );
  const record = (r: { wins: number; losses: number; ties: number; events: number; titles: number }) =>
    `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''} · ${r.events} event${r.events === 1 ? '' : 's'}${r.titles ? ` · ${r.titles} title${r.titles === 1 ? '' : 's'}` : ''}`;

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.sectionLabel}>Tournaments</Text>
      {data.titles.length > 0 && (
        <View style={[styles.card, { marginBottom: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Feather name="award" size={16} color="#F59E0B" />
            <Text style={styles.cardTitle}>Titles</Text>
          </View>
          {data.titles.slice(0, 5).map((x, i) => (
            <View key={x.user} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={styles.body}>{i + 1}. {fullName(x.user)}</Text>
              <Text style={[styles.body, { fontWeight: '800' }]}>{x.titles}</Text>
            </View>
          ))}
        </View>
      )}
      <Segmented value={view} onChange={setView} options={[{ value: 'people', label: 'People' }, { value: 'teams', label: 'Teams' }, { value: 'events', label: 'Past events' }]} />
      <View style={[styles.card, { marginTop: 10, paddingVertical: 4 }]}>
        {view === 'people' && data.people.map((p) => <Row key={p.user} title={fullName(p.user)} sub={record(p)} right={pct(p.winPct)} />)}
        {view === 'teams' && (data.teams.length
          ? data.teams.map((t) => <Row key={t.users.join(',')} title={t.users.map(name).join(' & ')} sub={record(t)} right={pct(t.winPct)} />)
          : <Text style={[styles.hint, { paddingVertical: 10 }]}>Teams show here once the same people have played together in two events.</Text>)}
        {view === 'events' && data.events.map((e) => (
          <PressableOpacity key={e.tournamentId} onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: e.tournamentId } })}>
            <Row
              title={e.champion ? (e.champion.name || e.champion.users.map(name).join(' & ')) : '—'}
              sub={`${new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${FORMAT_LABEL[e.format]}`}
              right="›"
            />
          </PressableOpacity>
        ))}
      </View>
    </View>
  );
}
