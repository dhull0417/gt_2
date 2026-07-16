import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ActivityIndicator,
    ScrollView,
    Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { DateTime } from 'luxon';
import { Poll, PollOption } from '@/utils/api';
import { useGetPolls } from '@/hooks/useGetPolls';
import { useVotePoll } from '@/hooks/useVotePoll';
import { useCancelPoll } from '@/hooks/useCancelPoll';

interface PollListModalProps {
    visible: boolean;
    onClose: () => void;
    groupId: string;
    currentUserId: string;
    canManage: boolean;
}

const voterIds = (option: PollOption): string[] =>
    option.voters.map(v => (typeof v === 'string' ? v : v._id));

const PollListModal = ({ visible, onClose, groupId, currentUserId, canManage }: PollListModalProps) => {
    const { data: polls, isLoading } = useGetPolls(groupId);
    const { mutateAsync: votePoll, isPending: isVoting } = useVotePoll();
    const { mutateAsync: cancelPoll, isPending: isCancelling } = useCancelPoll();

    const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);

    const selectedPoll = polls?.find(p => p._id === selectedPollId) || null;

    useEffect(() => {
        if (!selectedPoll) return;
        const existing = selectedPoll.options
            .filter(opt => voterIds(opt).includes(currentUserId))
            .map(opt => opt._id);
        setSelectedOptionIds(existing);
    }, [selectedPollId]);

    const openPoll = (poll: Poll) => setSelectedPollId(poll._id);
    const backToList = () => setSelectedPollId(null);

    const toggleOption = (poll: Poll, optionId: string) => {
        if (poll.allowMultiple) {
            setSelectedOptionIds(prev =>
                prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]
            );
        } else {
            setSelectedOptionIds([optionId]);
        }
    };

    const handleSubmitVote = async () => {
        if (!selectedPoll || selectedOptionIds.length === 0) return;
        try {
            await votePoll({ pollId: selectedPoll._id, optionIds: selectedOptionIds, groupId });
        } catch {
            // Errors surfaced via the mutation's onError alert.
        }
    };

    const handleCancelPoll = (poll: Poll) => {
        Alert.alert('Cancel Poll', `Are you sure you want to cancel "${poll.prompt}"?`, [
            { text: 'No', style: 'cancel' },
            {
                text: 'Yes, Cancel',
                style: 'destructive',
                onPress: async () => {
                    await cancelPoll({ pollId: poll._id, groupId });
                    backToList();
                },
            },
        ]);
    };

    const renderList = () => (
        <>
            <View style={styles.modalHeader}>
                <View style={{ width: 24 }} />
                <Text style={styles.modalHeaderTitle}>Polls</Text>
                <TouchableOpacity onPress={onClose}>
                    <Feather name="x" size={24} color="#374151" />
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <ActivityIndicator color="#4A90E2" style={{ marginTop: 40 }} />
            ) : !polls || polls.length === 0 ? (
                <Text style={styles.emptyText}>No polls yet.</Text>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                    {polls.map(poll => {
                        const hasVoted = poll.options.some(opt => voterIds(opt).includes(currentUserId));
                        return (
                            <TouchableOpacity key={poll._id} style={styles.pollRow} onPress={() => openPoll(poll)}>
                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={[styles.pollRowPrompt, poll.status !== 'active' && styles.pollRowPromptExpired]}
                                        numberOfLines={2}
                                    >
                                        {poll.prompt}
                                    </Text>
                                    <Text style={[styles.pollRowMeta, poll.status !== 'active' && styles.pollRowMetaExpired]}>
                                        {poll.status === 'active'
                                            ? `Active · Expires ${DateTime.fromISO(poll.expiresAt).toFormat('MMM d, h:mm a')}`
                                            : `Expired ${DateTime.fromISO(poll.expiresAt).toFormat('MMM d, h:mm a')}`}
                                    </Text>
                                </View>
                                {poll.status === 'active' && !hasVoted && <View style={styles.unansweredDot} />}
                                <Feather name="chevron-right" size={18} color="#9CA3AF" />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </>
    );

    const renderDetail = () => {
        if (!selectedPoll) return null;
        const isExpired = selectedPoll.status !== 'active';
        const totalVotes = selectedPoll.options.reduce((sum, opt) => sum + voterIds(opt).length, 0);
        const maxVotes = Math.max(...selectedPoll.options.map(opt => voterIds(opt).length));

        return (
            <>
                <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={backToList}>
                        <Feather name="chevron-left" size={24} color="#374151" />
                    </TouchableOpacity>
                    <Text style={styles.modalHeaderTitle}>{isExpired ? 'Complete' : 'Vote'}</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Feather name="x" size={24} color="#374151" />
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                    <Text style={styles.detailPrompt}>{selectedPoll.prompt}</Text>

                    {selectedPoll.options.map(option => {
                        const count = voterIds(option).length;
                        const isSelected = selectedOptionIds.includes(option._id);
                        const isWinner = isExpired && maxVotes > 0 && count === maxVotes;

                        if (isExpired) {
                            return (
                                <View key={option._id} style={[styles.resultRow, isWinner && styles.resultRowWinner]}>
                                    <Text style={[styles.resultText, isWinner && styles.resultTextWinner]}>
                                        {option.text}
                                    </Text>
                                    <Text style={[styles.resultCount, isWinner && styles.resultTextWinner]}>
                                        {count}
                                    </Text>
                                </View>
                            );
                        }

                        return (
                            <TouchableOpacity
                                key={option._id}
                                style={styles.optionRow}
                                onPress={() => toggleOption(selectedPoll, option._id)}
                            >
                                <Feather
                                    name={
                                        selectedPoll.allowMultiple
                                            ? (isSelected ? 'check-square' : 'square')
                                            : (isSelected ? 'check-circle' : 'circle')
                                    }
                                    size={20}
                                    color={isSelected ? '#4A90E2' : '#9CA3AF'}
                                />
                                <Text style={styles.optionText}>{option.text}</Text>
                                <Text style={styles.optionCount}>{count}</Text>
                            </TouchableOpacity>
                        );
                    })}

                    {isExpired && (
                        <Text style={styles.totalVotesText}>{totalVotes} total vote{totalVotes === 1 ? '' : 's'}</Text>
                    )}

                    {canManage && !isExpired && (
                        <TouchableOpacity onPress={() => handleCancelPoll(selectedPoll)} disabled={isCancelling}>
                            <Text style={styles.cancelPollText}>Cancel Poll</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>

                {!isExpired && (
                    <TouchableOpacity
                        onPress={handleSubmitVote}
                        disabled={selectedOptionIds.length === 0 || isVoting}
                        style={[styles.submitBtn, (selectedOptionIds.length === 0 || isVoting) && styles.submitBtnDisabled]}
                    >
                        {isVoting ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Submit Vote</Text>}
                    </TouchableOpacity>
                )}
            </>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={styles.modalContent}>
                {selectedPoll ? renderDetail() : renderList()}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContent: { flex: 1, backgroundColor: 'white', padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 15 },

    pollRow: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: '#F9FAFB', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB',
        padding: 16, marginBottom: 10,
    },
    pollRowPrompt: { fontSize: 15, fontWeight: '700', color: '#111827' },
    pollRowPromptExpired: { color: '#EF4444' },
    pollRowMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
    pollRowMetaExpired: { color: '#EF4444' },
    unansweredDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },

    detailPrompt: { fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 20 },

    optionRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
        paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10,
    },
    optionText: { fontSize: 15, color: '#374151', flex: 1 },
    optionCount: { fontSize: 15, color: '#9CA3AF', fontWeight: '700', marginLeft: 12 },

    resultRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
        paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10,
    },
    resultRowWinner: { borderColor: '#4A90E2', borderWidth: 2, backgroundColor: '#F5F9FF' },
    resultText: { fontSize: 15, color: '#374151', flex: 1 },
    resultCount: { fontSize: 15, color: '#374151', fontWeight: '700', marginLeft: 12 },
    resultTextWinner: { color: '#4A90E2', fontWeight: '900' },
    totalVotesText: { textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginTop: 8, marginBottom: 20 },

    cancelPollText: { textAlign: 'center', color: '#EF4444', fontWeight: '700', fontSize: 14, marginTop: 12, marginBottom: 20 },

    submitBtn: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
    submitBtnDisabled: { backgroundColor: '#C7D2FE' },
    submitBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
});

export default PollListModal;
