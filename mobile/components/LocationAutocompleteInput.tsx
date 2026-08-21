import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useApiClient, placesApi, PlaceSuggestion, PlaceDetails } from '@/utils/api';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

type Variant = 'wizard' | 'card' | 'modal';

interface VariantStyle {
  container: ViewStyle;
  input: TextStyle;
  iconName: keyof typeof Feather.glyphMap | null;
  iconSize: number;
  iconColor: string;
  iconMarginRight: number;
}

const VARIANT_STYLES: Record<Variant, VariantStyle> = {
  // create-group/index.tsx, AddMeetupWizard.tsx
  wizard: {
    container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12 },
    input: { flex: 1, fontSize: 15, color: '#374151' },
    iconName: 'map-pin',
    iconSize: 16,
    iconColor: '#9CA3AF',
    iconMarginRight: 8,
  },
  // MeetupDetailModal.tsx edit modal
  card: {
    container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, paddingHorizontal: 16, height: 56, borderWidth: 1, borderColor: '#E5E7EB' },
    input: { flex: 1, marginLeft: 12, fontSize: 16, color: '#374151' },
    iconName: 'map-pin',
    iconSize: 18,
    iconColor: '#4A90E2',
    iconMarginRight: 0,
  },
  // group-settings/[id].tsx edit-location modal
  modal: {
    container: { backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 4 },
    input: { fontSize: 16, color: '#111827', paddingVertical: 12 },
    iconName: null,
    iconSize: 0,
    iconColor: 'transparent',
    iconMarginRight: 0,
  },
};

interface LocationAutocompleteInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (place: PlaceDetails) => void;
  placeholder?: string;
  variant?: Variant;
  autoFocus?: boolean;
  selectTextOnFocus?: boolean;
}

const LocationAutocompleteInput = ({
  value,
  onChangeText,
  onSelect,
  placeholder,
  variant = 'wizard',
  autoFocus,
  selectTextOnFocus,
}: LocationAutocompleteInputProps) => {
  const api = useApiClient();
  const style = VARIANT_STYLES[variant];

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const sessionTokenRef = useRef<string>(Crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChangeText = (text: string) => {
    onChangeText(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      const thisRequestId = ++requestIdRef.current;
      try {
        const results = await placesApi.autocomplete(api, text.trim(), sessionTokenRef.current);
        if (thisRequestId !== requestIdRef.current) return; // a newer keystroke superseded this request
        setSuggestions(results);
        setIsOpen(results.length > 0);
      } catch {
        if (thisRequestId !== requestIdRef.current) return;
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        if (thisRequestId === requestIdRef.current) setIsLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    setIsOpen(false);
    setIsResolving(true);
    try {
      const details = await placesApi.getDetails(api, suggestion.placeId, sessionTokenRef.current);
      onChangeText(details.address || suggestion.mainText);
      onSelect(details);
    } catch {
      // Fall back to the suggestion's plain text if the details lookup fails —
      // the field still gets a reasonable value instead of appearing broken.
      onChangeText(suggestion.mainText);
    } finally {
      setIsResolving(false);
      sessionTokenRef.current = Crypto.randomUUID(); // start a fresh billing session for the next search
    }
  };

  return (
    <View>
      <View style={style.container}>
        {style.iconName && (
          <Feather name={style.iconName} size={style.iconSize} color={style.iconColor} style={{ marginRight: style.iconMarginRight }} />
        )}
        <TextInput
          style={style.input}
          placeholder={placeholder}
          placeholderTextColor="#C4C9D4"
          value={value}
          onChangeText={handleChangeText}
          onFocus={() => setIsOpen(suggestions.length > 0)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          autoFocus={autoFocus}
          selectTextOnFocus={selectTextOnFocus}
        />
        {(isLoading || isResolving) && <ActivityIndicator size="small" color="#9CA3AF" />}
      </View>

      {isOpen && (
        <View style={styles.dropdown}>
          {suggestions.map((s, index) => (
            <TouchableOpacity
              key={s.placeId}
              style={[styles.row, index === suggestions.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => handleSelect(s)}
              activeOpacity={0.6}
            >
              <Feather name="map-pin" size={14} color="#9CA3AF" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.mainText} numberOfLines={1}>{s.mainText}</Text>
                {!!s.secondaryText && <Text style={styles.secondaryText} numberOfLines={1}>{s.secondaryText}</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 50,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  mainText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  secondaryText: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
});

export default LocationAutocompleteInput;
