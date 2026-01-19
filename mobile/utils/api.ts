import axios, { AxiosInstance } from "axios";
import { useAuth } from "@clerk/clerk-expo";
import { useMemo } from "react";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// Exporting a central Frequency type to resolve mismatches across the app
export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom' | 'once';

export interface CustomRule {
  type: 'byDay' | 'byDate';
  occurrence?: '1st' | '2nd' | '3rd' | '4th' | '5th' | 'Last';
  day?: number;   // 0-6
  dates?: number[]; // 1-31
}

export interface Schedule {
  frequency: Frequency;
  days: number[];
  rules?: CustomRule[];
}

export interface User {
  _id: string;
  clerkId: string;
  email: string;
  phone: string;
  username: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  groups?: string[];
  streamToken: string;
}

export interface LastMessage {
  text: string;
  user: {
    name: string;
  };
}

export interface Group {
  _id: string;
  name: string;
  time: string;
  schedule: Schedule;
  owner: string;
  timezone: string;
  /**
   * Location Feature: The group-wide default location.
   */
  defaultLocation: string;
  lastMessage?: LastMessage | null;
  /**
   * moderators field added to the base Group interface.
   * This allows any group object (in lists or details) to optionally include moderator info.
   */
  moderators?: (User | string)[];
}

export interface GroupDetails extends Group {
  members: User[];
  defaultCapacity: number; // The limit that new events inherit
}

export interface Event {
  _id: string;
  group: {
    _id: string;
    owner: string;
  };
  name: string;
  date: string;
  time: string;
  timezone: string;
  /**
   * Location Feature: The location specific to this meeting instance.
   */
  location: string;
  status: 'scheduled' | 'cancelled'; 
  capacity: number; 
  isOverride: boolean;
  members: User[];
  undecided: string[];
  in: string[];
  out: string[];
  waitlist: string[]; 
}

export interface Notification {
  _id: string;
  recipient: string;
  sender: User;
  type: 'group-invite' | 'invite-accepted' | 'invite-declined' | 'group-added';
  group: Group;
  status: 'pending' | 'accepted' | 'declined' | 'read';
  read: boolean;
  createdAt: string;
}

interface CreateGroupPayload {
  name: string;
  time: string;
  schedule: Schedule;
  timezone: string;
  eventsToDisplay: number;
  members?: string[];
  defaultCapacity?: number;
  defaultLocation?: string; // Added for Location Feature
}

interface UpdateGroupPayload {
  groupId: string;
  name?: string;
  time: string;
  schedule: Schedule;
  timezone: string;
  eventsToDisplay: number;
  defaultCapacity?: number;
  defaultLocation?: string; // Added for Location Feature
}

interface AddMemberPayload {
  groupId: string;
  userId: string;
}

interface InviteUserPayload {
  groupId: string;
  userIdToInvite: string;
}

interface RemoveMemberPayload {
  groupId: string;
  memberIdToRemove: string;
}

interface UpdateEventPayload {
  eventId: string;
  date: Date;
  time: string;
  timezone: string;
  capacity?: number;
  location?: string; // Added for Location Feature
}

interface RsvpPayload {
  eventId: string;
  status: 'in' | 'out';
}

interface CreateGroupResponse {
  group: Group;
  message: string;
}

interface CreateOneOffEventPayload {
  groupId: string;
  date: Date;
  time: string;
  timezone: string;
  capacity?: number;
  location?: string; // Added for Location Feature
}

interface RemoveScheduledDayPayload {
  groupId: string;
  day: number;
  frequency: Frequency;
  rules?: any[];
}

interface UpdateModeratorsPayload {
  groupId: string;
  moderatorIds: string[];
}

export const createApiClient = (getToken: () => Promise<string | null>): AxiosInstance => {
  const api = axios.create({ 
    baseURL: API_BASE_URL, 
    headers: { 
      "User-Agent": "GT2MobileApp/1.0",
      "Content-Type": "application/json"
    } 
  });
  
  api.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  return api;
};

export const useApiClient = (): AxiosInstance => {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(getToken), [getToken]);
};

export const userApi = {
  syncUser: (api: AxiosInstance) => api.post("/api/users/sync"),
  getCurrentUser: async (api: AxiosInstance): Promise<User> => {
    const response = await api.get<{ user: User }>("/api/users/me");
    return response.data.user;
  },
  updateProfile: (api: AxiosInstance, data: any) => api.put("/api/users/profile", data),
  searchUsers: async (api: AxiosInstance, username: string): Promise<User[]> => {
    const response = await api.get<User[]>(`/api/users/search?username=${username}`);
    return response.data;
  },
};

