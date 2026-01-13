import { Redirect } from 'expo-router';

export default function SsoCallback() {
  // This component matches the "groupthat://sso-callback" route.
  // It simply redirects the user to the root index, allowing the 
  // auth provider to process the token in the URL params.
  return <Redirect href="/" />;
}