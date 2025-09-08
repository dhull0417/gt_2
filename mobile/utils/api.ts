import axios, { AxiosInstance } from "axios";
import { useAuth } from "@clerk/clerk-expo";

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
  profilePicture?: string; // Added for displaying member images
}

export interface Group {
  _id: string;
  name: string;
  time: string;
  schedule?: Schedule;
  owner: string;
}

// --- ADDED: Interface for the detailed group response ---
export interface GroupDetails extends Group {
  members: User[]; // The members array is now populated with User objects
}

interface CreateGroupPayload {
  name: string;
  time: string;
  schedule: Schedule | null;
}

interface AddMemberPayload {
  groupId: string;
  userId: string;
}

interface CreateGroupResponse {
  group: Group;
  message: string;
}

export const createApiClient = (getToken: () => Promise<string | null>): AxiosInstance => {
  const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { "User-Agent": "GT2MobileApp/1.0" }
  });

  api.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return api;
};

export const useApiClient = (): AxiosInstance => {
  const { getToken } = useAuth();
  return createApiClient(getToken);
};

export const userApi = {
  syncUser: (api: AxiosInstance) => api.post("/api/users/sync"),
  getCurrentUser: async (api: AxiosInstance): Promise<User> => {
    const response = await api.get<User>("/api/users/me");
    return response.data;
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

  // --- ADDED: New function to get details for a single group ---
  getGroupDetails: async (api: AxiosInstance, groupId: string): Promise<GroupDetails> => {
    const response = await api.get<GroupDetails>(`/api/groups/${groupId}`);
    return response.data;
  }
};
