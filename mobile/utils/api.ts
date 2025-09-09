import axios, { AxiosInstance } from "axios";
import { useAuth } from "@clerk/clerk-expo";
import { useMemo } from "react"; // Import useMemo

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// --- Interfaces remain the same ---
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
  schedule?: Schedule;
  owner: string;
}
export interface GroupDetails extends Group {
  members: User[];
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

// --- FIX: Create a single, stable API client instance ---
export const useApiClient = (): AxiosInstance => {
  const { getToken } = useAuth();
  // useMemo ensures that createApiClient is only called once, creating a single,
  // stable instance of the Axios client that is reused across all re-renders.
  return useMemo(() => createApiClient(getToken), [getToken]);
};

export const userApi = {
  syncUser: (api: AxiosInstance) => api.post("/api/users/sync"),

  // FIX: This function will now "unwrap" the user object from the response
  getCurrentUser: async (api: AxiosInstance): Promise<User> => {
    // The backend now consistently returns { user: User }, so we expect that shape.
    const response = await api.get<{ user: User }>("/api/users/me");
    // We return the nested user object so the rest of the app doesn't need to know.
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
  }
};