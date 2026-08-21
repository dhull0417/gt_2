import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useApiClient, placesApi, PlaceSuggestion, PlaceDetails } from '@/utils/api';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

interface LocationSearchPanelProps {
  initialValue: string;
  placeholder?: string;
  onDone: (text: string, place?: PlaceDetails) => void;
  onCancel: () => void;
}

const LocationSearchPanel = ({ initialValue, placeholder, onDone, onCancel }: LocationSearchPanelProps) => {
  const api = useApiClient();

  const [text, setText] = useState(initialValue);
  const [resolvedPlace, setResolvedPlace] = useState<PlaceDetails | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const sessionTokenRef = useRef(Crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const handleChangeText = (value: string) => {
    setText(value);
    setResolvedPlace(undefined);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      const thisRequestId = ++requestIdRef.current;
      try {
        const results = await placesApi.autocomplete(api, value.trim(), sessionTokenRef.current);
        if (thisRequestId !== requestIdRef.current) return; // a newer keystroke superseded this request
        setSuggestions(results);
      } catch {
        if (thisRequestId !== requestIdRef.current) return;
        setSuggestions([]);
      } finally {
        if (thisRequestId === requestIdRef.current) setIsLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const handleSelectSuggestion = async (suggestion: PlaceSuggestion) => {
    setIsResolving(true);
    try {
      const details = await placesApi.getDetails(api, suggestion.placeId, sessionTokenRef.current);
      setText(details.address || suggestion.mainText);
      setResolvedPlace(details);
      setSuggestions([]);
    } catch {
      // Fall back to the suggestion's plain text if the details lookup fails —
      // the field still gets a reasonable value instead of appearing broken.
      setText(suggestion.mainText);
      setResolvedPlace(undefined);
      setSuggestions([]);
    } finally {
      setIsResolving(false);
      sessionTokenRef.current = Crypto.randomUUID(); // start a fresh billing session for any further searching
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backButton} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color="#374151" />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#C4C9D4"
          value={text}
          onChangeText={handleChangeText}
          autoFocus
          selectTextOnFocus
        />
        {(isLoading || isResolving) && <ActivityIndicator size="small" color="#9CA3AF" style={{ marginRight: 12 }} />}
        <TouchableOpacity onPress={() => onDone(text, resolvedPlace)} activeOpacity={0.7}>
            <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={suggestions}
        keyExtractor={item => item.placeId}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => handleSelectSuggestion(item)} activeOpacity={0.6}>
            <Feather name="map-pin" size={16} color="#9CA3AF" style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.mainText} numberOfLines={1}>{item.mainText}</Text>
              {!!item.secondaryText && <Text style={styles.secondaryText} numberOfLines={1}>{item.secondaryText}</Text>}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centerState}><ActivityIndicator color="#9CA3AF" /></View>
          ) : text.trim().length >= MIN_QUERY_LENGTH ? (
            <View style={styles.centerState}><Text style={styles.emptyText}>No matches for "{text.trim()}"</Text></View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: { padding: 6, marginRight: 4 },
  input: { flex: 1, fontSize: 16, color: '#111827', paddingVertical: 6, paddingHorizontal: 8 },
  doneText: { color: '#4A90E2', fontWeight: '800', fontSize: 15, paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  mainText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  secondaryText: { fontSize: 13, color: '#9CA3AF', marginTop: 1 },
  centerState: { paddingTop: 40, alignItems: 'center' },
  emptyText: { color: '#9CA3AF', fontStyle: 'italic' },
});

export default LocationSearchPanel;
