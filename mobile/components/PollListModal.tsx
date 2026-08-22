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
    // When set, the modal opens straight into that poll's vote/results screen
    // instead of the list — used by callers that already know which poll they
    // want (e.g. the group chat's next-event bar).
    initialPollId?: string;
}

const voterIds = (option: PollOption): string[] =>
    option.voters.map(v => (typeof v === 'string' ? v : v._id));

const PollListModal = ({ visible, onClose, groupId, currentUserId, canManage, initialPollId }: PollListModalProps) => {
    const { data: polls, isLoading } = useGetPolls(groupId);
    const { mutateAsync: votePoll, isPending: isVoting } = useVotePoll();
    const { mutateAsync: cancelPoll, isPending: isCancelling } = useCancelPoll();

    const [selectedPollId, setSelectedPollId] = useState<string | null>(null);
    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);

    // Re-sync to the caller's requested poll (or back to the list) each time the
    // modal opens, rather than persisting whatever was selected last time.
    useEffect(() => {
        if (visible) setSelectedPollId(initialPollId ?? null);
    }, [visible, initialPollId]);

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
                        const isActive = poll.status === 'active';
                        return (
                            <TouchableOpacity key={poll._id} style={styles.pollRow} onPress={() => openPoll(poll)} activeOpacity={0.7}>
                                <View style={[styles.pollIconChip, isActive ? styles.pollIconChipActive : styles.pollIconChipEnded]}>
                                    <Feather name="bar-chart-2" size={18} color={isActive ? '#4A90E2' : '#9CA3AF'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.pollRowPrompt} numberOfLines={2}>
                                        {poll.prompt}
                                    </Text>
                                    <View style={styles.pollRowMetaRow}>
                                        {isActive && <View style={styles.activeDot} />}
                                        <Text style={styles.pollRowMeta}>
                                            {isActive
                                                ? `Expires ${DateTime.fromISO(poll.expiresAt).toFormat('MMM d, h:mm a')}`
                                                : `Ended ${DateTime.fromISO(poll.expiresAt).toFormat('MMM d, h:mm a')}`}
                                        </Text>
                                    </View>
                                </View>
                                {isActive && !hasVoted && (
                                    <View style={styles.newBadge}>
                                        <Text style={styles.newBadgeText}>New</Text>
                                    </View>
                                )}
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
                    <Text style={styles.modalHeaderTitle}>{isExpired ? 'Results' : 'Vote'}</Text>
                    <TouchableOpacity onPress={onClose}>
                        <Feather name="x" size={24} color="#374151" />
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={styles.detailStatusRow}>
                        <View style={[styles.detailIconChip, isExpired ? styles.pollIconChipEnded : styles.pollIconChipActive]}>
                            <Feather name={isExpired ? 'check-circle' : 'bar-chart-2'} size={16} color={isExpired ? '#9CA3AF' : '#4A90E2'} />
                        </View>
                        <Text style={styles.detailStatusText}>
                            {isExpired
                                ? `Ended ${DateTime.fromISO(selectedPoll.expiresAt).toFormat('MMM d, h:mm a')}`
                                : `Expires ${DateTime.fromISO(selectedPoll.expiresAt).toFormat('MMM d, h:mm a')}`}
                        </Text>
                    </View>

                    <Text style={styles.detailPrompt}>{selectedPoll.prompt}</Text>

                    {selectedPoll.options.map(option => {
                        const count = voterIds(option).length;
                        const isSelected = selectedOptionIds.includes(option._id);
                        const isWinner = isExpired && maxVotes > 0 && count === maxVotes;
                        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

                        if (isExpired) {
                            return (
                                <View key={option._id} style={[styles.resultRow, isWinner && styles.resultRowWinner]}>
                                    <View style={[styles.resultFill, { width: `${pct}%` }, isWinner && styles.resultFillWinner]} />
                                    <View style={styles.resultRowContent}>
                                        <View style={styles.resultTextRow}>
                                            {isWinner && <Feather name="award" size={14} color="#4A90E2" style={{ marginRight: 6 }} />}
                                            <Text style={[styles.resultText, isWinner && styles.resultTextWinner]} numberOfLines={2}>
                                                {option.text}
                                            </Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[styles.resultCount, isWinner && styles.resultTextWinner]}>{count}</Text>
                                            <Text style={[styles.resultPct, isWinner && styles.resultPctWinner]}>{pct}%</Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        }

                        return (
                            <TouchableOpacity
                                key={option._id}
                                style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                                onPress={() => toggleOption(selectedPoll, option._id)}
                                activeOpacity={0.7}
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
                                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option.text}</Text>
                                <Text style={styles.optionCount}>{count}</Text>
                            </TouchableOpacity>
                        );
                    })}

                    {isExpired && (
                        <View style={styles.totalVotesPill}>
                            <Feather name="users" size={12} color="#6B7280" />
                            <Text style={styles.totalVotesText}>{totalVotes} total vote{totalVotes === 1 ? '' : 's'}</Text>
                        </View>
                    )}

                    {canManage && !isExpired && (
                        <TouchableOpacity onPress={() => handleCancelPoll(selectedPoll)} disabled={isCancelling} style={styles.cancelPollBtn} activeOpacity={0.7}>
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
    modalContent: { flex: 1, backgroundColor: '#F9FAFB', padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalHeaderTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
    emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 15 },

    pollRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6',
        padding: 14, marginBottom: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
    },
    pollIconChip: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    pollIconChipActive: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
    pollIconChipEnded: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
    pollRowPrompt: { fontSize: 15, fontWeight: '800', color: '#111827' },
    pollRowMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
    activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4A90E2', marginRight: 6 },
    pollRowMeta: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
    newBadge: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
    newBadgeText: { color: '#4A90E2', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },

    detailStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    detailIconChip: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    detailStatusText: { fontSize: 12, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
    detailPrompt: { fontSize: 22, fontWeight: '900', color: '#111827', marginBottom: 20, letterSpacing: -0.3 },

    optionRow: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
        paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10,
    },
    optionRowSelected: { borderColor: '#4A90E2', backgroundColor: '#EEF6FF' },
    optionText: { fontSize: 15, color: '#374151', fontWeight: '600', flex: 1 },
    optionTextSelected: { color: '#1F2937', fontWeight: '700' },
    optionCount: { fontSize: 15, color: '#9CA3AF', fontWeight: '700', marginLeft: 12 },

    resultRow: {
        borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB', marginBottom: 10, overflow: 'hidden', position: 'relative',
    },
    resultRowWinner: { borderColor: '#4A90E2', borderWidth: 2 },
    resultFill: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: '#EFF6FF' },
    resultFillWinner: { backgroundColor: '#DBEAFE' },
    resultRowContent: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 16,
    },
    resultTextRow: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 },
    resultText: { fontSize: 15, color: '#374151', fontWeight: '600', flexShrink: 1 },
    resultCount: { fontSize: 15, color: '#374151', fontWeight: '900' },
    resultPct: { fontSize: 11, color: '#9CA3AF', fontWeight: '700', marginTop: 1 },
    resultPctWinner: { color: '#4A90E2' },
    resultTextWinner: { color: '#1D4ED8', fontWeight: '900' },

    totalVotesPill: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        alignSelf: 'center', backgroundColor: '#F3F4F6', borderRadius: 100,
        paddingHorizontal: 12, paddingVertical: 6, marginTop: 10, marginBottom: 20,
    },
    totalVotesText: { color: '#6B7280', fontSize: 12, fontWeight: '700' },

    cancelPollBtn: {
        height: 48, borderRadius: 14, borderWidth: 2, borderColor: '#EF4444', backgroundColor: '#FEF2F2',
        alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    },
    cancelPollText: { color: '#EF4444', fontWeight: '900', fontSize: 12, textTransform: 'uppercase' },

    submitBtn: { backgroundColor: '#4A90E2', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 12 },
    submitBtnDisabled: { backgroundColor: '#C7D2FE' },
    submitBtnText: { color: 'white', fontWeight: '800', fontSize: 16 },
});

export default PollListModal;
