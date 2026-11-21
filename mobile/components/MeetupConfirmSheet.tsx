import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { BringPicker, BringReview } from '@/components/rsvp-confirm/BringPicker';
import { RidePicker, RideReview } from '@/components/rsvp-confirm/RidePicker';
import { QuestionFields, QuestionsReview } from '@/components/rsvp-confirm/QuestionFields';
import { useApiClient, meetupApi, Meetup } from '@/utils/api';
import { memberName, rideBody, type RideRole } from '@/utils/assignments';
import { answerFor, MAX_ANSWER_LENGTH } from '@/utils/questions';
import { confirmTabsFor, TAB_LABELS, type ConfirmTab } from '@/utils/confirmTabs';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';

const TAB_ICONS: Record<ConfirmTab, keyof typeof Feather.glyphMap> = {
  bring: 'shopping-bag',
  rides: 'truck',
  questions: 'help-circle',
};

interface Props {
  visible: boolean;
  meetup: Meetup;
  /** The signed-in user. */
  currentUserId: string;
  onClose: () => void;
  /** 'edit' (default): pick your own items, ride and answers. 'review': read-only look at `subject`'s. */
  mode?: 'edit' | 'review';
  /** Whose picks a review shows (defaults to the signed-in user). */
  subject?: { id: string; name: string };
  /** Called with the server's updated meetup after a save. */
  onUpdated?: (meetup: Meetup) => void;
  /** Called when a save failed because the data was out of date (an item was just taken). */
  onStale?: () => void;
  /** Review only: link to this person's other actions (message, remind, RSVP, ...). */
  onMoreOptions?: () => void;
}

/**
 * Everything a meetup asks of someone who's going — Stuff to bring, Rides, Questions (only the
 * ones it uses, in that order) — as tabs. The lit tab is the one shown; Next walks to the
 * following tab and the last tab's Submit saves every tab together.
 */
