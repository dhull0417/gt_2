import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    Modal,
    ActivityIndicator,
    Alert,
    ScrollView,
    Image
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/expo';
import { Group, groupApi, useApiClient } from '@/utils/api';
import { pickAndUploadImage } from '@/utils/uploadImage';
import { DateTime } from 'luxon';
import NativeTimePicker from './NativeTimePicker';
import LocationField from './LocationField';
import LocationSearchModal from './LocationSearchModal';
import OptionPickerModal from './OptionPickerModal';
import { useQueryClient } from '@tanstack/react-query';

interface GroupPickerMode {
    /** Non-DM groups the current user belongs to. */
    groups: Group[];
    /** Which group choice the wizard opens on. Defaults to the first existing group ('existing'), or 'new' if there are none. */
    initialMode?: 'existing' | 'new';
    /** Fires after the meetup is successfully created, with the (existing or newly created) group's id. */
    onMeetupCreated: (groupId: string) => void;
}

type AddMeetupWizardProps =
    | { visible: boolean; onClose: () => void; groupDetails: Group; groupPickerMode?: undefined; onMeetupCreated?: (groupId: string) => void }
    | { visible: boolean; onClose: () => void; groupDetails?: undefined; groupPickerMode: GroupPickerMode; onMeetupCreated?: undefined };

const usaTimezones = [
    { label: "Eastern (ET)", value: "America/New_York" },
    { label: "Central (CST)", value: "America/Chicago" },
    { label: "Mountain (MT)", value: "America/Denver" },
    { label: "Mountain (no DST)", value: "America/Phoenix" },
    { label: "Pacific (PST)", value: "America/Los_Angeles" },
    { label: "Alaska (AKST)", value: "America/Anchorage" },
    { label: "Hawaii (HST)", value: "Pacific/Honolulu" },
];

// Mirrors Max Attendees validation in create-group/index.tsx
const getMaxAttendeesError = (mode: "unlimited" | "limited", input: string): string | null => {
    if (mode !== "limited" || input === "") return null;
    if (!/^\d+$/.test(input)) return "Numbers only, please.";
    const n = parseInt(input, 10);
    if (n < 1 || n > 200) return "Enter a number between 1 and 200.";
    return null;
};

