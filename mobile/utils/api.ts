import axios, { AxiosInstance } from "axios";
import { useAuth } from "@clerk/clerk-expo";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL

export const createApiClient = (getToken:() => Promise<string|null>):AxiosInstance => {
    const api = axios.create({baseURL:API_BASE_URL});

    api.interceptors.request.use(async (config) => {
        const token = await getToken();

        // LOGGING RECOMMENDATION: Check if a token was retrieved
        console.log("Retrieved token:", token ? "Token retrieved" : "No token found");

        if(token) {
            config.headers.Authorization = `Bearer ${token}`
        }
        
        // LOGGING RECOMMENDATION: Check the headers just before the request is sent
        console.log("Request headers:", config.headers);

        return config;
    });

    return api;
};

export const useApiClient = (): AxiosInstance => {
    const {getToken}= useAuth();
    return createApiClient(getToken);
};

export interface RecurrenceRule {
    frequency: 'weekly' | 'monthly';
    interval: number;
    daysOfWeek?: number[];
    daysOfMonth?: number[];
}