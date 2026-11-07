import React, { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { linkify, type LinkKind } from '@/utils/linkify';
import { copyLink, openLink } from '@/utils/openLink';

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor: string;
  numberOfLines?: number;
}

/**
 * Plain text with its web links, emails, phone numbers and addresses made tappable
 * (same detection as chat). Tap opens; long-press copies.
 */
export function LinkifiedText({ text, style, linkColor, numberOfLines }: Props) {
  const segments = useMemo(() => linkify(text), [text]);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, i) =>
        seg.kind === 'text' || !seg.value ? (
          seg.text
        ) : (
          <Text
            key={i}
            style={{ color: linkColor, textDecorationLine: 'underline', fontWeight: '500' }}
            onPress={() => openLink(seg.kind as LinkKind, seg.value!)}
            onLongPress={() => copyLink(seg.text)}
            accessibilityRole="link"
          >
            {seg.text}
          </Text>
        )
      )}
    </Text>
  );
}
