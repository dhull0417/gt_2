import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { OptionRow, makeStyles } from '@/components/tournament/ui';
import { teamLabel } from '@/utils/tournament';
import type { Tournament, TMatch, ResultBody } from '@/utils/tournamentApi';

interface Props {
  tournament: Tournament;
  match: TMatch | null;
  meId?: string;
  onClose: () => void;
  onSubmit: (body: ResultBody) => Promise<string | null>; // returns an error message, or null when saved
}

/** Enter or fix one match's result: points, a winner (or tie), or finishing places. */
export default function ResultSheet({ tournament: t, match, meId, onClose, onSubmit }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const teams = useMemo(() => (match ? match.slots.map((s) => s.team).filter(Boolean) as string[] : []), [match]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [winner, setWinner] = useState<string | null | undefined>(undefined);
  const [order, setOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!match) return;
    setError(null);
    const r = [...(match.results ?? [])].sort((a, b) => a.place - b.place);
    setScores(Object.fromEntries(teams.map((k) => [k, String(r.find((x) => x.team === k)?.points ?? '')])));
    const firsts = r.filter((x) => x.place === 1);
    setWinner(r.length ? (firsts.length > 1 ? null : firsts[0].team) : undefined);
    setOrder(r.length ? r.map((x) => x.team) : teams);
  }, [match, teams]);

  if (!match) return null;
  const allowTie = t.format === 'roundRobin' && teams.length === 2;
  const move = (i: number, d: number) => setOrder((o) => {
    const n = [...o];
    const j = i + d;
    if (j < 0 || j >= n.length) return o;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });

  const submit = async () => {
    let body: ResultBody;
    if (t.resultType === 'points') {
      const parsed: Record<string, number> = {};
      for (const k of teams) {
        const v = Number(scores[k]);
        if (scores[k] === '' || !Number.isInteger(v) || v < 0 || v > 999) { setError('Enter a whole-number score for every team.'); return; }
        parsed[k] = v;
      }
      body = { scores: parsed };
    } else if (t.resultType === 'winLoss') {
      if (winner === undefined) { setError('Pick the winner.'); return; }
      body = { winner };
    } else {
      body = { order };
    }
    setSaving(true);
    setError(null);
    const msg = await onSubmit(body);
    setSaving(false);
    if (msg) setError(msg); else onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <PressableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, backgroundColor: colors.overlay }} accessibilityLabel="Close" />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 20 + insets.bottom }}>
          <Text style={styles.cardTitle}>{match.results.length ? 'Fix the result' : 'Enter the result'}</Text>
          {t.resultType === 'points' && teams.map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>{teamLabel(t, k, meId)}</Text>
              <TextInput value={scores[k] ?? ''} onChangeText={(v) => setScores((s) => ({ ...s, [k]: v.replace(/[^0-9]/g, '') }))}
                keyboardType="number-pad" maxLength={3} placeholder="0" placeholderTextColor={colors.placeholder}
                accessibilityLabel={`Score for ${teamLabel(t, k)}`}
                style={{ width: 70, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 8 }} />
            </View>
          ))}
          {t.resultType === 'winLoss' && (
            <View style={{ marginTop: 8 }}>
              {teams.map((k) => <OptionRow key={k} label={`${teamLabel(t, k, meId)} won`} selected={winner === k} onPress={() => setWinner(k)} />)}
              {allowTie && <OptionRow label="Tie" selected={winner === null} onPress={() => setWinner(null)} />}
            </View>
          )}
          {t.resultType === 'places' && (
            <View style={{ marginTop: 8 }}>
              {order.map((k, i) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                  <Text style={[styles.cardTitle, { width: 28 }]}>{i + 1}.</Text>
                  <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>{teamLabel(t, k, meId)}</Text>
                  <PressableOpacity accessibilityLabel="Move up" disabled={i === 0} onPress={() => move(i, -1)} style={[styles.stepBtn, i === 0 && { opacity: 0.3 }]}>
                    <Feather name="arrow-up" size={18} color={colors.textPrimary} />
                  </PressableOpacity>
                  <PressableOpacity accessibilityLabel="Move down" disabled={i === order.length - 1} onPress={() => move(i, 1)} style={[styles.stepBtn, i === order.length - 1 && { opacity: 0.3 }]}>
                    <Feather name="arrow-down" size={18} color={colors.textPrimary} />
                  </PressableOpacity>
                </View>
              ))}
            </View>
          )}
          {error && <Text style={styles.errorText}>{error}</Text>}
          <PressableOpacity onPress={submit} disabled={saving} style={[styles.primaryBtn, saving && { opacity: 0.6 }]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save result</Text>}
          </PressableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
