import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ViewToken } from 'react-native';

interface TimePickerProps {
  onTimeChange: (time: string) => void;
  initialValue?: string; // Can accept an initial time string
  hideLabel?: boolean;   // Prop to toggle the internal label
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));
const PERIODS = ['AM', 'PM'];
const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

/**
 * Custom Wheel TimePicker
 * Uses FlatLists to create a smooth scrolling selection experience.
 */
const TimePicker: React.FC<TimePickerProps> = ({ onTimeChange, initialValue, hideLabel = false }) => {
  const parseInitialTime = () => {
    if (!initialValue) return { initialHour: 5, initialMinute: '00', initialPeriod: 'PM' };
    const [time, period] = initialValue.split(' ');
    const [hour, minute] = time.split(':');
    return { 
      initialHour: parseInt(hour, 10), 
      initialMinute: minute, 
      initialPeriod: period as 'AM' | 'PM' 
    };
  };

  const { initialHour, initialMinute, initialPeriod } = parseInitialTime();
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  const [period, setPeriod] = useState(initialPeriod);

  const hourRef = useRef<FlatList>(null);
  const minuteRef = useRef<FlatList>(null);
  const periodRef = useRef<FlatList>(null);

  // Scroll to initial values on mount
  useEffect(() => {
    const timer = setTimeout(() => {
        hourRef.current?.scrollToIndex({ index: HOURS.indexOf(hour), animated: false });
        minuteRef.current?.scrollToIndex({ index: MINUTES.indexOf(minute), animated: false });
        periodRef.current?.scrollToIndex({ index: PERIODS.indexOf(period), animated: false });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Update parent whenever selection changes
  useEffect(() => {
    onTimeChange(`${hour.toString().padStart(2, '0')}:${minute} ${period}`);
  }, [hour, minute, period, onTimeChange]);

  // Type-safe logic for detecting the central item in the "wheel"
  const handleViewableItemsChanged = (
    viewableItems: Array<ViewToken>, 
    setState: React.Dispatch<React.SetStateAction<any>>
  ) => {
    const centralItem = viewableItems.find(item => item.isViewable);
    if (centralItem && typeof centralItem.item !== 'undefined') {
        setState(centralItem.item);
    }
  };
  
  const onViewableHourChanged = useCallback(({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
    handleViewableItemsChanged(viewableItems, setHour);
  }, []);

  const onViewableMinuteChanged = useCallback(({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
    handleViewableItemsChanged(viewableItems, setMinute);
  }, []);

  const onViewablePeriodChanged = useCallback(({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
    handleViewableItemsChanged(viewableItems, setPeriod);
  }, []);

  const viewabilityConfig = { itemVisiblePercentThreshold: 50 };
  
  const renderItem = (item: string | number, selectedValue: string | number) => (
    <View style={styles.itemWrapper}>
      <Text style={[styles.itemText, item === selectedValue && styles.selectedItemText]}>
        {item}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      
      <View style={styles.pickersContainer}>
        {/* Hour Column */}
        <FlatList
          ref={hourRef}
          data={HOURS}
          renderItem={({ item }) => renderItem(item, hour)}
          keyExtractor={(item) => `h-${item}`}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          style={styles.picker}
          contentContainerStyle={styles.listContentContainer}
          onViewableItemsChanged={onViewableHourChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        />

        {/* Minute Column */}
        <FlatList
          ref={minuteRef}
          data={MINUTES}
          renderItem={({ item }) => renderItem(item, minute)}
          keyExtractor={(item) => `m-${item}`}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          style={styles.picker}
          contentContainerStyle={styles.listContentContainer}
          onViewableItemsChanged={onViewableMinuteChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        />

        {/* Period Column (AM/PM) */}
        <FlatList
          ref={periodRef}
          data={PERIODS}
          renderItem={({ item }) => renderItem(item, period)}
          keyExtractor={(item) => `p-${item}`}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          style={styles.picker}
          contentContainerStyle={styles.listContentContainer}
          onViewableItemsChanged={onViewablePeriodChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        />

        {/* Visual Overlay for the selection area */}
        <View style={styles.highlightView} pointerEvents="none" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 12, 
    fontWeight: 'bold', 
    color: '#9CA3AF', 
    textTransform: 'uppercase', 
    marginBottom: 8, 
    marginTop: 16,
    textAlign: 'center',
  },
  pickersContainer: {
    flexDirection: 'row',
    height: PICKER_HEIGHT,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden'
  },
  picker: {
    flex: 1,
    height: PICKER_HEIGHT,
  },
  listContentContainer: {
    paddingVertical: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
  },
  itemWrapper: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 22,
    color: '#9CA3AF',
  },
  selectedItemText: {
    fontSize: 26,
    color: '#4F46E5',
    fontWeight: '900',
  },
  highlightView: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    height: ITEM_HEIGHT,
    width: '100%',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EEF2FF',
    backgroundColor: 'rgba(79, 70, 229, 0.05)',
  },
});

export default TimePicker;