export default function MeetupConfirmSheet({
  visible, meetup, currentUserId, onClose, mode = 'edit', subject, onUpdated, onStale, onMoreOptions,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const api = useApiClient();
  const review = mode === 'review';
  const userId = subject?.id ?? currentUserId;
  const questions = meetup.questions ?? [];

  const [tabIndex, setTabIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<RideRole | null>(null);
  const [seats, setSeats] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Start on the first tab, from the person's current picks, each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setTabIndex(0);
    setSelected((meetup.bringClaims ?? []).filter((c) => c.user === userId).map((c) => c.item));
    const mine = (meetup.rides ?? []).find((r) => r.user === userId);
    setRole(mine?.role ?? null);
    setSeats(mine?.role === 'driver' ? mine.seats : 0);
    const start: Record<string, string> = {};
    // An answer saved before the 70-character limit is cut so submitting again doesn't fail.
    for (const q of questions) start[q._id] = (answerFor(meetup, userId, q._id) ?? '').slice(0, MAX_ANSWER_LENGTH);
    setValues(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const tabs = confirmTabsFor(meetup, userId);
  if (tabs.length === 0) return null;
  const index = Math.min(tabIndex, tabs.length - 1);
  const tab = tabs[index];
  const isLast = index === tabs.length - 1;
  const missingRequired = !review && tabs.includes('questions')
    && questions.some((q) => q.required && !(values[q._id] ?? '').trim());

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const submit = async () => {
    setSaving(true);
    let latest: Meetup | null = null;
    try {
      if (tabs.includes('bring') || tabs.includes('rides')) {
        const body: Parameters<typeof meetupApi.setAssignments>[2] = {};
        if (tabs.includes('bring')) body.bring = selected;
        if (tabs.includes('rides')) body.ride = rideBody(role, seats);
        try {
          latest = (await meetupApi.setAssignments(api, meetup._id, body)).meetup ?? null;
        } catch (err: any) {
          const data = err.response?.data;
          if (data?.error === 'item_full') {
            setTabIndex(tabs.indexOf('bring'));
            onStale?.();
          }
          Alert.alert(data?.error === 'item_full' ? 'Already taken' : 'Could not save', data?.message || data?.error || 'Please try again.');
          return;
        }
      }
      if (tabs.includes('questions')) {
        try {
          const answers = questions.map((q) => ({ question: q._id, value: (values[q._id] ?? '').trim() }));
          latest = (await meetupApi.setAnswers(api, meetup._id, answers)).meetup ?? latest;
        } catch (err: any) {
          const data = err.response?.data;
          // Items and ride already saved still count.
          if (latest) onUpdated?.(latest);
          setTabIndex(tabs.indexOf('questions'));
          Alert.alert('Could not save your answers', data?.message || data?.error || 'Please try again.');
          return;
        }
      }
      if (latest) onUpdated?.(latest);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const isSelf = userId === currentUserId;
  const title = review && !isSelf ? (subject?.name || memberName(meetup, userId)) : meetup.name;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(34, insets.bottom + 16) }]}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <PressableOpacity accessibilityLabel="Close" onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </PressableOpacity>
          </View>

          <View style={styles.tabBar} accessibilityRole="tablist">
            {tabs.map((t, i) => {
              const active = i === index;
              return (
                <PressableOpacity
                  key={t}
                  testID={`confirm-tab-${t}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  haptic="select"
                  activeOpacity={0.8}
                  onPress={() => setTabIndex(i)}
                  style={[styles.tab, active && styles.tabActive]}
                >
                  <Feather name={TAB_ICONS[t]} size={14} color={active ? '#fff' : colors.textMuted} />
                  <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{TAB_LABELS[t]}</Text>
                  {t === 'questions' && missingRequired && !active && <View style={styles.tabDot} />}
                </PressableOpacity>
              );
            })}
          </View>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            <Animated.View key={tab} entering={FadeIn.duration(180)}>
              {tab === 'bring' && (review
                ? <BringReview meetup={meetup} userId={userId} isSelf={isSelf} />
                : <BringPicker meetup={meetup} userId={userId} selected={selected} onToggle={toggle} />)}
              {tab === 'rides' && (review
                ? <RideReview meetup={meetup} userId={userId} viewerId={currentUserId} />
                : <RidePicker role={role} seats={seats} onRole={setRole} onSeats={setSeats} />)}
              {tab === 'questions' && (review
                ? <QuestionsReview meetup={meetup} userId={userId} />
                : <QuestionFields questions={questions} values={values} onChange={(id, v) => setValues((cur) => ({ ...cur, [id]: v }))} />)}
            </Animated.View>
          </ScrollView>

          {!isLast ? (
            <PressableOpacity testID="confirm-next" onPress={() => setTabIndex(index + 1)} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>Next</Text>
              <Feather name="arrow-right" size={18} color="#fff" />
            </PressableOpacity>
          ) : review ? (
            <PressableOpacity testID="confirm-done" onPress={onClose} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>Done</Text>
            </PressableOpacity>
          ) : (
            <PressableOpacity
              testID="confirm-submit"
              onPress={submit}
              disabled={saving || missingRequired}
              style={[styles.primaryBtn, (saving || missingRequired) && { opacity: 0.5 }]}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Submit</Text>}
            </PressableOpacity>
          )}
          {isLast && missingRequired && <Text style={styles.reqHint}>Answer the questions marked * to submit.</Text>}
          {review ? (
            onMoreOptions && (
              <PressableOpacity onPress={onMoreOptions} style={styles.link}>
                <Text style={{ color: colors.brand, fontWeight: '700' }}>More options</Text>
              </PressableOpacity>
            )
          ) : (
            <PressableOpacity onPress={onClose} style={styles.link}>
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Not now</Text>
            </PressableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, flex: 1, paddingRight: 12 },
  tabBar: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 10 },
  // The lit tab: filled teal with a soft glow.
  tabActive: {
    backgroundColor: colors.accentTeal,
    shadowColor: colors.accentTeal, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.textMuted, flexShrink: 1 },
  tabTextActive: { color: '#fff' },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EA580C' },
  primaryBtn: { flexDirection: 'row', gap: 8, backgroundColor: colors.accentTeal, borderRadius: 14, alignItems: 'center', justifyContent: 'center', height: 52, marginTop: 16 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  reqHint: { textAlign: 'center', fontSize: 12, color: '#EA580C', marginTop: 8 },
  link: { alignItems: 'center', paddingTop: 12 },
});
