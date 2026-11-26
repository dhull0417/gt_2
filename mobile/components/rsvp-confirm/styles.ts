import { StyleSheet } from 'react-native';
import type { ThemeColors } from '@/constants/theme';

/** Styles shared by the bring / ride / question pickers and their read-only views. */
export const makePickerStyles = (colors: ThemeColors) => StyleSheet.create({
  section: { fontSize: 14, fontWeight: '800', color: colors.textSecondary, marginBottom: 10 },
  hint: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  empty: { fontSize: 15, color: colors.textFaint, paddingVertical: 6 },
  answer: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, marginBottom: 8 },
  optionOn: { borderColor: colors.accentTeal, backgroundColor: 'rgba(79,209,197,0.16)' },
  optionOff: { backgroundColor: colors.surfaceAlt },
  optionText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  optionSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  roleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.accentTeal, backgroundColor: colors.surface },
  roleBtnOn: { backgroundColor: colors.accentTeal },
  roleText: { fontSize: 15, fontWeight: '700', color: colors.accentTeal },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSoft, borderWidth: 1.5, borderColor: '#93C5FD', alignItems: 'center', justifyContent: 'center' },
  stepBtnOff: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  seatCount: { fontSize: 28, fontWeight: '900', color: colors.textPrimary, minWidth: 36, textAlign: 'center' },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: colors.textPrimary, minHeight: 48, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontSize: 12, color: colors.textFaint, marginTop: 4 },
  choiceBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.accentTeal },
  choiceBtnOn: { backgroundColor: colors.accentTeal },
  choiceText: { fontSize: 15, fontWeight: '700', color: colors.accentTeal },
});
