import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { GroupScheduleData } from '../components/createGroupModal';

const createGroupAPI = async (groupData: GroupScheduleData) => {
  const payload = {
    name: groupData.groupName,
    schedule: groupData.schedule,
  };

  const url = `${process.env.EXPO_PUBLIC_API_URL}/api/groups/create`;

  // --- Let's add logging here to see what we're sending ---
  console.log("Attempting to POST to URL:", url);
  console.log("Sending payload:", JSON.stringify(payload, null, 2));

  try {
    const { data } = await axios.post(url, payload);
    return data;
  } catch (error) {
    // --- This will catch the error and prevent the crash ---
    console.error("--- AXIOS ERROR ---");
    if (axios.isAxiosError(error)) {
        console.error("Axios error message:", error.message);
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error("Response data:", error.response.data);
            console.error("Response status:", error.response.status);
        } else if (error.request) {
            // The request was made but no response was received
            console.error("No response received. Is the server running? Is the URL correct?");
            console.error("Request details:", error.request);
        }
    } else {
        // Something else happened in setting up the request that triggered an Error
        console.error('An unexpected error occurred:', error);
    }
    // Re-throw the error so React Query knows the mutation failed
    throw error;
  }
};

export const useCreateGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createGroupAPI,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      console.log("Group created successfully and list will update!");
    },
    onError: (error) => {
      // This will now catch the error thrown from the try...catch block
      alert('Failed to create group. Check the console for details.');
    },
  });
};