// Single-screen form for one-off meetups; styled to match create-group/index.tsx
const AddMeetupWizard = ({ visible, onClose, groupDetails, groupPickerMode, onMeetupCreated }: AddMeetupWizardProps) => {
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { getToken } = useAuth();

    const [isSaving, setIsSaving] = useState(false);

    // Initial group choice: honors groupPickerMode.initialMode (set by which square the user
    // tapped on the meetups tab), falling back to the first existing group, or 'new' if none.
    const initialPickerChoice: 'new' | string = groupPickerMode
        ? (groupPickerMode.initialMode !== 'new' && groupPickerMode.groups.length > 0 ? groupPickerMode.groups[0]._id : 'new')
        : '';

    // Group whose timezone/defaults seed the form's initial values; "New Group" has no
    // defaults to seed from.
    const initialGroup: Group | undefined = groupDetails ?? (groupPickerMode && initialPickerChoice !== 'new' ? groupPickerMode.groups[0] : undefined);

    // --- Data States ---
    const [meetupDate, setMeetupDate] = useState<string>(DateTime.now().toISODate()!);
    const [meetupTime, setMeetupTime] = useState("05:00 PM");
    const [meetupTZ, setMeetupTZ] = useState(initialGroup?.timezone || "America/Denver");
    const [maxAttendeesMode, setMaxAttendeesMode] = useState<"unlimited" | "limited">(
        initialGroup?.defaultCapacity ? "limited" : "unlimited"
    );
    const [maxAttendeesInput, setMaxAttendeesInput] = useState<string>(
        initialGroup?.defaultCapacity ? String(initialGroup.defaultCapacity) : ""
    );
    const [meetupLocation, setMeetupLocation] = useState(initialGroup?.defaultLocation || "");
    const [isLocationSearchActive, setIsLocationSearchActive] = useState(false);
    const [meetupDescription, setMeetupDescription] = useState("");

    const [showTimePicker, setShowTimePicker] = useState(false);
    const [showTZPicker, setShowTZPicker] = useState(false);

    // --- Group picker state (only relevant when groupPickerMode is set) ---
    const [pickerChoice, setPickerChoice] = useState<'new' | string>(initialPickerChoice);
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupImageUrl, setNewGroupImageUrl] = useState('');
    const [newGroupImageLocalUri, setNewGroupImageLocalUri] = useState<string | null>(null);
    const [isUploadingGroupImage, setIsUploadingGroupImage] = useState(false);
    // Set once "New Group" creation succeeds, so a subsequent meetup-creation failure can be
    // retried against the now-real group instead of creating a duplicate group.
    const [justCreatedGroup, setJustCreatedGroup] = useState<Group | null>(null);

    // --- Calendar Logic ---
    const [calendarMonth, setCalendarMonth] = useState<DateTime>(DateTime.now().startOf('month'));

    // Chunked into 7-cell rows; flex-wrap alone leaves a phantom blank row when
    // the day count isn't a multiple of 7.
    const calendarWeeks = useMemo(() => {
        const start = calendarMonth.startOf('month');
        const firstDayIdx = start.weekday === 7 ? 0 : start.weekday;
        const days: (DateTime | null)[] = [];
        for (let i = 0; i < firstDayIdx; i++) days.push(null);
        for (let i = 1; i <= calendarMonth.daysInMonth!; i++) days.push(calendarMonth.set({ day: i }));
        while (days.length % 7 !== 0) days.push(null);
        const chunks: (DateTime | null)[][] = [];
        for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7));
        return chunks;
    }, [calendarMonth]);

    const minDT = DateTime.now().startOf('day');

    const maxAttendeesError = getMaxAttendeesError(maxAttendeesMode, maxAttendeesInput);
    const needsNewGroupName = !!groupPickerMode && pickerChoice === 'new' && !justCreatedGroup && newGroupName.trim().length === 0;
    const canSubmit = (maxAttendeesMode !== "limited" || (maxAttendeesInput !== "" && !maxAttendeesError))
        && !needsNewGroupName
        && !isUploadingGroupImage;

    // Re-seeds the timezone/capacity/location fields whenever the "Which group?"
    // selection changes — otherwise a group picked earlier (e.g. the default first
    // group) leaves its address/capacity behind when switching to another group or
    // to "New Group", which has no defaults of its own.
    const handleSelectGroup = (key: string) => {
        setPickerChoice(key);
        setShowGroupPicker(false);
        const selectedGroup = key === 'new' ? undefined : groupPickerMode?.groups.find(g => g._id === key);
        setMeetupTZ(selectedGroup?.timezone || "America/Denver");
        setMaxAttendeesMode(selectedGroup?.defaultCapacity ? "limited" : "unlimited");
        setMaxAttendeesInput(selectedGroup?.defaultCapacity ? String(selectedGroup.defaultCapacity) : "");
        setMeetupLocation(selectedGroup?.defaultLocation || "");
    };

    const handlePickGroupImage = async () => {
        try {
            const token = await getToken({ template: "supabase" });
            if (!token) return;
            setIsUploadingGroupImage(true);
            const url = await pickAndUploadImage("group-images", `group-${Date.now()}/cover.jpg`, token);
            if (url) {
                setNewGroupImageLocalUri(url);
                setNewGroupImageUrl(url);
            }
        } catch {
            Alert.alert("Error", "Could not upload image. Please try again.");
        } finally {
            setIsUploadingGroupImage(false);
        }
    };

    const handleCreateMeetup = async () => {
        if (!canSubmit) return;
        setIsSaving(true);
        try {
            // Pass raw YYYY-MM-DD string, not new Date(), to avoid a timezone off-by-one-day bug
            const capacity = maxAttendeesMode === "limited" ? parseInt(maxAttendeesInput, 10) : 0;

            let targetGroupId: string;
            let targetGroupName: string;

            if (groupPickerMode && pickerChoice === 'new' && !justCreatedGroup) {
                if (!newGroupName.trim()) {
                    Alert.alert("Error", "Group name is required.");
                    setIsSaving(false);
                    return;
                }
                // Group's timezone comes from this wizard's own timezone field; defaultLocation
                // and defaultCapacity are intentionally left unset for the new group.
                const { group: newGroup } = await groupApi.createGroup(api, {
                    name: newGroupName.trim(),
                    image: newGroupImageUrl || undefined,
                    timezone: meetupTZ,
                    meetupsToDisplay: 1,
                });
                setJustCreatedGroup(newGroup);
                targetGroupId = newGroup._id;
                targetGroupName = newGroup.name;
                queryClient.invalidateQueries({ queryKey: ['groups'] });
            } else if (groupPickerMode) {
                const picked = justCreatedGroup ?? groupPickerMode.groups.find(g => g._id === pickerChoice);
                if (!picked) {
                    Alert.alert("Error", "Please choose a group.");
                    setIsSaving(false);
                    return;
                }
                targetGroupId = picked._id;
                targetGroupName = picked.name;
            } else {
                // groupPickerMode is absent here, so the type contract guarantees groupDetails is set.
                targetGroupId = groupDetails!._id;
                targetGroupName = groupDetails!.name;
            }

            // If the group was just created above but this call throws, we deliberately do NOT
            // roll back the group — the catch block below leaves it in place so the user can retry.
            await groupApi.createOneOffMeetup(api, {
                groupId: targetGroupId,
                date: meetupDate as any,
                time: meetupTime,
                timezone: meetupTZ,
                capacity,
                location: meetupLocation,
                description: meetupDescription,
                name: targetGroupName
            });
            Alert.alert("Success", "Meetup added!");
            queryClient.invalidateQueries({ queryKey: ['meetups'] });
            (groupPickerMode ? groupPickerMode.onMeetupCreated : onMeetupCreated)?.(targetGroupId);
            resetAndClose();
        } catch (error: any) {
            Alert.alert("Error", error.response?.data?.error || "Failed to add meetup.");
        } finally {
            setIsSaving(false);
        }
    };

    const resetAndClose = () => {
        setMeetupDate(DateTime.now().toISODate()!);
        setMeetupTime("05:00 PM");
        setShowTimePicker(false);
        setShowTZPicker(false);
        setMaxAttendeesMode(initialGroup?.defaultCapacity ? "limited" : "unlimited");
        setMaxAttendeesInput(initialGroup?.defaultCapacity ? String(initialGroup.defaultCapacity) : "");
        setMeetupDescription("");
        setShowGroupPicker(false);
        setNewGroupName('');
        setNewGroupImageUrl('');
        setNewGroupImageLocalUri(null);
        setJustCreatedGroup(null);
        setPickerChoice(initialPickerChoice);
        onClose();
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={resetAndClose}
        >
            {/* pageSheet is iOS-only; Android renders fullscreen and needs safe-area insets manually */}
            <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
                <View style={s.screenHeader}>
                    <TouchableOpacity onPress={resetAndClose} style={s.iconBtn}>
                        <Feather name="x" size={24} color="#6B7280" />
                    </TouchableOpacity>
                    <View style={{ width: 36 }} />
                </View>

                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    automaticallyAdjustKeyboardInsets
                >
                    <Text style={s.screenTitle}>Add Meetup</Text>
                    <Text style={s.screenSub}>Set the date, time, and details</Text>

                    {/* Which group? (only in groupPickerMode) */}
                    {groupPickerMode && groupPickerMode.groups.length > 0 && !justCreatedGroup && (
                        <>
                            <Text style={s.fieldLabel}>Which group?</Text>
                            <TouchableOpacity style={s.dateFieldRow} onPress={() => setShowGroupPicker(true)}>
                                <Feather name="users" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                                <Text style={s.dateFieldText}>
                                    {pickerChoice === 'new' ? 'New Group' : groupPickerMode.groups.find(g => g._id === pickerChoice)?.name}
                                </Text>
                                <Feather name="chevron-down" size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                            </TouchableOpacity>
                        </>
                    )}

                    {groupPickerMode && (pickerChoice === 'new') && !justCreatedGroup && (
                        <>
                            <Text style={s.fieldLabel}>Group Name</Text>
                            <View style={s.inputRow}>
                                <TextInput
                                    style={s.inlineInput}
                                    placeholder="e.g. Basketball Squad"
                                    placeholderTextColor="#C4C9D4"
                                    value={newGroupName}
                                    onChangeText={setNewGroupName}
                                />
                            </View>

                            <Text style={s.fieldLabel}>Group Photo (optional)</Text>
                            <TouchableOpacity onPress={handlePickGroupImage} disabled={isUploadingGroupImage} style={s.groupImagePicker}>
                                {isUploadingGroupImage ? (
                                    <ActivityIndicator color="#4A90E2" />
                                ) : newGroupImageLocalUri ? (
                                    <Image source={{ uri: newGroupImageLocalUri }} style={s.groupImagePreview} />
                                ) : (
                                    <>
                                        <Feather name="image" size={24} color="#9CA3AF" />
                                        <Text style={s.groupImagePickerText}>Add group photo</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </>
                    )}

                    {/* Date */}
                    <Text style={s.fieldLabel}>Date</Text>
                    <View style={cal.container}>
                        <View style={cal.nav}>
                            <TouchableOpacity onPress={() => setCalendarMonth(m => m.minus({ months: 1 }))} style={cal.navBtn}>
                                <Feather name="chevron-left" size={18} color="#4A90E2" />
                            </TouchableOpacity>
                            <Text style={cal.monthLabel}>{calendarMonth.toFormat('MMMM yyyy')}</Text>
                            <TouchableOpacity onPress={() => setCalendarMonth(m => m.plus({ months: 1 }))} style={cal.navBtn}>
                                <Feather name="chevron-right" size={18} color="#4A90E2" />
                            </TouchableOpacity>
                        </View>
                        <View style={cal.weekRow}>
                            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                                <Text key={i} style={cal.dayHeader}>{d}</Text>
                            ))}
                        </View>
                        {calendarWeeks.map((week, wi) => (
                            <View key={wi} style={cal.weekRow}>
                                {week.map((day, i) => {
                                    if (!day) return <View key={`e-${wi}-${i}`} style={cal.cell} />;
                                    const iso = day.toISODate()!;
                                    const selected = iso === meetupDate;
                                    const disabled = day < minDT;
                                    return (
                                        <TouchableOpacity
                                            key={iso}
                                            style={[cal.cell, selected && cal.cellSelected, disabled && cal.cellDisabled]}
                                            onPress={() => !disabled && setMeetupDate(iso)}
                                            disabled={disabled}
                                        >
                                            <Text style={[cal.cellText, selected && cal.cellTextSelected, disabled && cal.cellTextDisabled]}>
                                                {day.day}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        ))}
                    </View>

                    {/* Time */}
                    <Text style={s.fieldLabel}>Time</Text>
                    <TouchableOpacity
                        style={s.dateFieldRow}
                        onPress={() => { setShowTimePicker(v => !v); setShowTZPicker(false); }}
                    >
                        <Feather name="clock" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                        <Text style={s.dateFieldText}>{meetupTime}</Text>
                        <Feather name={showTimePicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>

                    {/* Timezone */}
                    <Text style={s.fieldLabel}>Timezone</Text>
                    <TouchableOpacity
                        style={s.dateFieldRow}
                        onPress={() => { setShowTZPicker(v => !v); setShowTimePicker(false); }}
                    >
                        <Feather name="globe" size={16} color="#4A90E2" style={{ marginRight: 8 }} />
                        <Text style={s.dateFieldText}>{usaTimezones.find(tz => tz.value === meetupTZ)?.label || meetupTZ}</Text>
                        <Feather name={showTZPicker ? "chevron-up" : "chevron-down"} size={16} color="#9CA3AF" style={{ marginLeft: "auto" }} />
                    </TouchableOpacity>
                    {showTZPicker && (
                        <View style={s.inlineDayPicker}>
                            {usaTimezones.map(tz => (
                                <TouchableOpacity
                                    key={tz.value}
                                    style={[s.dayOption, meetupTZ === tz.value && s.dayOptionActive]}
                                    onPress={() => { setMeetupTZ(tz.value); setShowTZPicker(false); }}
                                >
                                    <Text style={[s.dayOptionText, meetupTZ === tz.value && s.dayOptionTextActive]}>{tz.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* Max Attendees */}
                    <Text style={s.fieldLabel}>Max Attendees</Text>
                    <View style={s.boolRow}>
                        <TouchableOpacity
                            style={[s.boolBtn, maxAttendeesMode === "unlimited" && s.boolBtnActive]}
                            onPress={() => { setMaxAttendeesMode("unlimited"); setMaxAttendeesInput(""); }}
                        >
                            <Text style={[s.boolBtnText, maxAttendeesMode === "unlimited" && s.boolBtnTextActive]}>Unlimited</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[s.boolBtn, maxAttendeesMode === "limited" && s.boolBtnActive]}
                            onPress={() => setMaxAttendeesMode("limited")}
                        >
                            <Text style={[s.boolBtnText, maxAttendeesMode === "limited" && s.boolBtnTextActive]}>Limited</Text>
                        </TouchableOpacity>
                    </View>
                    {maxAttendeesMode === "limited" && (
                        <View style={{ marginTop: 10 }}>
                            <View style={[s.inputRow, maxAttendeesError && s.inputRowError]}>
                                <Feather name="users" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
                                <TextInput
                                    style={s.inlineInput}
                                    placeholder="How many?"
                                    placeholderTextColor="#C4C9D4"
                                    keyboardType="number-pad"
                                    value={maxAttendeesInput}
                                    onChangeText={setMaxAttendeesInput}
                                />
                            </View>
                            {maxAttendeesError && <Text style={s.errorText}>{maxAttendeesError}</Text>}
                        </View>
                    )}

                    {/* Location */}
                    <Text style={s.fieldLabel}>Location or link</Text>
                    <LocationField
                        variant="wizard"
                        placeholder="e.g. Starbucks or Zoom link..."
                        value={meetupLocation}
                        onPress={() => setIsLocationSearchActive(true)}
                    />

                    {/* Description */}
                    <Text style={s.fieldLabel}>Description (optional)</Text>
                    <View style={[s.inputRow, s.descriptionInputRow]}>
                        <TextInput
                            style={[s.inlineInput, s.descriptionInput]}
                            placeholder="Add any extra details for this meetup..."
                            placeholderTextColor="#C4C9D4"
                            value={meetupDescription}
                            onChangeText={setMeetupDescription}
                            multiline
                            textAlignVertical="top"
                        />
                    </View>
                </ScrollView>

                <View style={s.screenFooter}>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity style={[s.primaryBtn, !canSubmit && s.primaryBtnDisabled]} onPress={handleCreateMeetup} disabled={isSaving || !canSubmit}>
                        {isSaving ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <>
                                <Text style={s.primaryBtnText}>Create Meetup</Text>
                                <Feather name="check" size={18} color="#fff" style={{ marginLeft: 6 }} />
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                <LocationSearchModal
                    visible={isLocationSearchActive}
                    initialValue={meetupLocation}
                    placeholder="e.g. Starbucks or Zoom link..."
                    onDone={(text) => { setMeetupLocation(text); setIsLocationSearchActive(false); }}
                    onCancel={() => setIsLocationSearchActive(false)}
                    asOverlay
                />

                {/* Sibling of ScrollView, not descendant — an overlay inside it only fills the scrollable content */}
                {showTimePicker && (
                    <NativeTimePicker value={meetupTime} onChange={setMeetupTime} onClose={() => setShowTimePicker(false)} asOverlay />
                )}

                {showGroupPicker && groupPickerMode && (
                    <OptionPickerModal
                        title="Which group?"
                        options={[
                            ...groupPickerMode.groups.map(g => ({ key: g._id, label: g.name })),
                            { key: 'new', label: '+ New Group' },
                        ]}
                        selectedKey={pickerChoice}
                        onSelect={handleSelectGroup}
                        onClose={() => setShowGroupPicker(false)}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
};

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#F9FAFB" },
    screenHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    screenFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F3F4F6", backgroundColor: "#fff" },
    screenTitle: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 4 },
    screenSub: { fontSize: 14, color: "#9CA3AF", marginBottom: 20 },
    iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    fieldLabel: { fontSize: 11, fontWeight: "800", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
    dateFieldRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 4 },
    dateFieldText: { fontSize: 15, color: "#374151", fontWeight: "500" },
    inlineDayPicker: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginTop: 6, overflow: "hidden" },
    dayOption: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
    dayOptionActive: { backgroundColor: "#EEF6FF" },
    dayOptionText: { fontSize: 15, color: "#374151" },
    dayOptionTextActive: { color: "#4A90E2", fontWeight: "700" },
    boolRow: { flexDirection: "row", gap: 10 },
    boolBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: "#E5E7EB", alignItems: "center", backgroundColor: "#fff" },
    boolBtnActive: { borderColor: "#4A90E2", backgroundColor: "#EEF6FF" },
    boolBtnText: { fontSize: 14, fontWeight: "700", color: "#6B7280" },
    boolBtnTextActive: { color: "#4A90E2" },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, paddingVertical: 12 },
    inputRowError: { borderColor: "#EF4444" },
    inlineInput: { flex: 1, fontSize: 15, color: "#374151" },
    descriptionInputRow: { alignItems: "flex-start", height: 90 },
    descriptionInput: { height: "100%" },
    errorText: { fontSize: 12, fontWeight: "600", color: "#EF4444", marginTop: 6, marginLeft: 2 },
    primaryBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#4A90E2", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
    primaryBtnDisabled: { backgroundColor: "#93C5FD" },
    primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
    groupImagePicker: { alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", borderStyle: "dashed", paddingVertical: 20, marginBottom: 4 },
    groupImagePickerText: { fontSize: 13, fontWeight: "600", color: "#9CA3AF", marginTop: 6 },
    groupImagePreview: { width: 72, height: 72, borderRadius: 36 },
});

const cal = StyleSheet.create({
    container: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", padding: 12, marginTop: 6, marginBottom: 4 },
    nav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
    navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#EEF6FF", alignItems: "center", justifyContent: "center" },
    monthLabel: { fontSize: 15, fontWeight: "800", color: "#111827" },
    weekRow: { flexDirection: "row" },
    dayHeader: { width: `${100 / 7}%`, textAlign: "center", fontSize: 11, fontWeight: "800", color: "#9CA3AF", marginBottom: 4 },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
    cellSelected: { backgroundColor: "#4A90E2", borderRadius: 100 },
    cellDisabled: { opacity: 0.3 },
    cellText: { fontSize: 14, color: "#374151" },
    cellTextSelected: { color: "#fff", fontWeight: "800" },
    cellTextDisabled: { color: "#D1D5DB" },
});

export default AddMeetupWizard;
