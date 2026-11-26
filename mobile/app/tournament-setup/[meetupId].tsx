// Set up (or edit) Teams & Tourneys for a meetup. Owners and moderators, Premium.
// Spec: docs/specs/2026-11-10-team-tournaments-design.md
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Alert, ActivityIndicator, Modal, BackHandler, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useApiClient, User } from '@/utils/api';
import { useGetMeetups } from '@/hooks/useGetMeetups';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { UpgradeButton } from '@/components/UpgradeButton';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useToast } from '@/contexts/ToastContext';
import RankingEditor, { RankItem } from '@/components/tournament/RankingEditor';
import BracketView from '@/components/tournament/BracketView';
import { Segmented, OptionRow, Reveal, Glide, GroupCard, SummaryRow, makeStyles, TEAM_COLORS } from '@/components/tournament/ui';
import ChoiceSheet from '@/components/tournament/setup/ChoiceSheet';
import TeamSplitSheet from '@/components/tournament/setup/TeamSplitSheet';
import PlayersSheet from '@/components/tournament/setup/PlayersSheet';
import RankingSheet from '@/components/tournament/setup/RankingSheet';
import { tournamentApi, apiError, Tournament, TournamentConfig, SetupBody, TMode, TFormat } from '@/utils/tournamentApi';
import {
  allowedFormats, allowedResultTypes, fixConfig, playerLabel, matchTitle, roundsOf, RESULT_LABEL,
  splitSummary, perMatchSummary, playersSummary, rankingSummary, rankingToggledOn, TEAMS_ONLY, NOT_FOR_JUST_TEAMS,
} from '@/utils/tournament';

const FORMAT_TILES: { value: TFormat; label: string; sub: string; icon: string }[] = [
  { value: 'roundRobin', label: 'Round robin', sub: 'Everyone plays everyone', icon: 'refresh-cw' },
  { value: 'single', label: 'Single elim', sub: 'Out after one loss', icon: 'git-merge' },
  { value: 'double', label: 'Double elim', sub: 'Out after two losses', icon: 'git-pull-request' },
  { value: 'none', label: 'Just teams', sub: 'Teams, no matches', icon: 'users' },
];

