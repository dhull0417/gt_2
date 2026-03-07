import React, { useState } from 'react';
import { 
    View, 
    Text, 
    TextInput, 
    TouchableOpacity, 
    StyleSheet, 
    Alert, 
    FlatList, 
    Keyboard, 
    ActivityIndicator,
    Share
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSearchUsers } from '@/hooks/useSearchUsers';
import { useInviteUser } from '@/hooks/useInviteUser';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { User } from '@/utils/api';

const AddMembersScreen = () => {
    const { id: groupId } = useLocalSearchParams<{ id: string }>();

    const [searchQuery, setSearchQuery] = useState("");
    const { data: searchResults, isLoading: isSearchingUsers } = useSearchUsers(searchQuery);
    const { data: groupDetails } = useGetGroupDetails(groupId);
    const { mutate: inviteUser, isPending: isInviting } = useInviteUser();

    const handleInvite = (userToInvite: User) => {
        if (!groupId) return;

        if (groupDetails?.members.some(m => m._id === userToInvite._id)) {
            Alert.alert("Already a Member", `${userToInvite.firstName} is already in this group.`);
            return;
        }

        inviteUser({ groupId, userIdToInvite: userToInvite._id }, {
            onSuccess: (data) => {
                Alert.alert("Success", data.message);
                setSearchQuery('');
                Keyboard.dismiss();
            },
        });
    };

    const handleShareInvite = async () => {
        if (!groupDetails) return;
        try {
            await Share.share({
                message: `Join my group "${groupDetails.name}" on GroupThat! Download the app to get started: https://dhull0417.github.io/groupthat-testing/`,
            });
        } catch (error) {
            console.error("Share error:", error);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <View style={styles.searchBox}>
                <Feather name="search" size={20} color="#9CA3AF" />
                <TextInput 
                    style={styles.searchInput} 
                    placeholder="Search by username..." 
                    value={searchQuery} 
                    onChangeText={setSearchQuery} 
                    autoCapitalize="none"
                />
            </View>

            <View style={{ flex: 1 }}>
                {isSearchingUsers ? (
                    <ActivityIndicator size="small" color="#4A90E2" style={{ marginTop: 20 }} />
                ) : (
                    <FlatList 
                        data={searchResults || []} 
                        keyExtractor={item => item._id} 
                        renderItem={({ item }) => (
                            <View style={styles.resultRow}>
                                <View>
                                    <Text style={styles.resultName}>{item.firstName} {item.lastName}</Text>
                                    <Text style={styles.resultUsername}>@{item.username}</Text>
                                </View>
                                <TouchableOpacity 
                                    style={styles.inviteButton} 
                                    onPress={() => handleInvite(item)}
                                    disabled={isInviting}
                                >
                                    <Text style={styles.inviteButtonText}>Invite</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        ListEmptyComponent={
                            searchQuery.length > 2 && !isSearchingUsers ? (
                                <Text style={styles.emptyText}>No users found for "{searchQuery}"</Text>
                            ) : null
                        }
                    />
                )}
            </View>

            <TouchableOpacity style={styles.shareLinkBtn} onPress={handleShareInvite}>
                <Feather name="share-2" size={20} color="#4A90E2" />
                <Text style={styles.shareLinkText}>Share Invite Link</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB', padding: 24 },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: 'white', borderRadius: 12, marginBottom: 8 },
    resultName: { fontSize: 16, fontWeight: '600', color: '#374151' },
    resultUsername: { fontSize: 14, color: '#6B7280' },
    inviteButton: { backgroundColor: '#EEF2FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    inviteButtonText: { color: '#4A90E2', fontWeight: 'bold' },
    emptyText: { textAlign: 'center', marginTop: 32, color: '#6B7280', fontSize: 16 },
    shareLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#F5F7FF', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#4A90E2', marginTop: 16 },
    shareLinkText: { color: '#4A90E2', fontWeight: '700', fontSize: 16, marginLeft: 10 },
});

export default AddMembersScreen;