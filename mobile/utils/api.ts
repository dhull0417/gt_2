import axios, { AxiosInstance, AxiosResponse } from "axios";
import * as SecureStore from 'expo-secure-store';

// Define the shape of a single group object
// This can be shared between the frontend and backend
export interface Group {
  _id: string;
  name: string;
  time: string;
}

// This is the type for the object you are sending when creating a group
interface CreateGroupPayload {
  name: string;
  time: string;
}

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.client.interceptors.request.use(
      async (config) => {
        const token = await SecureStore.getItemAsync('clerk-token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  // Ensure the generic type T is used for the response data
  async get<T>(url: string, params?: object): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, { params });
  }

  async post<T>(url:string, data: object): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data);
  }
}

export const groupApi = {
  // --- THIS IS THE FUNCTION TO CHANGE ---
  // We specify that the 'get' call will return a response containing an array of Group objects.
  getGroups: async(api: ApiClient) => {
    return api.get<Group[]>("/groups");
  },
 
  createGroup: async (api: ApiClient, payload: CreateGroupPayload) => {
    return api.post('/groups/create', payload);
  },
};

const API_URL = process.env.EXPO_PUBLIC_API_URL;
if (!API_URL) {
    throw new Error("Missing EXPO_PUBLIC_API_URL environment variable");
}

const api = new ApiClient(API_URL);

export const useApiClient = () => {
    return api;
}