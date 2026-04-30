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

export const useSearchUsers = (query: string) => {
  const api = useApiClient();

  const debouncedQuery = useDebounce(query, 500);

  return useQuery({
    queryKey: ['userSearch', debouncedQuery],

    queryFn: () => {
        if (!debouncedQuery || debouncedQuery.trim() === "") return [];
        return userApi.searchUsers(api, debouncedQuery);
    },

    enabled: !!debouncedQuery && debouncedQuery.length > 0,

    staleTime: 1000 * 60,
  });
};