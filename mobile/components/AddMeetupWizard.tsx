import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import OptionPickerModal from './OptionPickerModal';
import { MeetupForm } from './meetup-form/MeetupForm';
import { makeStyles } from './create-group/styles';
import { Group, groupApi, meetupApi, useApiClient } from '@/utils/api';
import { saveDraftQuestions } from '@/utils/questionDrafts';
import { pickAndUploadImage } from '@/utils/uploadImage';
import { createPayload, draftForNew, type MeetupDraft } from '@/utils/meetupFormDraft';
import { usePremium } from '@/hooks/usePremium';
import { useGetGroupDetails } from '@/hooks/useGetGroupDetails';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { toast } from '@/contexts/ToastContext';

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

/**
 * Add Meetup: a one-off meetup in an existing group (or a new one, from the meetups tab). The form
 * itself is MeetupForm, laid out like Set Recurring Meetups, with the meetup's own RSVP rules and
 * Premium settings. This wrapper adds the "Which group?" choice and does the saving.
 */
const AddMeetupWizard = ({ visible, onClose, groupDetails, groupPickerMode, onMeetupCreated }: AddMeetupWizardProps) => {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { getToken } = useAuth();
    const { isPremium: iHavePremium, userId } = usePremium();

    // Initial group choice: honors groupPickerMode.initialMode (set by which square the user
    // tapped on the meetups tab), falling back to the first existing group, or 'new' if none.
    const initialPickerChoice: 'new' | string = groupPickerMode
        ? (groupPickerMode.initialMode !== 'new' && groupPickerMode.groups.length > 0 ? groupPickerMode.groups[0]._id : 'new')
        : '';
    const groupFor = (choice: string): Group | undefined =>
        groupDetails ?? (choice === 'new' ? undefined : groupPickerMode?.groups.find(g => g._id === choice));

    const [pickerChoice, setPickerChoice] = useState<'new' | string>(initialPickerChoice);
    const [draft, setDraft] = useState<MeetupDraft>(() => draftForNew(groupFor(initialPickerChoice)));
    const [isSaving, setIsSaving] = useState(false);
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupImageUrl, setNewGroupImageUrl] = useState('');
    const [isUploadingGroupImage, setIsUploadingGroupImage] = useState(false);
    // Set once "New Group" creation succeeds, so a subsequent meetup-creation failure can be
    // retried against the now-real group instead of creating a duplicate group.
    const [justCreatedGroup, setJustCreatedGroup] = useState<Group | null>(null);

    // This wizard is a long-lived instance that just toggles `visible`, so re-seed on every open.
    useEffect(() => {
        if (!visible) return;
        setPickerChoice(initialPickerChoice);
        setDraft(draftForNew(groupFor(initialPickerChoice)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const isNewGroup = !!groupPickerMode && pickerChoice === 'new' && !justCreatedGroup;
    const selectedGroup = justCreatedGroup ?? groupFor(pickerChoice);
    // Premium belongs to the group's owner; a new group's owner is you. Only group details say
    // whether the owner has it (the groups list doesn't), so read the chosen group's (cached) details.
    const { data: selectedDetails } = useGetGroupDetails(visible && !isNewGroup ? selectedGroup?._id ?? null : null);
    const isPremium = isNewGroup ? iHavePremium : selectedDetails?.isPremium === true;
    const owner = isNewGroup ? userId : selectedGroup?.owner;

    const extraError = isNewGroup && newGroupName.trim().length === 0
        ? 'Give the new group a name.'
        : isUploadingGroupImage ? 'Uploading the photo...' : null;

    // Re-seeds timezone/capacity/location for the chosen group (a "New Group" has no defaults).
    // The date, time, RSVP rules and Premium settings already entered are kept.
    const handleSelectGroup = (key: string) => {
        setPickerChoice(key);
        setShowGroupPicker(false);
        const seed = draftForNew(groupFor(key));
        setDraft(d => ({ ...d, timezone: seed.timezone, location: seed.location, maxAttendeesMode: seed.maxAttendeesMode, maxAttendeesInput: seed.maxAttendeesInput }));
    };

    const handlePickGroupImage = async () => {
        try {
            const token = await getToken({ template: "supabase" });
            if (!token) return;
            setIsUploadingGroupImage(true);
            const url = await pickAndUploadImage("group-images", `group-${Date.now()}/cover.jpg`, token);
            if (url) setNewGroupImageUrl(url);
        } catch {
            Alert.alert("Error", "Could not upload image. Please try again.");
        } finally {
            setIsUploadingGroupImage(false);
        }
    };

    const resetAndClose = () => {
        setShowGroupPicker(false);
        setNewGroupName('');
        setNewGroupImageUrl('');
        setJustCreatedGroup(null);
        onClose();
    };

    const handleCreateMeetup = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            let target: { _id: string; name: string };
            if (isNewGroup) {
                // The group's timezone comes from this form's timezone field.
                const { group: newGroup } = await groupApi.createGroup(api, {
                    name: newGroupName.trim(),
                    image: newGroupImageUrl || undefined,
                    timezone: draft.timezone,
                    meetupsToDisplay: 1,
                });
                setJustCreatedGroup(newGroup);
                target = newGroup;
                queryClient.invalidateQueries({ queryKey: ['groups'] });
            } else if (selectedGroup) {
                target = selectedGroup;
            } else {
                Alert.alert("Error", "Please choose a group.");
                return;
            }

            // If the group was just created above but this call throws, the group stays so the user can retry.
            const { meetup } = await groupApi.createOneOffMeetup(api, { groupId: target._id, name: target.name, ...createPayload(draft) } as any);
            // RSVP questions written before the meetup existed.
            const questionsSaved = await saveDraftQuestions([draft.questions], [meetup?._id],
                (mid, questions) => meetupApi.updateMeetupQuestions(api, mid, { questions }));
            if (!questionsSaved) Alert.alert("Meetup added", "Your RSVP questions couldn't be saved. You can add them from the meetup's Edit screen.");
            toast.success("Meetup added!");
            queryClient.invalidateQueries({ queryKey: ['meetups'] });
            (groupPickerMode ? groupPickerMode.onMeetupCreated : onMeetupCreated)?.(target._id);
            resetAndClose();
        } catch (error: any) {
            Alert.alert("Error", error.response?.data?.message || error.response?.data?.error || "Failed to add meetup.");
        } finally {
            setIsSaving(false);
        }
    };

    const groupSection = groupPickerMode && !justCreatedGroup ? (
        <View style={[s.sectionCard, { borderLeftWidth: 3, borderLeftColor: colors.brand }]}>
            <View style={s.sectionHeaderRow}>
                <View style={s.sectionIconChip}><Feather name="users" size={19} color={colors.brand} /></View>
                <Text style={s.sectionTitle}>Group</Text>
            </View>
            {groupPickerMode.groups.length > 0 && (
                <>
                    <Text style={[s.fieldLabel, s.fieldLabelFirst]}>Which group?</Text>
                    <PressableOpacity style={s.dateFieldRow} onPress={() => setShowGroupPicker(true)}>
                        <Feather name="users" size={16} color={colors.brand} style={{ marginRight: 8 }} />
                        <Text style={s.dateFieldText}>{pickerChoice === 'new' ? 'New Group' : selectedGroup?.name}</Text>
                        <Feather name="chevron-down" size={16} color={colors.textFaint} style={{ marginLeft: "auto" }} />
                    </PressableOpacity>
                </>
            )}
            {pickerChoice === 'new' && (
                <>
                    <Text style={[s.fieldLabel, groupPickerMode.groups.length === 0 && s.fieldLabelFirst]}>Group Name</Text>
                    <View style={[s.inputRow, { marginBottom: 0 }]}>
                        <TextInput
                            style={s.inlineInput}
                            placeholder="e.g. Basketball Squad"
                            placeholderTextColor={colors.placeholder}
                            value={newGroupName}
                            onChangeText={setNewGroupName}
                        />
                    </View>
                    <Text style={s.fieldLabel}>Group Photo (optional)</Text>
                    <PressableOpacity
                        onPress={handlePickGroupImage}
                        disabled={isUploadingGroupImage}
                        style={[s.dateFieldRow, { justifyContent: "center", paddingVertical: 20, borderStyle: "dashed", flexDirection: "column" }]}
                    >
                        {isUploadingGroupImage ? (
                            <ActivityIndicator color={colors.brand} />
                        ) : newGroupImageUrl ? (
                            <Image source={{ uri: newGroupImageUrl }} style={{ width: 72, height: 72, borderRadius: 36 }} />
                        ) : (
                            <>
                                <Feather name="image" size={24} color={colors.textFaint} />
                                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textFaint, marginTop: 6 }}>Add group photo</Text>
                            </>
                        )}
                    </PressableOpacity>
                </>
            )}
        </View>
    ) : null;

    return (
        <MeetupForm
            visible={visible}
            mode="create"
            draft={draft}
            onChange={patch => setDraft(d => ({ ...d, ...patch }))}
            isPremium={isPremium}
            owner={owner}
            lockedNote={isNewGroup ? "Get Premium to turn these on for your meetups." : "The group's owner needs Premium to turn these on."}
            topSection={groupSection}
            timezoneEditable
            saving={isSaving}
            extraError={extraError}
            onSubmit={handleCreateMeetup}
            onClose={resetAndClose}
            overlays={showGroupPicker && groupPickerMode ? (
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
            ) : null}
        />
    );
};

export default AddMeetupWizard;
