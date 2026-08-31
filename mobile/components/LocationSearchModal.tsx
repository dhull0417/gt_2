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
  // RN can't reliably stack a second native Modal. Set this when already inside
  // a Modal (MeetupDetailModal, AddMeetupWizard) to render as a plain overlay
  // instead. Render as a sibling of the caller's KeyboardAvoidingView, not
  // nested — else the keyboard shrinks it and the screen behind peeks through.
  asOverlay?: boolean;
}

const LocationSearchModal = ({ visible, initialValue, placeholder, onDone, onCancel, asOverlay }: LocationSearchModalProps) => {
  // Backdrop blur fills the whole window; only the card shifts for the keyboard
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
