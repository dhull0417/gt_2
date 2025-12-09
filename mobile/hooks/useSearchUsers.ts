import { useState, useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { useApiClient, userApi } from "../utils/api";

// 1. Helper Hook: Delays the update until you stop typing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export const useSearchUsers = (username: string) => {
  const api = useApiClient();
  
  // 2. Wait 500ms after typing stops before updating this variable
  const debouncedUsername = useDebounce(username, 500);

  return useQuery({
    // Use the *debounced* name for the key (so it caches the final word, not every letter)
    queryKey: ['userSearch', debouncedUsername],
    
    queryFn: () => {
        if (!debouncedUsername || debouncedUsername.trim() === "") return [];
        return userApi.searchUsers(api, debouncedUsername);
    },
    
    // Only run if the debounced string has content
    // (I removed the > 2 length check because the 500ms delay prevents spam anyway, allowing users to search for short names like "Al")
    enabled: !!debouncedUsername && debouncedUsername.length > 0,
    
    staleTime: 1000 * 60, // Cache results for 1 minute (Your existing setting)
  });
};