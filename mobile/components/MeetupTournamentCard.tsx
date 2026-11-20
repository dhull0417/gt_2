// "Teams & Tourneys" on the meetup sheet once an event exists: your team, your next match and
// opens Results when tapped. Setting one up is in the meetup's ⋯ sheet. Replaces the old Teams card (team splits are now an event format).
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useApiClient, Meetup } from '@/utils/api';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { makeStyles } from '@/components/tournament/ui';
import { tournamentApi } from '@/utils/tournamentApi';
import { myTeam, myNextMatch, teamLabel, matchTitle, FORMAT_LABEL } from '@/utils/tournament';

interface Props {
  meetup: Meetup;
  currentUserId: string;
  canManage: boolean;
  /** Close the meetup sheet, then go to this route. */
  onOpen: (href: { pathname: string; params: Record<string, string> }) => void;
}

export default function MeetupTournamentCard({ meetup, currentUserId, onOpen }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const api = useApiClient();
  const { data: t } = useQuery({
    queryKey: ['tournamentForMeetup', meetup._id],
    queryFn: () => tournamentApi.getForMeetup(api, meetup._id),
    // Always look: a running event stays visible (and scorable) even if Premium lapses.
    staleTime: 15000,
  });

  // No event yet: "Set up Teams & Tourneys" lives in the meetup's ⋯ sheet now.
  if (!t) return null;

  const mine = myTeam(t, currentUserId);
  const next = myNextMatch(t, currentUserId);
  return (
    <PressableOpacity onPress={() => onOpen({ pathname: '/tournament/[id]', params: { id: t._id! } })}
      accessibilityRole="button" accessibilityLabel={t.format === 'none' ? 'See teams' : 'See results'}
      style={[styles.card, { marginTop: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name={t.status === 'finished' ? 'award' : 'users'} size={16} color={t.status === 'finished' ? '#F59E0B' : colors.textMuted} />
        <Text style={[styles.cardTitle, { flex: 1 }]}>{t.format === 'none' ? 'Teams' : 'Teams & Tourneys'}</Text>
        <Feather name="chevron-right" size={18} color={colors.textFaint} />
      </View>
      <Text style={styles.hint}>{FORMAT_LABEL[t.format]} · {t.teams.length} {t.mode === 'singles' ? 'players' : 'teams'}</Text>
      {t.status === 'finished' && t.champion
        ? <Text style={[styles.body, { marginTop: 8 }]}>Champion: <Text style={{ fontWeight: '800' }}>{teamLabel(t, t.champion, currentUserId)}</Text></Text>
        : (
          <>
            {mine && t.mode === 'teams' && <Text style={[styles.body, { marginTop: 8 }]}>You're on <Text style={{ fontWeight: '800' }}>{teamLabel(t, mine.key)}</Text></Text>}
            {next && <Text style={[styles.body, { marginTop: 4 }]}>Next: {matchTitle(t, next, currentUserId)}</Text>}
          </>
        )}
    </PressableOpacity>
  );
}
