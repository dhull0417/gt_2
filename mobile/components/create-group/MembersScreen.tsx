import { useMemo } from "react";
import { Alert, Share, Text, View } from "react-native";
import { StepDots } from "@/components/create-group/StepDots";
import { makeStyles } from "@/components/create-group/styles";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { groupApi, useApiClient } from "@/utils/api";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { buildInviteMessage } from '@/utils/inviteMessage';

export const MembersScreen = ({ groupId, groupName, onDone }: {
    groupId: string; groupName: string; onDone: () => void;
}) => {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    const api = useApiClient();
    const { data: inviteLinkData } = useQuery({
        queryKey: ['inviteLink', groupId],
        queryFn: () => groupApi.generateInviteLink(api, groupId),
        enabled: !!groupId,
        staleTime: 1000 * 60 * 5,
    });

    const handleShare = async () => {
        const inviteLink = inviteLinkData?.link;
        if (!inviteLink) {
            Alert.alert('Not Ready', 'The invite link is still loading. Please try again in a moment.');
            return;
        }
        try {
            await Share.share({
                message: buildInviteMessage({ groupName, link: inviteLink }),
            });
        } catch {}
    };

    return (
        <View style={s.screen}>
            <View style={s.screenHeader}>
                <View style={{ width: 36 }} />
                <StepDots total={4} current={3} />
                <View style={{ width: 36 }} />
            </View>
            <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 }}>
                <Text style={s.screenTitle}>Invite members</Text>
                <Text style={s.screenSub}>Invite your friends with an easy link</Text>
            </View>

            <PressableOpacity style={[s.shareBtn, { marginHorizontal: 24, marginBottom: 12 }]} onPress={handleShare}>
                <Feather name="share-2" size={16} color={colors.brand} />
                <Text style={s.shareBtnText}>Invite Friends</Text>
            </PressableOpacity>

            <View style={{ flex: 1, paddingHorizontal: 24 }}>
                <View style={s.multiScheduleInfoCard}>
                    <View style={s.multiScheduleInfoIcon}>
                        <Feather name="info" size={14} color="#fff" />
                    </View>
                    <Text style={s.multiScheduleInfoText}>
                        A group can have <Text style={{ fontWeight: "700" }}>multiple schedules</Text> for different types of meetups. Add more schedules to this group from {groupName ? `${groupName}'s` : "the group's"} Group Settings.
                    </Text>
                </View>
            </View>

            <View style={s.screenFooter}>
                <PressableOpacity style={s.skipBtn} onPress={onDone}>
                    <Text style={s.skipBtnText}>Skip for now</Text>
                </PressableOpacity>
                <PressableOpacity style={s.primaryBtn} onPress={onDone}>
                    <Text style={s.primaryBtnText}>Done</Text>
                    <Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} />
                </PressableOpacity>
            </View>
        </View>
    );
};
