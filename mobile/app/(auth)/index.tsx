import { useSocialAuth } from "@/hooks/useSocialAuth";
import { Text, Image, View, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router"; // 1. Import useRouter
import { SafeAreaView } from "react-native-safe-area-context";

export default function Index() {
  const { handleSocialAuth, isLoading } = useSocialAuth();
  const router = useRouter(); // 2. Get the router instance

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
          <View style={styles.logoContainer}>
            <Image 
              source={require("../../assets/images/gt-logo.png")}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.buttonGroup}>
            <TouchableOpacity 
              style={[styles.button, styles.shadow]}
              onPress={() => handleSocialAuth("oauth_google")}
              disabled={isLoading}
            >
              {isLoading ? <ActivityIndicator size="small" color="#000" /> : (
                <View style={styles.buttonContent}>
                  <Image source={require("../../assets/images/google-logo.png")} style={styles.iconImage} resizeMode="contain" />
                  <Text style={styles.buttonText}>Continue with Google</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.shadow]}
              onPress={() => handleSocialAuth("oauth_apple")}
              disabled={isLoading}
            >
              {isLoading ? <ActivityIndicator size="small" color="#000" /> : (
                <View style={styles.buttonContent}>
                  <Image source={require("../../assets/images/apple-logo.png")} style={styles.iconImage} resizeMode="contain" />
                  <Text style={styles.buttonText}>Continue with Apple</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.separatorContainer}>
                <View style={styles.separatorLine} />
                <Text style={styles.separatorText}>or</Text>
                <View style={styles.separatorLine} />
            </View>

            {/* --- THIS IS THE FIX --- */}
            {/* Replaced <Link> with a standard TouchableOpacity that uses router.push */}
            <TouchableOpacity 
              style={[styles.button, styles.shadow]}
              onPress={() => router.push('/(auth)/sign-in')}
            >
              <View style={styles.buttonContent}>
                  <Text style={styles.buttonText}>Continue with Username</Text>
              </View>
            </TouchableOpacity>
          </View>
          
          <View>
            <Text style={styles.footerText}>
              By signing up, you agree to our
              <Text style={styles.linkText}> Terms</Text>, 
              <Text style={styles.linkText}> Privacy Policy</Text>, and 
              <Text style={styles.linkText}> Cookie Use</Text> 
            </Text>
          </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  logoImage: {
    width: 384,
    height: 384,
  },
  buttonGroup: {
    gap: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 9999,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: {
    width: 32,
    height: 32,
    marginRight: 12,
  },
  buttonText: {
    color: '#000000',
    fontWeight: '500',
    fontSize: 16,
  },
  separatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D1D5DB',
  },
  separatorText: {
    marginHorizontal: 16,
    color: '#6B7280',
  },
  footerText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 24,
    paddingHorizontal: 8,
  },
  linkText: {
    color: '#3B82F6',
  },
});