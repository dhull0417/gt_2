import React, { useEffect, useRef, useState } from 'react';
import { AppState, View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useApiClient, placesApi, PlaceSuggestion, PlaceDetails } from '@/utils/api';
import { reportPermissionStatus } from '@/utils/permissions';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

// Google repeats the address as "name" for plain address results, so only treat
// it as a real venue name when it's not already part of the address.
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
  // Tracks the query a search completed for, so "No matches" only shows after a
  // real search returns empty — not on initial open or right after picking a suggestion.
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  // Shown only pre-decision; hidden for the rest of the session once granted/denied.
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);

  const sessionTokenRef = useRef(Crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  // Mirrors `text` for fetchCoords, which resolves late and would close over stale state.
  const textRef = useRef(initialValue);

  const venueName = getVenueName(resolvedPlace);

  const runSearch = async (query: string) => {
    const thisRequestId = ++requestIdRef.current;
    setIsLoading(true);
    try {
      const results = await placesApi.autocomplete(api, query, sessionTokenRef.current, coordsRef.current ?? undefined);
      if (thisRequestId !== requestIdRef.current) return; // a newer keystroke superseded this request
      setSuggestions(results);
      setSearchedQuery(query);
    } catch {
      if (thisRequestId !== requestIdRef.current) return;
      setSuggestions([]);
    } finally {
      if (thisRequestId === requestIdRef.current) setIsLoading(false);
    }
  };

  const fetchCoords = async () => {
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      coordsRef.current = { lat: position.coords.latitude, lng: position.coords.longitude };
      // Coords just landed; re-run any pending query so results aren't stale until the next keystroke.
      const pending = textRef.current.trim();
      if (pending.length >= MIN_QUERY_LENGTH) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        runSearch(pending);
      }
    } catch {
      // Bias is a nice-to-have — leave coordsRef null and search continues unbiased.
    }
  };

  const checkPermissionAndFetchCoords = () => {
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => {
        if (status === Location.PermissionStatus.GRANTED) {
          setShowLocationPrompt(false);
          fetchCoords();
        } else if (status === Location.PermissionStatus.UNDETERMINED) {
          setShowLocationPrompt(true);
        }
      })
      .catch(() => {
        // Nice-to-have — e.g. native module missing until next dev-client build; search still works.
      });
  };

  useEffect(() => {
    checkPermissionAndFetchCoords();

    // If permission is granted via OS Settings instead of our button, this panel never
    // sees the change on its own — recheck on foreground to pick up coords.
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && coordsRef.current === null) {
        checkPermissionAndFetchCoords();
      }
    });
    return () => subscription.remove();
  }, []);

  const handleEnableLocation = async () => {
    setShowLocationPrompt(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      reportPermissionStatus(api, { location: status as 'granted' | 'denied' | 'undetermined' });
      if (status === Location.PermissionStatus.GRANTED) {
        fetchCoords();
      }
    } catch {
      // Same nice-to-have fallback as above.
    }
  };

  const handleChangeText = (value: string) => {
    setText(value);
    textRef.current = value;
    setResolvedPlace(undefined);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsLoading(false);
      setSearchedQuery(null);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
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
      // Fall back to the suggestion's plain text if details lookup fails.
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

      {showLocationPrompt && (
        <View style={styles.locationOverlay}>
          <View style={styles.locationCard}>
            <View style={styles.locationIconWrap}>
              <Feather name="map-pin" size={22} color="#4A90E2" />
            </View>
            <Text style={styles.locationTitle}>Use Your Location?</Text>
            <Text style={styles.locationBullet}>•  See nearby places first</Text>
            <Text style={styles.locationBullet}>•  Skip typing your city or area</Text>
            <TouchableOpacity onPress={handleEnableLocation} style={styles.locationEnableButton} activeOpacity={0.8}>
              <Text style={styles.locationEnableText}>Enable Location</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowLocationPrompt(false)} activeOpacity={0.7}>
              <Text style={styles.locationDismissText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  locationOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,24,39,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  locationCard: {
    width: '100%',
    maxWidth: 300,
    backgroundColor: 'white',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  locationIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EAF2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  locationTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 10 },
  locationBullet: { fontSize: 13, color: '#4B5563', alignSelf: 'flex-start', marginBottom: 4 },
  locationEnableButton: {
    marginTop: 14,
    backgroundColor: '#4A90E2',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  locationEnableText: { color: 'white', fontWeight: '800', fontSize: 15 },
  locationDismissText: { marginTop: 12, fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
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
