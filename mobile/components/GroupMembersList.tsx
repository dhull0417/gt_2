import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { GroupDetails, User } from '@/utils/api';
import { getUserDisplayName } from '@/utils/groupDisplay';
import { isTimeoutActive } from '@/utils/chatTimeout';
import { isGroupManager, sortMembersByName } from '@/utils/groupDetailTiles';

interface Props {
    groupDetails: GroupDetails;
    currentUser: User;
    isRemovingMember: boolean;
    onRemoveMember: (memberIdToRemove: string) => void;
    onMemberPress?: (member: User) => void;
}

const idOf = (v: any): string | undefined => (typeof v === 'string' ? v : v?._id);

// Member grid split into "Owner & Moderators" and "Members", each A to Z. Used by the Members page
// and, inline, by DM details.
export const GroupMembersList = ({ groupDetails, currentUser, isRemovingMember, onRemoveMember, onMemberPress }: Props) => {
    const colors = useThemeColors();
    const isDM = !!groupDetails.isDM;
    const ownerId = idOf(groupDetails.owner);
    const isOwner = currentUser._id === ownerId;
    const canManage = isGroupManager(groupDetails as any, currentUser._id);
    const isMemberMod = (member: User) => (groupDetails.moderators ?? []).some((m: any) => idOf(m) === member._id);
    const isStaff = (member: User) => member._id === ownerId || isMemberMod(member);

    // Members currently timed out of the chat (sent to owners/moderators only).
    const timedOutIds = new Set(
        (groupDetails.chatTimeouts ?? []).filter((t) => isTimeoutActive(t, Date.now())).map((t) => t.userId)
    );

    const staffMembers = sortMembersByName(groupDetails.members.filter(isStaff));
    const regularMembers = sortMembersByName(groupDetails.members.filter(m => !isStaff(m)));

    const renderMemberTile = (member: User) => {
        const isMemberOwner = member._id === ownerId;
        const isMod = isMemberMod(member);
        const isSelf = member._id === currentUser._id;
        const canTap = !isDM && !isSelf && !!onMemberPress;
        const canRemove = !isDM && !isMemberOwner && (isOwner || (canManage && !isMod));

        const Wrapper: any = canTap ? PressableOpacity : View;
        const wrapperProps = canTap ? { onPress: () => onMemberPress!(member), activeOpacity: 0.7 } : {};

        return (
            <Wrapper key={member._id} style={styles.gridItem} {...wrapperProps}>
                <View style={styles.gridAvatarWrap}>
                    {member.profilePicture
                        ? <Image source={{ uri: member.profilePicture }} style={[styles.gridAvatar, { backgroundColor: colors.backgroundAlt }]} />
                        : (
                            <View style={[styles.gridAvatar, styles.gridAvatarPlaceholder, { backgroundColor: colors.backgroundAlt }]}>
                                <Feather name="user" size={22} color={colors.textFaint} />
                            </View>
                        )}
                    {isMemberOwner && (
                        <View style={[styles.roleBadge, styles.ownerRoleBadge, { borderColor: colors.surface }]}>
                            <Feather name="star" size={11} color="white" />
                        </View>
                    )}
                    {isMod && !isMemberOwner && (
                        <View style={[styles.roleBadge, styles.modRoleBadge, { borderColor: colors.surface }]}>
                            <Feather name="shield" size={11} color="white" />
                        </View>
                    )}
                    {timedOutIds.has(member._id) && (
                        // Only owners/moderators get timeout info from the server.
                        <View accessibilityLabel="Timed out of chat" style={[styles.timeoutBadge, { borderColor: colors.surface }]}>
                            <Feather name="clock" size={10} color="white" />
                        </View>
                    )}
                    {canRemove && (
                        <PressableOpacity accessibilityLabel="Remove"
                            style={[styles.removeBadge, { borderColor: colors.surface }]}
                            onPress={() => onRemoveMember(member._id)}
                            disabled={isRemovingMember}
                            // Part of the badge sits outside the avatar, where Android ignores taps; grow the
                            // tap area inward so a ~32 px target stays inside it.
                            hitSlop={{ top: 4, right: 4, bottom: 12, left: 12 }}
                        >
                            <Feather name="x" size={12} color="white" />
                        </PressableOpacity>
                    )}
                </View>
                <Text testID="member-name" style={[styles.gridName, { color: colors.textSecondary }]} numberOfLines={1}>{getUserDisplayName(member)}</Text>
            </Wrapper>
        );
    };

    return (
        <>
            {staffMembers.length > 0 && (
                <View testID="staff-section" style={styles.section}>
                    <View style={styles.sectionHeaderWrap}>
                        <Text style={[styles.sectionTitle, { color: '#7C3AED' }]}>Owner & Moderators — {staffMembers.length}</Text>
                        <View style={[styles.sectionHeaderLine, { backgroundColor: '#7C3AED' }]} />
                    </View>
                    <View style={styles.grid}>
                        {staffMembers.map(renderMemberTile)}
                    </View>
                </View>
            )}

            {regularMembers.length > 0 && (
                <View testID="members-section" style={styles.section}>
                    <View style={styles.sectionHeaderWrap}>
                        <Text style={[styles.sectionTitle, { color: colors.brand }]}>Members — {regularMembers.length}</Text>
                        <View style={[styles.sectionHeaderLine, { backgroundColor: colors.brand }]} />
                    </View>
                    <View style={styles.grid}>
                        {regularMembers.map(renderMemberTile)}
                    </View>
                </View>
            )}
        </>
    );
};

const styles = StyleSheet.create({
    section: { marginTop: 8, marginBottom: 24 },
    sectionHeaderWrap: { marginBottom: 16 },
    sectionTitle: { fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    sectionHeaderLine: { height: 3, borderRadius: 2, opacity: 0.85 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    gridItem: { width: '30%', alignItems: 'center' },
    gridAvatarWrap: { width: '100%', position: 'relative' },
    gridAvatar: { width: '100%', aspectRatio: 1, borderRadius: 14 },
    gridAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    gridName: { fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' },
    roleBadge: { position: 'absolute', top: -6, left: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    ownerRoleBadge: { backgroundColor: '#4F46E5' },
    modRoleBadge: { backgroundColor: '#6B7280' },
    timeoutBadge: { position: 'absolute', bottom: -4, left: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
    removeBadge: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});

export default GroupMembersList;
