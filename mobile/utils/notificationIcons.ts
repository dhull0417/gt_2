import { ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';
import { NotificationType } from './api';

type FeatherIconName = ComponentProps<typeof Feather>['name'];

interface NotificationIconSpec {
  name: FeatherIconName;
  color: string;
}

const DEFAULT_ICON: NotificationIconSpec = { name: 'bell', color: '#6B7280' };

const NOTIFICATION_ICONS: Record<NotificationType, NotificationIconSpec> = {
  'group-invite': { name: 'user-plus', color: '#3B82F6' },
  'invite-accepted': { name: 'check-circle', color: '#10B981' },
  'invite-declined': { name: 'x-circle', color: '#EF4444' },
  'group-added': { name: 'users', color: '#6366F1' },
  'group-updated': { name: 'edit-2', color: '#6366F1' },
  'meetup-rsvp-in': { name: 'log-in', color: '#4FD1C5' },
  'meetup-rsvp-out': { name: 'log-out', color: '#FF7A6E' },
  'meetup-rsvp-admin-in': { name: 'user-check', color: '#4FD1C5' },
  'meetup-rsvp-admin-out': { name: 'user-x', color: '#FF7A6E' },
  'meetup-waitlist-join': { name: 'clock', color: '#F59E0B' },
  'waitlist-promotion': { name: 'arrow-up-circle', color: '#A855F7' },
  'meetup-created': { name: 'calendar', color: '#22C55E' },
  'meetup-updated': { name: 'edit-3', color: '#F59E0B' },
  'meetup-cancelled': { name: 'slash', color: '#EF4444' },
  'meetup-rsvp-reminder': { name: 'bell', color: '#3B82F6' },
  'meetup-rsvp-open': { name: 'unlock', color: '#14B8A6' },
  'meetup-starting-soon': { name: 'watch', color: '#F97316' },
  'poll-created': { name: 'bar-chart-2', color: '#8B5CF6' },
  'poll-closed': { name: 'flag', color: '#6B7280' },
};

export const getNotificationIcon = (type: string): NotificationIconSpec =>
  NOTIFICATION_ICONS[type as NotificationType] || DEFAULT_ICON;