const idOf = (u: User | string) => (typeof u === 'string' ? u : u._id);
const nameOf = (u?: Partial<User>) => (u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Member' : 'Member');

type Draft = { name: string | null; players: string[] }[];

export default function TournamentSetupScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { meetupId, groupId, tournamentId } = useLocalSearchParams<{ meetupId: string; groupId: string; tournamentId?: string }>();
  const router = useRouter();
  const api = useApiClient();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: meetups } = useGetMeetups();
  const meetup = useMemo(() => meetups?.find((m) => m._id === meetupId) ?? null, [meetups, meetupId]);
  const { data: group } = useGetGroupDetails(groupId);
  const { data: lists = [], refetch: refetchLists } = useQuery({
    queryKey: ['rankingLists', groupId],
    queryFn: () => tournamentApi.listRankings(api, groupId!),
    enabled: !!groupId && group?.isPremium === true,
  });
  const { data: existing } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => tournamentApi.get(api, tournamentId!),
    enabled: !!tournamentId,
  });

  const [config, setConfigRaw] = useState<TournamentConfig>({
    mode: 'teams', format: 'roundRobin', teamsPerMatch: 2, resultType: 'points', balanceTeams: false, buildToFinale: false,
  });
  const [splitBy, setSplitBy] = useState<'size' | 'count'>('size');
  const [splitValue, setSplitValue] = useState(2);
  const [extraPlayers, setExtraPlayers] = useState<string[]>([]);
  const [weightOn, setWeightOn] = useState(false);
  const [listId, setListId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [newListName, setNewListName] = useState('');
  const [preview, setPreview] = useState<Tournament | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seedOrder, setSeedOrder] = useState<number[] | null>(null);
  const [rngSeed, setRngSeed] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [allRounds, setAllRounds] = useState(false);
  const [editing, setEditing] = useState<null | 'players' | 'teams'>(null);
  const [sheet, setSheet] = useState<null | 'split' | 'format' | 'perMatch' | 'results' | 'players' | 'ranking'>(null);
  const closeSheet = () => setSheet(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'preview' | 'save' | 'list'>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(!tournamentId);

  const setConfig = (patch: Partial<TournamentConfig>) => { setConfigRaw((c) => fixConfig({ ...c, ...patch })); setDirty(true); };
  const clearPreview = () => { setPreview(null); setDraft(null); setSeedOrder(null); setRngSeed(null); setAllRounds(false); };

  // Edit mode: start from the saved event.
  useEffect(() => {
    if (!existing || loaded) return;
    setConfigRaw(fixConfig({
      mode: existing.mode, format: existing.format, teamsPerMatch: existing.teamsPerMatch, resultType: existing.resultType,
      balanceTeams: existing.weighting.balanceTeams, buildToFinale: existing.weighting.buildToFinale,
    }));
    if (existing.teamCount) { setSplitBy('count'); setSplitValue(existing.teamCount); }
    else if (existing.teamSize) { setSplitBy('size'); setSplitValue(existing.teamSize); }
    setExtraPlayers(existing.extraPlayers.map(String));
    setWeightOn(existing.weighting.balanceTeams || existing.weighting.buildToFinale);
    setListId(existing.weighting.listId);
    setOrder(existing.weighting.order.map(String));
    setLoaded(true);
  }, [existing, loaded]);

  const members = useMemo(() => new Map((meetup?.members ?? []).map((m) => [m._id, m])), [meetup]);
  const inIds = useMemo(() => (meetup?.in ?? []).map(idOf), [meetup]);
  const undecidedIds = useMemo(() => (meetup?.undecided ?? []).filter((id) => members.has(id)), [meetup, members]);
  const guestCount = (uid: string) => {
    const clerkId = members.get(uid)?.clerkId;
    return (meetup?.guests ?? []).find((g) => g.userId === clerkId)?.count ?? 0;
  };
  const playerUserIds = useMemo(() => [...inIds, ...extraPlayers.filter((id) => !inIds.includes(id))], [inIds, extraPlayers]);
  const totalPlayers = playerUserIds.length + inIds.reduce((n, id) => n + guestCount(id), 0);

  // The ranking always lists exactly the people playing: saved order first, then everyone else.
  const rankedIds = useMemo(() => {
    const listed = order.filter((id) => playerUserIds.includes(id));
    const rest = playerUserIds.filter((id) => !listed.includes(id)).sort((a, b) => nameOf(members.get(a)).localeCompare(nameOf(members.get(b))));
    return [...listed, ...rest];
  }, [order, playerUserIds, members]);

  // Any settings change invalidates a preview.
  useEffect(() => { clearPreview(); }, [config, splitBy, splitValue, extraPlayers, weightOn, order]);

  const pickList = (id: string | null) => {
    setListId(id);
    const l = lists.find((x) => x._id === id);
    if (l) setOrder(l.order);
    setDirty(true);
  };

  const body = (withDraft: boolean): SetupBody => {
    const c: TournamentConfig = { ...config, balanceTeams: weightOn && config.balanceTeams, buildToFinale: weightOn && config.buildToFinale };
    if (c.mode === 'teams') { if (splitBy === 'size') c.teamSize = splitValue; else c.teamCount = splitValue; }
    return {
      config: c,
      extraPlayers,
      ranking: weightOn ? rankedIds : undefined,
      rankingListId: weightOn ? listId : null,
      ...(withDraft && draft ? { teams: draft, seedOrder: seedOrder ?? undefined, rngSeed: rngSeed ?? undefined } : {}),
    };
  };

  const runPreview = async () => {
    if (!meetupId) return;
    setBusy('preview');
    setError(null);
    try {
      const seed = Math.floor(Math.random() * 2 ** 31);
      const t = await tournamentApi.preview(api, meetupId, { ...body(false), rngSeed: seed });
      setRngSeed(seed);
      setPreview(t);
      setDraft(t.teams.map((tm) => ({ name: tm.name, players: tm.players.map((p) => p.key) })));
      setSeedOrder(t.teams.map((tm, i) => ({ i, seed: tm.seed })).sort((a, b) => a.seed - b.seed).map((x) => x.i));
    } catch (err) {
      setError(apiError(err).message);
    } finally {
      setBusy(null);
    }
  };

  /** Re-draw the previewed matches after a hand edit, so the preview always matches what Start creates. */
  const refreshPreview = async (nextDraft: Draft, nextSeeds: number[] | null) => {
    if (!meetupId) return;
    setRefreshing(true);
    try {
      const t = await tournamentApi.preview(api, meetupId, { ...body(false), teams: nextDraft, seedOrder: nextSeeds ?? undefined, rngSeed: rngSeed ?? undefined });
      setPreview(t);
    } catch (err) {
      setError(apiError(err).message);
    } finally {
      setRefreshing(false);
    }
  };

  const save = async (confirm = false) => {
    if (!meetupId) return;
    setBusy('save');
    setError(null);
    try {
      const b = { ...body(true), confirm };
      const t = tournamentId ? await tournamentApi.edit(api, tournamentId, b) : await tournamentApi.create(api, meetupId, b);
      queryClient.setQueryData(['tournament', t._id], t);
      queryClient.invalidateQueries({ queryKey: ['tournamentForMeetup', meetupId] });
      setDirty(false);
      if (tournamentId) router.back();
      else router.replace({ pathname: '/tournament/[id]', params: { id: t._id! } });
    } catch (err) {
      const e = apiError(err);
      if (e.code === 'results_exist') {
        Alert.alert('Start over?', 'This clears the recorded results.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear and save', style: 'destructive', onPress: () => save(true) },
        ]);
      } else setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const saveList = async () => {
    const name = newListName.trim();
    if (!name || !groupId) return;
    setBusy('list');
    try {
      const { list } = await tournamentApi.saveRanking(api, groupId, name, rankedIds);
      await refetchLists();
      setListId(list._id);
      setNewListName('');
      toast.success(`Saved "${name}"`);
    } catch (err) {
      Alert.alert('Could not save the ranking', apiError(err).message);
    } finally {
      setBusy(null);
    }
  };

  const leave = useCallback(() => {
    if (!dirty) { router.back(); return true; }
    Alert.alert('Discard changes?', undefined, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
    return true;
  }, [dirty, router]);
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', leave);
    return () => sub.remove();
  }, [leave]));

  if (!meetup || !group || !loaded) {
    return <SafeAreaView style={styles.safe}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><LoadingAnimation /></View></SafeAreaView>;
  }

  const isPremium = group.isPremium === true;
  const formats = allowedFormats(config.mode, config.teamsPerMatch);
  const resultTypes = allowedResultTypes(config.format, config.teamsPerMatch);
  const formatLabel = FORMAT_TILES.find((f) => f.value === config.format)?.label ?? '';
  const listName = lists.find((l) => l._id === listId)?.name ?? null;
  const rankItems: RankItem[] = rankedIds.map((id) => ({ id, label: nameOf(members.get(id)), picture: members.get(id)?.profilePicture }));
  const previewTeams = preview && draft ? draft : null;
  const labelOfKey = (key: string) => {
    if (!preview) return key;
    const p = preview.teams.flatMap((t) => t.players).find((x) => x.key === key);
    return p ? playerLabel(preview, p) : 'Player';
  };
  // The previewed event with the names typed in so far (no server call per keystroke).
  const shown: Tournament | null = preview && draft
    ? { ...preview, teams: preview.teams.map((t, i) => ({ ...t, name: config.mode === 'teams' ? ((draft[i]?.name ?? '').trim() || `Team ${i + 1}`) : t.name })) }
    : null;
  const rounds = shown && config.format === 'roundRobin' ? roundsOf(shown) : [];
  const teamName = (i: number) => (draft?.[i]?.name ?? '') || (config.mode === 'teams' ? `Team ${i + 1}` : draft?.[i]?.players.map(labelOfKey).join(' & ') ?? '');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <PressableOpacity accessibilityLabel="Go back" onPress={leave} style={styles.iconBtn}>
          <Feather name="arrow-left" size={24} color={colors.textMuted} />
        </PressableOpacity>
        <Text style={styles.headerTitle}>{tournamentId ? 'Edit Teams & Tourneys' : 'Teams & Tourneys'}</Text>
        <View style={styles.iconBtn} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.body}>{meetup.name} · {totalPlayers} {totalPlayers === 1 ? 'player' : 'players'}</Text>

          {!isPremium ? (
            <View style={[styles.card, { marginTop: 16 }]}>
              <Text style={styles.cardTitle}>Premium</Text>
              <Text style={styles.hint}>Teams & Tourneys require the group owner to have Premium.</Text>
              <UpgradeButton owner={group.owner} />
            </View>
          ) : (
            <>
              <View style={{ marginTop: 16 }}>
                <Segmented<TMode> value={config.mode} onChange={(mode) => setConfig({ mode })}
                  options={[{ value: 'teams', label: 'Teams' }, { value: 'singles', label: 'Singles' }]} />
              </View>

              <Text style={styles.sectionLabel}>Match</Text>
              <GroupCard>
                <SummaryRow label="Team split" value={splitSummary(splitBy, splitValue)} onPress={() => setSheet('split')}
                  disabledReason={config.mode === 'singles' ? TEAMS_ONLY : undefined} />
                <SummaryRow label="Format" value={formatLabel} onPress={() => setSheet('format')} />
                <SummaryRow label="Per match" value={perMatchSummary(config.mode, config.teamsPerMatch)} onPress={() => setSheet('perMatch')}
                  disabledReason={config.format === 'none' ? NOT_FOR_JUST_TEAMS : undefined} />
                <SummaryRow label="Results as" value={RESULT_LABEL[config.resultType]} onPress={() => setSheet('results')}
                  disabledReason={resultTypes.length === 0 ? NOT_FOR_JUST_TEAMS : undefined} />
              </GroupCard>

              <Text style={styles.sectionLabel}>Players</Text>
              <GroupCard>
                <SummaryRow label="Players" value={playersSummary(totalPlayers)} onPress={() => setSheet('players')} />
                <SummaryRow label="Strength ranking" onPress={() => setSheet('ranking')}
                  value={rankingSummary(weightOn, listName, config.mode === 'teams' && config.balanceTeams, config.format !== 'none' && config.buildToFinale)} />
              </GroupCard>

              {previewTeams && (
                <Reveal>
                  <Text style={styles.sectionLabel}>Preview</Text>
                  <Text style={[styles.hint, { marginTop: 0, marginBottom: 8 }]}>Tap a player to move them. Rename teams here.</Text>
                  {previewTeams.map((t, i) => (
                    <View key={i} style={[styles.card, { marginBottom: 8 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.teamDot, { backgroundColor: TEAM_COLORS[i % TEAM_COLORS.length] }]} />
                        {config.mode === 'teams' ? (
                          <TextInput value={t.name ?? ''} placeholder={`Team ${i + 1}`} placeholderTextColor={colors.placeholder} maxLength={24}
                            onChangeText={(v) => setDraft((d) => d!.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                            style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary, paddingVertical: 2 }} />
                        ) : <Text style={[styles.cardTitle, { flex: 1 }]}>{teamName(i)}</Text>}
                        {seedOrder && <Text style={styles.hint}>#{seedOrder.indexOf(i) + 1}</Text>}
                      </View>
                      {config.mode === 'teams' && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                          {t.players.map((k) => (
                            <PressableOpacity key={k} onPress={() => setMoving(k)} style={styles.chip}>
                              <Text style={styles.chipText}>{labelOfKey(k)}</Text>
                            </PressableOpacity>
                          ))}
                          {t.players.length === 0 && <Text style={styles.hint}>No one yet</Text>}
                        </View>
                      )}
                    </View>
                  ))}
                  {config.format !== 'none' && (
                    <PressableOpacity onPress={() => setEditing('teams')} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryText}>Order {config.mode === 'singles' ? 'players' : 'teams'} by strength</Text>
                    </PressableOpacity>
                  )}

                  {shown && config.format !== 'none' && (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[styles.sectionLabel, { flex: 1 }]}>{config.format === 'roundRobin' ? 'Schedule preview' : 'Bracket preview'}</Text>
                        {refreshing && <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: 12 }} />}
                      </View>
                      <View style={{ opacity: refreshing ? 0.5 : 1 }}>
                        {config.format === 'roundRobin' ? (
                          <>
                            <Text style={[styles.hint, { marginTop: 0, marginBottom: 8 }]}>
                              {shown.matches.length} matches in {rounds.length} rounds{config.buildToFinale && weightOn ? ', building to the top two' : ''}.
                            </Text>
                            {(allRounds ? rounds : rounds.slice(0, 3)).map((r) => (
                              <View key={r.key} style={[styles.card, { marginBottom: 8, paddingVertical: 10 }]}>
                                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textFaint, marginBottom: 4 }}>{r.title}</Text>
                                {r.matches.map((m) => (
                                  <Text key={m.id} style={[styles.body, { paddingVertical: 2 }]} numberOfLines={1}>{matchTitle(shown, m)}</Text>
                                ))}
                              </View>
                            ))}
                            {rounds.length > 3 && (
                              <PressableOpacity onPress={() => setAllRounds((v) => !v)} style={{ paddingVertical: 6 }}>
                                <Text style={[styles.action, { textAlign: 'center', fontSize: 14 }]}>
                                  {allRounds ? 'Show less' : `Show all ${rounds.length} rounds`}
                                </Text>
                              </PressableOpacity>
                            )}
                          </>
                        ) : (
                          <BracketView tournament={shown} onPressMatch={() => {}} />
                        )}
                      </View>
                    </>
                  )}
                </Reveal>
              )}

              <Glide>
              {error && <Text style={styles.errorText}>{error}</Text>}
              <PressableOpacity onPress={runPreview} disabled={!!busy} style={styles.secondaryBtn}>
                {busy === 'preview' ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.secondaryText}>{previewTeams ? 'Shuffle the preview again' : 'Preview teams'}</Text>}
              </PressableOpacity>
              <PressableOpacity onPress={() => save(false)} disabled={!!busy} style={[styles.primaryBtn, !!busy && { opacity: 0.6 }]}>
                {busy === 'save' ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{tournamentId ? 'Save' : 'Start'}</Text>}
              </PressableOpacity>
              </Glide>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <TeamSplitSheet visible={sheet === 'split'} onClose={closeSheet} splitBy={splitBy} value={splitValue} totalPlayers={totalPlayers} ranked={weightOn}
        onSplitBy={(v) => { setSplitBy(v); setSplitValue(2); setDirty(true); }} onValue={(n) => { setSplitValue(n); setDirty(true); }} />
      <ChoiceSheet<TFormat> visible={sheet === 'format'} title="Format" value={config.format} onClose={closeSheet} onPick={(format) => setConfig({ format })}
        options={FORMAT_TILES.map((f) => ({ value: f.value, label: f.label, sub: f.sub, disabled: !formats.includes(f.value), note: f.value === 'none' ? 'Teams mode only' : 'Matches of 2 only' }))} />
      <ChoiceSheet<number> visible={sheet === 'perMatch'} title={`${config.mode === 'singles' ? 'Players' : 'Teams'} per match`} value={config.teamsPerMatch}
        onClose={closeSheet} onPick={(n) => setConfig({ teamsPerMatch: n as 2 | 3 | 4 })}
        options={[2, 3, 4].map((n) => ({ value: n, label: perMatchSummary(config.mode, n) }))} />
      <ChoiceSheet visible={sheet === 'results'} title="Record results as" value={config.resultType} onClose={closeSheet} onPick={(resultType) => setConfig({ resultType })}
        options={resultTypes.map((r) => ({ value: r, label: RESULT_LABEL[r] }))} />
      <PlayersSheet visible={sheet === 'players'} onClose={closeSheet}
        inRows={inIds.map((id) => ({ id, label: nameOf(members.get(id)), sub: guestCount(id) ? `+${guestCount(id)} guest${guestCount(id) > 1 ? 's' : ''}` : "I'm In" }))}
        undecided={undecidedIds.map((id) => ({ id, label: nameOf(members.get(id)) }))} extra={extraPlayers}
        onToggle={(id) => { setExtraPlayers((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])); setDirty(true); }} />
      <RankingSheet visible={sheet === 'ranking'} onClose={closeSheet} on={weightOn}
        onToggle={(v) => { setWeightOn(v); setDirty(true); if (v) { const patch = rankingToggledOn(config, config.mode); if (Object.keys(patch).length) setConfig(patch); } }}
        mode={config.mode} format={config.format} lists={lists} listId={listId} onPickList={pickList}
        preview={rankedIds.slice(0, 5).map((id, i) => `${i + 1}. ${nameOf(members.get(id))}`).join('  ') + (rankedIds.length > 5 ? ' …' : '')}
        count={rankedIds.length} onEditRanking={() => { setSheet(null); setEditing('players'); }}
        newListName={newListName} onNewListName={setNewListName} onSaveList={saveList} saving={busy === 'list'}
        balance={config.balanceTeams} finale={config.buildToFinale} onBalance={(v) => setConfig({ balanceTeams: v })} onFinale={(v) => setConfig({ buildToFinale: v })} />

      <RankingEditor
        visible={editing === 'players'}
        title="Strength ranking"
        items={rankItems}
        onCancel={() => { setEditing(null); setSheet('ranking'); }}
        onDone={(ids) => { setOrder(ids); setDirty(true); setEditing(null); setSheet('ranking'); }}
      />
      <RankingEditor
        visible={editing === 'teams'}
        title={config.mode === 'singles' ? 'Seed order' : 'Team order'}
        hint="Strongest first. This decides the bracket seeds and match order."
        items={(seedOrder ?? []).map((i) => ({ id: String(i), label: teamName(i), sub: draft?.[i]?.players.map(labelOfKey).join(', ') }))}
        onCancel={() => setEditing(null)}
        onDone={(ids) => { const next = ids.map(Number); setSeedOrder(next); setEditing(null); if (draft) refreshPreview(draft, next); }}
      />

      <Modal visible={!!moving} transparent animationType="fade" onRequestClose={() => setMoving(null)}>
        <PressableOpacity activeOpacity={1} onPress={() => setMoving(null)} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 30 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Move {moving ? labelOfKey(moving) : ''} to</Text>
            {(draft ?? []).map((t, i) => (
              <OptionRow key={i} label={teamName(i)} selected={!!moving && t.players.includes(moving)}
                onPress={() => {
                  if (!moving) return;
                  const next = draft!.map((x, j) => ({ ...x, players: j === i ? [...x.players.filter((k) => k !== moving), moving] : x.players.filter((k) => k !== moving) }));
                  setDraft(next);
                  setMoving(null);
                  refreshPreview(next, seedOrder);
                }} />
            ))}
          </View>
        </PressableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