export const groupApi = {
  createGroup: async (api: AxiosInstance, payload: CreateGroupPayload): Promise<CreateGroupResponse> => {
    const response = await api.post<CreateGroupResponse>("/api/groups/create", payload);
    return response.data;
  },
  updateGroup: async (api: AxiosInstance, { groupId, ...details }: UpdateGroupPayload): Promise<{ group: Group }> => {
    const response = await api.put<{ group: Group }>(`/api/groups/${groupId}`, details);
    return response.data;
  },
  createOneOffEvent: async (api: AxiosInstance, { groupId, ...details }: CreateOneOffEventPayload): Promise<{ event: Event }> => {
    const response = await api.post<{ event: Event }>(`/api/groups/${groupId}/events`, details);
    return response.data;
  },
  removeScheduledDay: async (api: AxiosInstance, payload: RemoveScheduledDayPayload): Promise<{ message: string }> => {
    const response = await api.post(`/api/groups/${payload.groupId}/schedule/remove`, { day: payload.day, frequency: payload.frequency });
    return response.data;
  },
  inviteUser: async (api: AxiosInstance, payload: InviteUserPayload): Promise<{ message: string }> => {
    const response = await api.post(`/api/groups/${payload.groupId}/invite`, { userIdToInvite: payload.userIdToInvite });
    return response.data;
  },
  getGroups: async (api: AxiosInstance): Promise<Group[]> => {
    const response = await api.get<Group[]>("/api/groups");
    return response.data;
  },
  addMember: async (api: AxiosInstance, { groupId, userId }: AddMemberPayload): Promise<{ message: string }> => {
    const response = await api.post(`/api/groups/${groupId}/add-member`, { userId });
    return response.data;
  },
  getGroupDetails: async (api: AxiosInstance, groupId: string): Promise<GroupDetails> => {
    const response = await api.get<GroupDetails>(`/api/groups/${groupId}`);
    return response.data;
  },
  deleteGroup: async (api: AxiosInstance, groupId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/api/groups/${groupId}`);
    return response.data;
  },
  leaveGroup: async (api: AxiosInstance, groupId: string): Promise<{ message: string }> => {
    const response = await api.post(`/api/groups/${groupId}/leave`);
    return response.data;
  },
  removeMember: async (api: AxiosInstance, payload: RemoveMemberPayload): Promise<{ message: string }> => {
    const response = await api.post(`/api/groups/${payload.groupId}/remove-member`, { memberIdToRemove: payload.memberIdToRemove });
    return response.data;
  },
  updateGroupSchedule: async (api: AxiosInstance, groupId: string, data: any): Promise<{ message: string }> => {
    const response = await api.patch(`/api/groups/${groupId}/schedule`, data);
    return response.data;
  },
  /**
   * New method for managing moderators.
   */
  updateModerators: async (api: AxiosInstance, { groupId, moderatorIds }: UpdateModeratorsPayload): Promise<{ message: string }> => {
    const response = await api.patch(`/api/groups/${groupId}/moderators`, { moderatorIds });
    return response.data;
  }
};

export const eventApi = {
  getEvents: async (api: AxiosInstance): Promise<Event[]> => {
    const response = await api.get<Event[]>("/api/events");
    return response.data;
  },
  handleRsvp: async (api: AxiosInstance, { eventId, status }: RsvpPayload): Promise<{ message: string }> => {
    const response = await api.post(`/api/events/${eventId}/rsvp`, { status });
    return response.data;
  },
  updateEvent: async (api: AxiosInstance, { eventId, ...details }: UpdateEventPayload): Promise<{ event: Event }> => {
    const response = await api.put<{ event: Event }>(`/api/events/${eventId}`, details);
    return response.data;
  },
  deleteEvent: async (api: AxiosInstance, eventId: string): Promise<{ message: string }> => {
    const response = await api.delete(`/api/events/${eventId}`);
    return response.data;
  },
  cancelEvent: async (api: AxiosInstance, eventId: string): Promise<{ message: string }> => {
    const response = await api.patch(`/api/events/${eventId}/cancel`);
    return response.data;
  }
};

export const notificationApi = {
  getNotifications: async (api: AxiosInstance): Promise<Notification[]> => {
    const response = await api.get<Notification[]>('/api/notifications');
    return response.data;
  },
  acceptInvite: async (api: AxiosInstance, notificationId: string): Promise<{ message: string }> => {
    const response = await api.post(`/api/notifications/${notificationId}/accept`);
    return response.data;
  },
  declineInvite: async (api: AxiosInstance, notificationId: string): Promise<{ message: string }> => {
    const response = await api.post(`/api/notifications/${notificationId}/decline`);
    return response.data;
  },
  markNotificationsAsRead: async (api: AxiosInstance): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>('/api/notifications/mark-read');
    return response.data;
  },
};

export const chatApi = {
  getClientToken: async (api: AxiosInstance): Promise<string> => {
    const response = await api.post<{ token: string }>("/api/chat/token");
    return response.data.token;
  },
};