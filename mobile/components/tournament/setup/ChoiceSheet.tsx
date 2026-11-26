// Pick one option from a short list (Format, Per match, Results as). Picking applies and closes.
import React from 'react';
import { OptionRow, SettingSheet } from '@/components/tournament/ui';

export interface Choice<T> { value: T; label: string; sub?: string; disabled?: boolean; note?: string }

export default function ChoiceSheet<T extends string | number>({ visible, title, value, options, onPick, onClose }: {
  visible: boolean; title: string; value: T; options: Choice<T>[]; onPick: (v: T) => void; onClose: () => void;
}) {
  return (
    <SettingSheet visible={visible} title={title} onClose={onClose}>
      {options.map((o) => (
        <OptionRow key={String(o.value)} label={o.label} sub={o.disabled && o.note ? o.note : o.sub}
          selected={o.value === value} disabled={o.disabled}
          onPress={() => { onPick(o.value); onClose(); }} />
      ))}
    </SettingSheet>
  );
}
