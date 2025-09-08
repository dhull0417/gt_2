import axios, { AxiosInstance } from "axios";
import { useAuth } from "@clerk/clerk-expo";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// Defines the shape of the schedule object
export interface Schedule {
  frequency: 'weekly' | 'monthly';
  day: number;
}

// Defines the shape of a single group object
export interface Group {
  _id: string;
  name: string;
  time: string;
  schedule?: Schedule; // Schedule is optional here
}

// Defines the payload for the create group request
interface CreateGroupPayload {
  name: string;
  time: string;
  schedule: Schedule | null; // Can be null
}

// Defines the shape of the data returned by the createGroup endpoint
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

// Preserved user API calls
export const userApi = {
  syncUser: (api: AxiosInstance) => api.post("/api/users/sync"),
  getCurrentUser: (api: AxiosInstance) => api.get("/api/users/me"),
  updateProfile: (api: AxiosInstance, data: any) => api.put("/api/users/profile", data),
};

export const groupApi = {
  // This function now handles the full payload including the optional schedule
  createGroup: async (api: AxiosInstance, payload: CreateGroupPayload): Promise<CreateGroupResponse> => {
    const response = await api.post<CreateGroupResponse>("/api/groups/create", payload);
    return response.data;
  },
  
  getGroups: async (api: AxiosInstance): Promise<Group[]> => {
    const response = await api.get<Group[]>("/api/groups");
    return response.data;
  },
};
