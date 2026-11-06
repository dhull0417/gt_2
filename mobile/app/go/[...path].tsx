import { Redirect, useLocalSearchParams } from 'expo-router';

// Email buttons link to https://<backend>/go/<dest>[/<id>]. With the app installed,
// iOS Universal Links / Android App Links open those URLs here instead of in the browser,
// so map them to the matching screen (same targets as the backend's /go page).
const OBJECT_ID = /^[a-f0-9]{24}$/i;

export default function GoLink() {
  const { path } = useLocalSearchParams<{ path?: string | string[] }>();
  const [dest, id] = Array.isArray(path) ? path : path ? [path] : [];

  if (dest === 'groups') return <Redirect href="/groups" />;
  if (dest === 'create-group') return <Redirect href="/create-group" />;
  if (dest === 'premium') return <Redirect href="/paywall" />;
  if (dest === 'group' && id && OBJECT_ID.test(id)) {
    return <Redirect href={{ pathname: '/group-details/[id]', params: { id } }} />;
  }
  if (dest === 'meetup' && id && OBJECT_ID.test(id)) {
    return <Redirect href={{ pathname: '/', params: { openMeetupId: id } }} />;
  }
  // meetups, open, or anything unknown: Home
  return <Redirect href="/" />;
}
