// TEMPORARY FEATURE — Report Generator
// TO REMOVE: delete this entire file + the 'report' entry in group-settings/[id].tsx (settingsOptions array + handleOptionPress case)

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { User } from '@/utils/api';

type SortCol = '_id' | 'firstName' | 'lastName';
type SortDir = 'asc' | 'desc';

const COL_ID = 220;
const COL_FIRST = 130;
const COL_LAST = 130;

const getVal = (member: User, col: SortCol): string => {
  const v = member[col];
  return typeof v === 'string' ? v.toLowerCase() : '';
};

const ReportGeneratorScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: group, isLoading } = useGetGroupDetails(id);

  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('firstName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleColPress = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const rows = useMemo(() => {
    const members = group?.members ?? [];
    const q = search.trim().toLowerCase();

    const filtered = q
      ? members.filter(
          m =>
            (m.firstName ?? '').toLowerCase().includes(q) ||
            (m.lastName ?? '').toLowerCase().includes(q)
        )
      : members;

    return [...filtered].sort((a, b) => {
      const aVal = getVal(a, sortCol);
      const bVal = getVal(b, sortCol);
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [group?.members, search, sortCol, sortDir]);

  const SortIndicator = ({ col }: { col: SortCol }) => {
    const active = sortCol === col;
    return (
      <Feather
        name={!active ? 'chevrons-up-down' : sortDir === 'asc' ? 'chevron-up' : 'chevron-down'}
        size={12}
        color={active ? '#4A90E2' : '#9CA3AF'}
        style={{ marginLeft: 4 }}
      />
    );
  };

  const HeaderCell = ({
    col,
    label,
    width,
  }: {
    col: SortCol;
    label: string;
    width: number;
  }) => (
    <TouchableOpacity
      style={[styles.cell, styles.headerCell, { width }]}
      onPress={() => handleColPress(col)}
      activeOpacity={0.7}
    >
      <Text style={styles.headerCellText}>{label}</Text>
      <SortIndicator col={col} />
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A90E2" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="x" size={28} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report Generator</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.searchWrapper}>
        <Feather name="search" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name"
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView style={{ flex: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={styles.tableHeaderRow}>
              <HeaderCell col="_id" label="User ID" width={COL_ID} />
              <HeaderCell col="firstName" label="First Name" width={COL_FIRST} />
              <HeaderCell col="lastName" label="Last Name" width={COL_LAST} />
            </View>

            {rows.length === 0 ? (
              <View style={[styles.dataRow, { width: COL_ID + COL_FIRST + COL_LAST }]}>
                <Text style={styles.emptyText}>No members match your search.</Text>
              </View>
            ) : (
              rows.map((member, i) => (
                <View key={member._id} style={[styles.dataRow, i % 2 === 1 && styles.dataRowAlt]}>
                  <Text
                    style={[styles.cell, styles.cellText, styles.idText, { width: COL_ID }]}
                    numberOfLines={1}
                  >
                    {member._id}
                  </Text>
                  <Text
                    style={[styles.cell, styles.cellText, { width: COL_FIRST }]}
                    numberOfLines={1}
                  >
                    {member.firstName ?? '—'}
                  </Text>
                  <Text
                    style={[styles.cell, styles.cellText, { width: COL_LAST }]}
                    numberOfLines={1}
                  >
                    {member.lastName ?? '—'}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerCell: { flexDirection: 'row', alignItems: 'center' },
  headerCellText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  cell: { paddingHorizontal: 14, paddingVertical: 12 },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: 'white',
  },
  dataRowAlt: { backgroundColor: '#F9FAFB' },
  cellText: { fontSize: 14, color: '#374151' },
  idText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    color: '#6B7280',
    fontSize: 12,
  },
  emptyText: { fontSize: 14, color: '#9CA3AF', padding: 20 },
});

export default ReportGeneratorScreen;
