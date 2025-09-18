import { useSocialAuth } from "@/hooks/useSocialAuth";
import { Text, Image, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { Link } from "expo-router";

export default function Index() {
  const { handleSocialAuth, isLoading } = useSocialAuth();
  return (
    <View className="flex-1 bg-white">
      <View className="flex-1 px-8 justify-between">
        <View className="flex-1 justify-center">
          <View className="items-center">
            <Image source={require("../../assets/images/gt-logo.png")}
              className="size-96"
              resizeMode="contain"
            />
          </View>

          <View className="flex-col gap-2">
            <TouchableOpacity 
              className="flex-row items-center justify-center bg-white border border-gray-300 rounded-full py-3 px-6"
              onPress={() => handleSocialAuth("oauth_google")}
              disabled={isLoading}
              style={{ elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 }}
            >
              {isLoading ? <ActivityIndicator size="small" color="#000" /> : (
                <View className="flex-row items-center justify-center">
                  <Image source={require("../../assets/images/google-logo.png")} className="size-8 mr-3" resizeMode="contain" />
                  <Text className="text-black font-medium text-base">Continue with Google</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              className="flex-row items-center justify-center bg-white border border-gray-300 rounded-full py-3 px-6"
              onPress={() => handleSocialAuth("oauth_apple")}
              disabled={isLoading}
              style={{ elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 }}
            >
              {isLoading ? <ActivityIndicator size="small" color="#000" /> : (
                <View className="flex-row items-center justify-center">
                  <Image source={require("../../assets/images/apple-logo.png")} className="size-8 mr-3" resizeMode="contain" />
                  <Text className="text-black font-medium text-base">Continue with Apple</Text>
                </View>
              )}
            </TouchableOpacity>

            <View className="flex-row items-center my-4">
                <View className="flex-1 h-px bg-gray-300" />
                <Text className="mx-4 text-gray-500">or</Text>
                <View className="flex-1 h-px bg-gray-300" />
            </View>

            <Link href="/(auth)/sign-in" asChild>
              <TouchableOpacity 
                className="flex-row items-center justify-center bg-white border border-gray-300 rounded-full py-3 px-6"
                style={{ elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 }}
              >
                <Text className="text-black font-medium text-base">
                  Continue with Username
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
          <View>
            <Text className="text-center text-gray-500 text-xs leading-4 mt-6 px-2">
              By signing up, you agree to our
              <Text className="text-blue-500"> Terms</Text>, 
              <Text className="text-blue-500"> Privacy Policy</Text>, and 
              <Text className="text-blue-500"> Cookie Use</Text> 
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}