import { useCallback, useMemo, useState } from "react";
import { Alert, BackHandler } from "react-native";
import { MembersScreen } from "@/components/create-group/MembersScreen";
import { NameScreen } from "@/components/create-group/NameScreen";
import { ReviewScreen } from "@/components/create-group/ReviewScreen";
import { ScheduleScreen } from "@/components/create-group/ScheduleScreen";
import { makeStyles } from "@/components/create-group/styles";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { useCreateGroup } from "@/hooks/useCreateGroup";
import { deviceTimeZone } from "@/utils/timezones";
import { buildSchedulePayload, ScheduleData } from "@/utils/createGroupDraft";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, { FadeInRight } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

type Step = "name" | "schedule" | "review" | "invite";

const CreateGroupScreen = () => {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    const router = useRouter();
    const { mutate, isPending } = useCreateGroup();
    const [step, setStep] = useState<Step>("name");
    const [groupName, setGroupName] = useState("");
    const [groupImage, setGroupImage] = useState("");
    const [schedules, setSchedules] = useState<ScheduleData[]>([]);
    const [timezone, setTimezone] = useState(deviceTimeZone());
    const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);

    const handleClose = () => router.replace("/(tabs)/groups");

    // Android's back button/gesture steps back through the wizard like the on-screen Back buttons do,
    // instead of closing the whole flow and throwing away what was entered.
    useFocusEffect(useCallback(() => {
        const sub = BackHandler.addEventListener("hardwareBackPress", () => {
            if (isPending) return true;
            if (step === "schedule") { setStep("name"); return true; }
            if (step === "review") { setStep("schedule"); return true; }
            if (step === "invite") { router.replace({ pathname: "/(tabs)/groups", params: { promptNotifications: "1" } }); return true; }
            return false;
        });
        return () => sub.remove();
    }, [step, isPending]));

    const handleCreate = () => {
        // Empty (frequency-less) tabs were already filtered out before reaching
        // this step, so every entry here is a real schedule to create.
        const scheduleInputs = schedules
            .map(sch => {
                const routinePart = buildSchedulePayload(sch);
                return routinePart ? { name: sch.name.trim() || groupName, ...routinePart } : null;
            })
            .filter((s): s is NonNullable<typeof s> => s !== null);

        const firstCapacity = schedules[0]?.maxAttendeesMode === "limited"
            ? parseInt(schedules[0].maxAttendeesInput, 10)
            : 0;

        const payload: any = {
            name: groupName,
            image: groupImage,
            meetupsToDisplay: 1,
            timezone,
            // Fallback defaults for one-off meetups not tied to any schedule —
            // borrowed from the first schedule when one exists.
            defaultLocation: schedules[0]?.location ?? "",
            defaultCapacity: firstCapacity,
            schedules: scheduleInputs,
        };
        mutate(payload, {
            onSuccess: (data) => {
                setCreatedGroupId(data.group._id);
                setStep("invite");
            },
            onError: (err: any) => Alert.alert("Error", err?.response?.data?.error || "Failed to create group."),
        });
    };

    const screen = (() => {
    if (step === "name") return <SafeAreaView style={s.safe}><NameScreen onNext={(n, img) => { setGroupName(n); setGroupImage(img); setStep("schedule"); }} onClose={handleClose} /></SafeAreaView>;
    if (step === "schedule") return <SafeAreaView style={s.safe}><ScheduleScreen groupName={groupName} initialSchedules={schedules} initialTimezone={timezone} onNext={(data, tz) => { setSchedules(data); setTimezone(tz); setStep("review"); }} onBack={() => setStep("name")} onSkip={() => { setSchedules([]); setStep("review"); }} /></SafeAreaView>;
    if (step === "review") return <SafeAreaView style={s.safe}><ReviewScreen groupName={groupName} groupImage={groupImage} members={[]} schedules={schedules} timezone={timezone} onConfirm={handleCreate} onBack={() => setStep("schedule")} isPending={isPending} /></SafeAreaView>;
    return <SafeAreaView style={s.safe}><MembersScreen groupId={createdGroupId!} groupName={groupName} onDone={() => {
        // Leave the flow on the Groups tab, then open the new group's chat so "back" returns to the list.
        router.replace({ pathname: "/(tabs)/groups", params: { promptNotifications: "1" } });
        if (createdGroupId) setTimeout(() => router.push({ pathname: "/group-chat/[id]", params: { id: createdGroupId } }), 0);
    }} /></SafeAreaView>;
    })();

    // Each step slides in from the right so the flow reads as forward motion.
    return <Animated.View key={step} entering={FadeInRight.duration(220)} style={{ flex: 1 }}>{screen}</Animated.View>;
};

export default CreateGroupScreen;
