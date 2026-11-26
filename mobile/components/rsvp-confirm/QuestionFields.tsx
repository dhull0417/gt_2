import React, { useMemo } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import type { Meetup } from '@/utils/api';
import { answerFor, displayAnswer, MAX_ANSWER_LENGTH } from '@/utils/questions';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { makePickerStyles } from './styles';

type Question = NonNullable<Meetup['questions']>[number];

/** Inputs for a meetup's custom questions: text (with a 0/70 counter), yes/no, or one choice. */
export function QuestionFields({ questions, values, onChange }: {
  questions: Question[];
  values: Record<string, string>;
  onChange: (questionId: string, value: string) => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => makePickerStyles(colors), [colors]);
  return (
    <View>
      {questions.map((q) => {
        const value = values[q._id] ?? '';
        return (
          <View key={q._id} style={{ marginBottom: 18 }}>
            <Text style={styles.section}>
              {q.prompt}
              {q.required ? <Text style={{ color: '#EA580C' }}> *</Text> : null}
            </Text>
            {q.type === 'text' && (
              <>
                <TextInput
                  value={value}
                  onChangeText={(t) => onChange(q._id, t.slice(0, MAX_ANSWER_LENGTH))}
                  placeholder="Your answer"
                  placeholderTextColor={colors.textFaint}
                  maxLength={MAX_ANSWER_LENGTH}
                  multiline
                  style={styles.input}
                />
                <Text style={[styles.counter, value.length >= MAX_ANSWER_LENGTH && { color: '#EA580C' }]}>
                  {value.length}/{MAX_ANSWER_LENGTH}
                </Text>
              </>
            )}
            {q.type === 'yesno' && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {(['yes', 'no'] as const).map((v) => (
                  <PressableOpacity
                    key={v}
                    onPress={() => onChange(q._id, value === v ? '' : v)}
                    style={[styles.choiceBtn, value === v && styles.choiceBtnOn]}
                  >
                    <Text style={[styles.choiceText, value === v && { color: '#fff' }]}>{v === 'yes' ? 'Yes' : 'No'}</Text>
                  </PressableOpacity>
                ))}
              </View>
            )}
            {q.type === 'choice' && q.options.map((o) => {
              const on = value === o;
              return (
                <PressableOpacity key={o} onPress={() => onChange(q._id, on ? '' : o)} style={[styles.option, on && styles.optionOn]}>
                  <Feather name={on ? 'check-circle' : 'circle'} size={20} color={on ? colors.accentTeal : colors.textFaint} />
                  <Text style={styles.optionText}>{o}</Text>
                </PressableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/** Read-only: someone's answer to each question. */
export function QuestionsReview({ meetup, userId }: { meetup: Meetup; userId: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => makePickerStyles(colors), [colors]);
  return (
    <View>
      {(meetup.questions ?? []).map((q) => {
        const v = answerFor(meetup, userId, q._id);
        return (
          <View key={q._id} style={{ marginBottom: 16 }}>
            <Text style={styles.section}>{q.prompt}</Text>
            <Text style={v ? styles.answer : styles.empty}>{v ? displayAnswer(q.type, v) : 'No answer'}</Text>
          </View>
        );
      })}
    </View>
  );
}
