import axios, { AxiosInstance } from "axios";
import { useAuth } from "@clerk/clerk-expo";
import { useMemo } from "react";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export interface Schedule {
  frequency: 'weekly' | 'monthly';
  day: number;
}
export interface User {
  _id: string;
  clerkId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
}
export interface Group {
  _id: string;
  name: string;
  time: string;
  schedule: Schedule;
  owner: string;
  timezone: string;
}
export interface GroupDetails extends Group {
  members: User[];
}
export interface Event {
  _id: string;
  group: string;
  name: string;
  date: string;
  time: string;
  members: User[];
  undecided: string[];
  in: string[];
  out: string[];
}
interface CreateGroupPayload {
  name: string;
  time: string;
  schedule: Schedule;
  timezone: string;
}
interface AddMemberPayload {
  groupId: string;
  userId: string;
}
interface RsvpPayload {
  eventId: string;
  status: 'in' | 'out';
}
interface CreateGroupResponse {
  group: Group;
  message: string;
}

export const createApiClient = (getToken: () => Promise<string | null>): AxiosInstance => {
  const api = axios.create({ baseURL: API_BASE_URL, headers: { "User-Agent": "GT2MobileApp/1.0" } });
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
};
export const groupApi = {
  createGroup: async (api: AxiosInstance, payload: CreateGroupPayload): Promise<CreateGroupResponse> => {
    const response = await api.post<CreateGroupResponse>("/api/groups/create", payload);
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
  }
};