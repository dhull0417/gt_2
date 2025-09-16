import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ViewToken } from 'react-native';

interface TimePickerProps {
  onTimeChange: (time: string) => void;
  initialValue?: string; // Can accept an initial time string
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const PERIODS = ['AM', 'PM'];
const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 3;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const TimePicker: React.FC<TimePickerProps> = ({ onTimeChange, initialValue }) => {
  const parseInitialTime = () => {
    if (!initialValue) return { initialHour: 5, initialMinute: '00', initialPeriod: 'PM' };
    const [time, period] = initialValue.split(' ');
    const [hour, minute] = time.split(':');
    return { initialHour: parseInt(hour, 10), initialMinute: minute, initialPeriod: period as 'AM' | 'PM' };
  };

  const { initialHour, initialMinute, initialPeriod } = parseInitialTime();
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  const [period, setPeriod] = useState(initialPeriod);

  const hourRef = useRef<FlatList>(null);
  const minuteRef = useRef<FlatList>(null);
  const periodRef = useRef<FlatList>(null);

  useEffect(() => {
    setTimeout(() => {
        hourRef.current?.scrollToIndex({ index: HOURS.indexOf(hour), animated: false });
        minuteRef.current?.scrollToIndex({ index: MINUTES.indexOf(minute), animated: false });
        periodRef.current?.scrollToIndex({ index: PERIODS.indexOf(period), animated: false });
    }, 100);
  }, []);

  useEffect(() => {
    onTimeChange(`${hour}:${minute} ${period}`);
  }, [hour, minute, period, onTimeChange]);

  // --- THIS IS THE FIX: Simplified and type-safe logic ---
  const handleViewableItemsChanged = (
    viewableItems: Array<ViewToken>, 
    setState: React.Dispatch<React.SetStateAction<any>>
  ) => {
    // Find the first item that FlatList has marked as "viewable"
    const centralItem = viewableItems.find(item => item.isViewable);
    
    // If a viewable item is found, update the state with its value
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
      <Text style={styles.title}>Set Meeting Time</Text>
      <View style={styles.pickersContainer}>
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
        <View style={styles.highlightView} pointerEvents="none" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickersContainer: {
    flexDirection: 'row',
    height: PICKER_HEIGHT,
    width: '90%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
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
    fontSize: 24,
    color: '#6B7280',
  },
  selectedItemText: {
    fontSize: 30,
    color: '#1F2937',
    fontWeight: 'bold',
  },
  highlightView: {
    position: 'absolute',
    top: ITEM_HEIGHT,
    height: ITEM_HEIGHT,
    width: '100%',
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#D1D5DB',
  },
});

export default TimePicker;