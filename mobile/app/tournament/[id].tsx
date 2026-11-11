// An event's results: matches, standings or bracket, and teams. Players enter their own
// match results; owners and moderators can fix any result and Update / Randomize / Edit.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useApiClient, userApi, User } from '@/utils/api';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useToast } from '@/contexts/ToastContext';
import { Segmented, makeStyles, TEAM_COLORS } from '@/components/tournament/ui';
import ResultSheet from '@/components/tournament/ResultSheet';
import BracketView from '@/components/tournament/BracketView';
import { tournamentApi, apiError, Tournament, TMatch, ResultBody } from '@/utils/tournamentApi';
import { roundsOf, teamLabel, matchTitle, resultLine, canReport, myTeam, myNextMatch, playerLabel, FORMAT_LABEL } from '@/utils/tournament';

type Tab = 'matches' | 'table' | 'teams';

export default function TournamentScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const api = useApiClient();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: me } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
  const { data: t, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['tournament', id],
    queryFn: () => tournamentApi.get(api, id!),
    enabled: !!id,
    refetchInterval: 15000,
  });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));
  const [tab, setTab] = useState<Tab>('matches');
  const [open, setOpen] = useState<TMatch | null>(null);
  const [menu, setMenu] = useState(false);
  const meId = me?._id;

  const put = (next: Tournament) => {
    queryClient.setQueryData(['tournament', id], next);
    queryClient.invalidateQueries({ queryKey: ['tournamentForMeetup', next.meetup] });
  };

  const report = async (body: ResultBody): Promise<string | null> => {
    if (!t || !open) return null;
    try {
      const next = await tournamentApi.report(api, t._id!, open.id, body);
      put(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return null;
    } catch (err) {
      return apiError(err).message;
    }
  };

  const withConfirm = async (run: (confirm: boolean) => Promise<void>) => {
    try {
      await run(false);
    } catch (err) {
      const e = apiError(err);
      if (e.code === 'results_exist') {
        Alert.alert('Start over?', 'This clears the recorded results.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear results', style: 'destructive', onPress: () => run(true).catch((x) => Alert.alert('Could not update', apiError(x).message)) },
        ]);
      } else Alert.alert('Could not update', e.message);
    }
  };

  const doUpdate = () => withConfirm(async (confirm) => {
    const r = await tournamentApi.update(api, t!._id!, confirm);
    put(r.tournament);
    if (r.unchanged) toast.success("No changes — everyone's still the same.");
    else toast.success('Updated with the current players.');
  });
  const doRandomize = () => withConfirm(async (confirm) => {
    put(await tournamentApi.randomize(api, t!._id!, confirm));
    toast.success('Shuffled.');
  });
  const doDelete = () => Alert.alert('Delete this event?', 'Its teams, matches and results are removed.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try {
        await tournamentApi.remove(api, t!._id!);
        queryClient.invalidateQueries({ queryKey: ['tournamentForMeetup', t!.meetup] });
        router.back();
      } catch (err) { Alert.alert('Could not delete', apiError(err).message); }
    } },
  ]);

  if (isLoading || !t) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerBar}>
          <PressableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconBtn}><Feather name="arrow-left" size={24} color={colors.textMuted} /></PressableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {error ? <Text style={styles.body}>{apiError(error).message}</Text> : <LoadingAnimation />}
        </View>
      </SafeAreaView>
    );
  }

  const weighted = t.weighting.balanceTeams || t.weighting.buildToFinale;
  const mine = meId ? myTeam(t, meId) : null;
  const next = meId ? myNextMatch(t, meId) : null;
  const tabs: { value: Tab; label: string }[] = t.format === 'none'
    ? [{ value: 'teams', label: 'Teams' }]
    : [{ value: 'matches', label: 'Matches' }, { value: 'table', label: t.format === 'roundRobin' ? 'Standings' : 'Bracket' }, { value: 'teams', label: t.mode === 'singles' ? 'Players' : 'Teams' }];
  const current = tabs.some((x) => x.value === tab) ? tab : tabs[0].value;
  const pressMatch = (m: TMatch) => {
    if (meId && canReport(t, m, meId)) setOpen(m);
  };

  const MatchRow = ({ m }: { m: TMatch }) => {
    const mineHere = !!mine && m.slots.some((s) => s.team === mine.key);
    const reportable = !!meId && canReport(t, m, meId);
    const status = m.status === 'done' ? resultLine(t, m)
      : m.status === 'bye' ? 'Bye'
      : m.status === 'waiting' ? 'Waiting on earlier matches'
      : reportable ? 'Tap to enter the result' : 'Up next';
    return (
      <PressableOpacity onPress={() => pressMatch(m)} disabled={!reportable} style={[styles.card, { marginBottom: 8 }, mineHere && { borderColor: colors.brand }]}>
        <Text style={styles.cardTitle} numberOfLines={2}>{matchTitle(t, m, meId)}</Text>
        <Text style={[styles.hint, m.status === 'done' && { color: colors.textSecondary, fontWeight: '600' }]}>{status}</Text>
      </PressableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <PressableOpacity accessibilityLabel="Go back" onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={24} color={colors.textMuted} />
        </PressableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{t.format === 'none' ? 'Teams' : 'Results'}</Text>
        {t.canManage ? (
          <PressableOpacity accessibilityLabel="Event options" onPress={() => setMenu(true)} style={styles.iconBtn}>
            <Feather name="more-horizontal" size={22} color={colors.textMuted} />
          </PressableOpacity>
        ) : <View style={styles.iconBtn} />}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.brand} />}>
        <Text style={styles.hint}>{FORMAT_LABEL[t.format]} · {t.teams.length} {t.mode === 'singles' ? 'players' : 'teams'}</Text>

        {t.status === 'finished' && t.champion && (
          <View style={[styles.card, { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: '#F59E0B' }]}>
            <Feather name="award" size={26} color="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={styles.hint}>Champion</Text>
              <Text style={[styles.cardTitle, { fontSize: 18 }]}>{teamLabel(t, t.champion, meId)}</Text>
            </View>
          </View>
        )}

        {(mine || next) && t.format !== 'none' && t.status !== 'finished' && (
          <View style={[styles.card, { marginTop: 12 }]}>
            {mine && t.mode === 'teams' && <Text style={styles.body}>You're on <Text style={{ fontWeight: '800' }}>{teamLabel(t, mine.key)}</Text></Text>}
            <Text style={[styles.body, { marginTop: mine && t.mode === 'teams' ? 4 : 0 }]}>
              {next ? <>Your next match: <Text style={{ fontWeight: '800' }}>{matchTitle(t, next, meId)}</Text></> : 'No match waiting for you right now.'}
            </Text>
            {next && meId && canReport(t, next, meId) && (
              <PressableOpacity onPress={() => setOpen(next)} style={{ marginTop: 8 }}>
                <Text style={styles.action}>Enter result</Text>
              </PressableOpacity>
            )}
          </View>
        )}

        {tabs.length > 1 && <View style={{ marginTop: 16 }}><Segmented value={current} onChange={setTab} options={tabs} /></View>}

        {current === 'matches' && roundsOf(t).map((section) => (
          <View key={section.key}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            {section.matches.map((m) => <MatchRow key={m.id} m={m} />)}
          </View>
        ))}

        {current === 'table' && t.format === 'roundRobin' && t.standings && (
          <View style={[styles.card, { marginTop: 16, paddingVertical: 6 }]}>
            <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
              <Text style={[styles.hint, { flex: 1, marginTop: 0 }]}>{t.mode === 'singles' ? 'Player' : 'Team'}</Text>
              {['W', 'L', 'T', 'Pts', ...(t.resultType === 'points' ? ['+/-'] : [])].map((h) => <Text key={h} style={[styles.hint, { width: 40, textAlign: 'right', marginTop: 0 }]}>{h}</Text>)}
            </View>
            {t.standings.map((r, i) => (
              <View key={r.team} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={[styles.body, { flex: 1, fontWeight: mine?.key === r.team ? '800' : '500' }]} numberOfLines={1}>{i + 1}. {teamLabel(t, r.team, meId)}</Text>
                {[r.wins, r.losses, r.ties, r.score, ...(t.resultType === 'points' ? [r.pointDiff] : [])].map((v, j) => (
                  <Text key={j} style={[styles.body, { width: 40, textAlign: 'right' }]}>{v}</Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {current === 'table' && t.format !== 'roundRobin' && <BracketView tournament={t} meId={meId} onPressMatch={pressMatch} />}

        {current === 'teams' && (
          <View style={{ marginTop: 16 }}>
            {[...t.teams].sort((a, b) => a.seed - b.seed).map((team, i) => (
              <View key={team.key} style={[styles.card, { marginBottom: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.teamDot, { backgroundColor: TEAM_COLORS[i % TEAM_COLORS.length] }]} />
                  <Text style={[styles.cardTitle, { flex: 1 }]}>{teamLabel(t, team.key, meId)}</Text>
                  {t.canManage && t.format !== 'none' && <Text style={styles.hint}>Seed {team.seed}</Text>}
                </View>
                {t.mode === 'teams' && <Text style={styles.hint}>{team.players.map((p) => playerLabel(t, p, meId)).join(', ')}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {open && <ResultSheet tournament={t} match={open} meId={meId} onClose={() => setOpen(null)} onSubmit={report} />}

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <PressableOpacity activeOpacity={1} onPress={() => setMenu(false)} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', padding: 16 }}>
          <View style={[styles.card, { paddingVertical: 4 }]}>
            {[
              { label: 'Update players', sub: 'Rebuild from who is In now', icon: 'refresh-cw', run: doUpdate, show: true },
              { label: 'Randomize', sub: 'Shuffle the match order', icon: 'shuffle', run: doRandomize, show: !weighted && t.format !== 'none' },
              { label: 'Edit setup', sub: 'Format, teams, ranking', icon: 'sliders', run: () => router.push({ pathname: '/tournament-setup/[meetupId]', params: { meetupId: t.meetup, groupId: t.group, tournamentId: t._id! } }), show: true },
              { label: 'Delete event', sub: undefined, icon: 'trash-2', run: doDelete, show: true },
            ].filter((x) => x.show).map((x) => (
              <PressableOpacity key={x.label} onPress={() => { setMenu(false); x.run(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                <Feather name={x.icon as any} size={18} color={x.label.startsWith('Delete') ? colors.danger : colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, x.label.startsWith('Delete') && { color: colors.danger }]}>{x.label}</Text>
                  {x.sub ? <Text style={styles.optionSub}>{x.sub}</Text> : null}
                </View>
              </PressableOpacity>
            ))}
          </View>
        </PressableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
