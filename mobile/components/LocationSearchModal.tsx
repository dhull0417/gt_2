import React from 'react';
import { View, Modal, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import LocationSearchPanel from './LocationSearchPanel';
import { PlaceDetails } from '@/utils/api';

interface LocationSearchModalProps {
  visible: boolean;
  initialValue: string;
  placeholder?: string;
  onDone: (text: string, place?: PlaceDetails) => void;
  onCancel: () => void;
  // React Native doesn't reliably stack a second native <Modal> on top of one
  // that's already open (most visible on Android — it can render behind, or
  // simply not appear). When this is opened from inside a screen that's
  // already presented as a Modal (MeetupDetailModal, AddMeetupWizard), render
  // as a plain absolutely-positioned overlay within that existing Modal's own
  // tree instead of a second native Modal. Callers must render this OUTSIDE
  // their own KeyboardAvoidingView (a sibling, not a descendant) — otherwise
  // the ancestor shrinks this overlay's bounds when the keyboard opens, and
  // since the host Modal is transparent, the real screen behind it peeks
  // through the gap that opens up at the bottom.
  asOverlay?: boolean;
}

const LocationSearchModal = ({ visible, initialValue, placeholder, onDone, onCancel, asOverlay }: LocationSearchModalProps) => {
  // The blur backdrop always fills the full modal window, unaffected by the
  // keyboard — only the card itself (via its own KeyboardAvoidingView) shifts
  // up to stay clear of the keyboard.
  const content = (
    <>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centerWrap}
      >
        <View style={styles.card}>
          {visible && (
            <LocationSearchPanel
              initialValue={initialValue}
              placeholder={placeholder}
              onDone={onDone}
              onCancel={onCancel}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );

  if (asOverlay) {
    if (!visible) return null;
    return <View style={StyleSheet.absoluteFillObject}>{content}</View>;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {content}
    </Modal>
  );
};

const styles = StyleSheet.create({
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '88%',
    height: '85%',
    borderRadius: 28,
    backgroundColor: 'white',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
});

export default LocationSearchModal;
