import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Keyboard, Text, TextInput, View } from "react-native";
import { StepDots } from "@/components/create-group/StepDots";
import { makeStyles } from "@/components/create-group/styles";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { useThemeColors } from "@/contexts/AppearanceContext";
import { pickAndUploadImage } from "@/utils/uploadImage";
import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";

export const NameScreen = ({ onNext, onClose }: { onNext: (name: string, imageUrl: string) => void; onClose: () => void }) => {
    const colors = useThemeColors();
    const s = useMemo(() => makeStyles(colors), [colors]);
    const [name, setName] = useState("");
    const [nameFocused, setNameFocused] = useState(false);
    const [localUri, setLocalUri] = useState<string | null>(null);
    const [imageUrl, setImageUrl] = useState("");
    const [uploading, setUploading] = useState(false);
    const { getToken } = useAuth();

    const handlePickImage = async () => {
        try {
            const token = await getToken({ template: "supabase" });
            if (!token) return;
            setUploading(true);
            const url = await pickAndUploadImage("group-images", `group-${Date.now()}/cover.jpg`, token);
            if (url) {
                setLocalUri(url);
                setImageUrl(url);
            }
        } catch {
            Alert.alert("Error", "Could not upload image. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    const canContinue = name.trim().length > 0 && !uploading;

    return (
        <View style={s.screen}>
            <View style={s.screenHeader}>
                <PressableOpacity onPress={onClose} style={s.iconBtn}>
                    <Feather name="x" size={24} color={colors.textMuted} />
                </PressableOpacity>
                <StepDots total={4} current={0} />
                <View style={{ width: 36 }} />
            </View>
            <View style={s.screenBody}>
                <Text style={s.screenTitle}>Name your group</Text>
                <Text style={s.screenSub}>What are you calling this crew?</Text>
                <TextInput
                    style={s.bigInput}
                    placeholder={nameFocused ? "" : '"Basketball Squad"'}
                    placeholderTextColor={colors.placeholder}
                    textAlign="center"
                    value={name}
                    onChangeText={setName}
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setNameFocused(false)}
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                />
                <PressableOpacity onPress={handlePickImage} disabled={uploading} style={s.imagePicker}>
                    {uploading ? (
                        <ActivityIndicator color={colors.brand} />
                    ) : localUri ? (
                        <>
                            <Image source={{ uri: localUri }} style={s.imagePreview} />
                            <View style={s.imageEditBadge}>
                                <Feather name="camera" size={18} color="#fff" />
                            </View>
                        </>
                    ) : (
                        <>
                            <Feather name="image" size={36} color={colors.textFaint} />
                            <Text style={s.imagePickerText}>Add group photo</Text>
                        </>
                    )}
                </PressableOpacity>
            </View>
            <View style={s.screenFooter}>
                <View style={{ flex: 1 }} />
                <PressableOpacity
                    style={[s.primaryBtn, !canContinue && s.primaryBtnDisabled]}
                    onPress={() => canContinue && onNext(name.trim(), imageUrl)}
                    disabled={!canContinue}
                >
                    <Text style={s.primaryBtnText}>Continue</Text>
                    <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />
                </PressableOpacity>
            </View>
        </View>
    );
};
