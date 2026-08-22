import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useApiClient, placesApi, PlaceSuggestion, PlaceDetails } from '@/utils/api';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

// For a business/venue result, Google returns the venue name (details.name) separately
// from the street address. Plain address results often just repeat the address as the
// "name" too, so only treat it as a real venue name when it's not already part of the
// address — that's also what decides whether the bold name label renders at all.
const getVenueName = (details?: PlaceDetails): string | null => {
  const name = details?.name?.trim();
  const address = details?.address?.trim();
  if (!name || !address) return null;
  if (address.toLowerCase().includes(name.toLowerCase())) return null;
  return name;
};

const buildDisplayText = (details: PlaceDetails, fallback: string): string => {
  const venueName = getVenueName(details);
  const address = details.address?.trim();
  if (!address) return venueName || fallback;
  return venueName ? `${venueName}, ${address}` : address;
};

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
  // Tracks the exact query a search actually completed for, so "No matches" only
  // shows once a real search has come back empty for the current text — not on
  // initial open (before any search has run) and not right after picking a
  // suggestion (which also leaves the suggestion list empty).
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  // Only shown pre-decision (permission status 'undetermined') — once the user grants
  // or denies, this stays hidden for the rest of the session so we never nag.
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);

  const sessionTokenRef = useRef(Crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const venueName = getVenueName(resolvedPlace);

  const fetchCoords = async () => {
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      coordsRef.current = { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      // Bias is a nice-to-have — leave coordsRef null and search continues unbiased.
    }
  };

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status === Location.PermissionStatus.GRANTED) {
          fetchCoords();
        } else if (status === Location.PermissionStatus.UNDETERMINED) {
          setShowLocationPrompt(true);
        }
      })
      .catch(() => {
        // Location bias is a nice-to-have — e.g. the native module isn't in the
        // installed build yet (needs a fresh dev-client build after adding
        // expo-location). Search still works fine without it.
      });
  }, []);

  const handleEnableLocation = async () => {
    setShowLocationPrompt(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === Location.PermissionStatus.GRANTED) {
        fetchCoords();
      }
    } catch {
      // Same nice-to-have fallback as above.
    }
  };

  const handleChangeText = (value: string) => {
    setText(value);
    setResolvedPlace(undefined);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsLoading(false);
      setSearchedQuery(null);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      const thisRequestId = ++requestIdRef.current;
      try {
        const results = await placesApi.autocomplete(api, value.trim(), sessionTokenRef.current, coordsRef.current ?? undefined);
        if (thisRequestId !== requestIdRef.current) return; // a newer keystroke superseded this request
        setSuggestions(results);
        setSearchedQuery(value.trim());
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
      setSearchedQuery(null);
    } catch {
      // Fall back to the suggestion's plain text if the details lookup fails —
      // the field still gets a reasonable value instead of appearing broken.
      setText(suggestion.mainText);
      setResolvedPlace(undefined);
      setSuggestions([]);
      setSearchedQuery(null);
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
        <Text style={styles.headerTitle}>Set Location</Text>
        <TouchableOpacity
          onPress={() => onDone(resolvedPlace ? buildDisplayText(resolvedPlace, text) : text, resolvedPlace)}
          style={styles.doneButton}
          activeOpacity={0.7}
        >
            <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.inputBox}>
        <FontAwesome5 name="search-location" solid size={18} color="#4A90E2" style={styles.inputIcon} />
        <View style={{ flex: 1 }}>
          {!!venueName && <Text style={styles.venueName}>{venueName}</Text>}
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#C4C9D4"
            value={text}
            onChangeText={handleChangeText}
            autoFocus
            selectTextOnFocus
            multiline
          />
        </View>
        {(isLoading || isResolving) && <ActivityIndicator size="small" color="#9CA3AF" style={styles.inputSpinner} />}
      </View>

      {showLocationPrompt && (
        <View style={styles.locationPrompt}>
          <Feather name="map-pin" size={14} color="#4A90E2" style={{ marginRight: 8 }} />
          <Text style={styles.locationPromptText}>Use your location to see nearby places first</Text>
          <TouchableOpacity onPress={handleEnableLocation} activeOpacity={0.7}>
            <Text style={styles.locationPromptAction}>Enable</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowLocationPrompt(false)} activeOpacity={0.7} style={{ marginLeft: 14 }}>
            <Text style={styles.locationPromptDismiss}>Not now</Text>
          </TouchableOpacity>
        </View>
      )}

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
          ) : (searchedQuery !== null && searchedQuery === text.trim()) ? (
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
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backButton: { padding: 8 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#111827' },
  doneButton: { padding: 8 },
  doneText: { color: '#4A90E2', fontWeight: '800', fontSize: 15 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  inputIcon: { marginRight: 12, marginTop: 3 },
  inputSpinner: { marginLeft: 8, marginTop: 3 },
  venueName: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 2 },
  input: { fontSize: 16, color: '#111827', minHeight: 24, padding: 0 },
  locationPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F0F6FE',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  locationPromptText: { flex: 1, fontSize: 12.5, color: '#374151' },
  locationPromptAction: { fontSize: 13, fontWeight: '800', color: '#4A90E2' },
  locationPromptDismiss: { fontSize: 13, color: '#9CA3AF' },
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
