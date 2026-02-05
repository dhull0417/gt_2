import React, { useState, useEffect, useMemo } from "react";
import { 
    View, 
    Text, 
    TouchableOpacity, 
    StyleSheet, 
    Alert, 
    Dimensions, 
    ActivityIndicator,
    Animated,
    KeyboardAvoidingView,
    Platform,
    ViewStyle,
    StyleProp
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from "react-native-safe-area-context";
import { useGetGroupDetails } from "../../hooks/useGetGroupDetails";
import { useApiClient, groupApi } from "../../utils/api"; 
import TimePicker from "../../components/TimePicker";

const { width } = Dimensions.get('window');

interface FadeInViewProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

const FadeInView = ({ children, delay = 0, duration = 400, style }: FadeInViewProps) => {
  const fadeAnim = useMemo(() => new Animated.Value(0), []);
  const slideAnim = useMemo(() => new Animated.Value(-15), []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration, delay, useNativeDriver: true })
    ]).start();
  }, [delay, duration, fadeAnim, slideAnim]);

  return (
    <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], width: '100%' }, style]}>
      {children}
    </Animated.View>
  );
};

/**
 * App (EditJitScreen)
 * Strictly replicates Step 12 of the Group Creation wizard logic and aesthetic.
 * Focuses on updating generationLeadDays and generationLeadTime.
 */
const App = () => {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();

    const { data: group, isLoading: loadingGroup } = useGetGroupDetails(id || "");

    // --- JIT Builder State (Mirrored from creation) ---
    const [leadDays, setLeadDays] = useState(2);
    const [notificationTime, setNotificationTime] = useState("09:00 AM");
    const [isUpdating, setIsUpdating] = useState(false);

    // --- Pre-populate from existing group data ---
    useEffect(() => {
        if (group) {
            setLeadDays(group.generationLeadDays ?? 2);
            setNotificationTime(group.generationLeadTime || "09:00 AM");
        }
    }, [group]);

    const handleUpdateJit = async () => {
        if (!id) return;
        setIsUpdating(true);
        
        try {
            // Update JIT fields via the group update endpoint
            await groupApi.updateGroup(api, { 
                groupId: id, 
                generationLeadDays: leadDays,
                generationLeadTime: notificationTime 
            });

            // Refresh queries to ensure changes are visible in settings and group details
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['groupDetails', id] }),
                queryClient.invalidateQueries({ queryKey: ['groups'] })
            ]);

            Alert.alert("Success", "JIT notification settings updated.");
            router.back();
        } catch (error: any) {
            const msg = error.response?.data?.error || "Failed to update JIT settings.";
            Alert.alert("Error", msg);
        } finally {
            setIsUpdating(false);
        }
    };

    if (loadingGroup) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#4F46E5" />
            </View>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} edges={['top', 'bottom']}>
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={{ flex: 1 }}
            >
                {/* Custom Header with Creation-style Close Button */}
                <View style={styles.screenHeader}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.closeButton} activeOpacity={0.7}>
                        <Feather name="x" size={28} color="#374151" />
                    </TouchableOpacity>
                </View>

                <View style={styles.stepContainerPadded}>
                    <FadeInView delay={100}>
                        <Text style={styles.headerTitle}>JIT Setup</Text>
                    </FadeInView>
                    
                    <View style={{ flex: 1 }}>
                        <FadeInView delay={250}>
                            <Text style={styles.description}>
                                Lead time for event creation and member notification:
                            </Text>
                        </FadeInView>

                        <FadeInView delay={400} style={styles.jitCard}>
                            {/* Days Lead Stepper */}
                            <View style={styles.leadDaysRow}>
                                <TouchableOpacity 
                                    onPress={() => setLeadDays(Math.max(0, leadDays - 1))} 
                                    style={styles.stepperBtn}
                                    activeOpacity={0.7}
                                >
                                    <Feather name="minus" size={24} color="#4F46E5" />
                                </TouchableOpacity>
                                
                                <View style={{ alignItems: 'center', width: 120 }}>
                                    <Text style={styles.leadVal}>{leadDays}</Text>
                                    <Text style={styles.leadLabel}>Days Lead</Text>
                                </View>
                                
                                <TouchableOpacity 
                                    onPress={() => setLeadDays(leadDays + 1)} 
                                    style={styles.stepperBtn}
                                    activeOpacity={0.7}
                                >
                                    <Feather name="plus" size={24} color="#4F46E5" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.divider} />

                            {/* Trigger Time Selection */}
                            <Text style={styles.sectionLabelCenter}>Trigger Time</Text>
                            <TimePicker onTimeChange={setNotificationTime} initialValue={notificationTime} />
                        </FadeInView>
                    </View>

                    {/* Footer Navigation (Creation Flow Arrows) */}
                    <View style={styles.footerNavSpread}>
                        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
                            <Feather name="arrow-left-circle" size={48} color="#4F46E5" />
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            onPress={handleUpdateJit} 
                            disabled={isUpdating}
                            activeOpacity={0.7}
                        >
                            {isUpdating ? (
                                <ActivityIndicator size="small" color="#4F46E5" />
                            ) : (
                                <Feather name="arrow-right-circle" size={48} color="#4F46E5" />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    screenHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    closeButton: {
        padding: 8,
    },
    stepContainerPadded: { flex: 1, padding: 24, paddingTop: 12 },
    headerTitle: { fontSize: 26, fontWeight: '900', color: '#111827', textAlign: 'center', marginBottom: 8 },
    description: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
    jitCard: { backgroundColor: 'white', borderRadius: 24, padding: 24, borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 12, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10 },
    leadDaysRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
    stepperBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F5F7FF', alignItems: 'center', justifyContent: 'center' },
    leadVal: { fontSize: 32, fontWeight: '900', color: '#111827' },
    leadLabel: { fontSize: 10, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase' },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },
    sectionLabelCenter: { fontSize: 12, fontWeight: 'bold', color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 16, textAlign: 'center' },
    footerNavSpread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingBottom: 20 },
});

export default App;