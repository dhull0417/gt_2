import { useEffect, useState } from 'react';
import * as Contacts from 'expo-contacts';
import { useQuery } from '@tanstack/react-query';
import { useApiClient, userApi, User } from '../utils/api';

export interface ContactEntry {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  appUser?: User;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // US: 10 digits → prepend country code
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

export function useContactMatching() {
  const api = useApiClient();
  const [permissionStatus, setPermissionStatus] = useState<Contacts.PermissionStatus | null>(null);
  const [rawContacts, setRawContacts] = useState<Contacts.ExistingContact[]>([]);

  const [isReading, setIsReading] = useState(true);

  // Asks for contacts access when the screen opens, then reads names, emails and phone numbers.
  // Nothing is stored: the numbers/emails are only sent to the server to find which friends already use GroupThat.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (cancelled) return;
        setPermissionStatus(status);
        if (status !== Contacts.PermissionStatus.GRANTED) return;
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
          sort: Contacts.SortTypes.FirstName,
        });
        if (!cancelled) setRawContacts(data);
      } catch {
        // Treated like "no contacts": the screen still offers the invite link.
      } finally {
        if (!cancelled) setIsReading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const emailSet = new Set<string>();
  const phoneSet = new Set<string>();
  for (const contact of rawContacts) {
    for (const e of contact.emails ?? []) if (e.email) emailSet.add(e.email.toLowerCase());
    for (const p of contact.phoneNumbers ?? []) if (p.number) phoneSet.add(normalizePhone(p.number));
  }
  // The server only looks at the first 500 of each, so send them in a stable order.
  const emails = [...emailSet].slice(0, 500);
  const phoneNumbers = [...phoneSet].slice(0, 500);

  const { data: matchedUsers = [], isLoading: isMatching } = useQuery({
    queryKey: ['contactMatching', emails.join(','), phoneNumbers.join(',')],
    queryFn: () => userApi.matchContacts(api, emails, phoneNumbers),
    enabled: emails.length > 0 || phoneNumbers.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  // Build lookup: email or phone → User
  const userByIdentifier: Record<string, User> = {};
  for (const user of matchedUsers) {
    if (user.email) userByIdentifier[user.email.toLowerCase()] = user;
    if (user.phoneNumber) userByIdentifier[normalizePhone(user.phoneNumber)] = user;
  }

  // Build unified list — one entry per contact, deduped by name+phone
  const seen = new Set<string>();
  const contacts: ContactEntry[] = [];

  for (const contact of rawContacts) {
    const name = contact.name ?? '';
    const allEmails = (contact.emails ?? []).map((e) => e.email?.toLowerCase()).filter(Boolean) as string[];
    const allPhones = (contact.phoneNumbers ?? []).map((p) => (p.number ? normalizePhone(p.number) : '')).filter(Boolean);
    const email = allEmails[0];
    const phone = allPhones[0];
    if (!name && !email && !phone) continue;

    const dedupeKey = `${name}|${phone ?? email ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const appUser =
      allEmails.map((e) => userByIdentifier[e]).find(Boolean) ||
      allPhones.map((p) => userByIdentifier[p]).find(Boolean) ||
      undefined;

    contacts.push({
      id: contact.id ?? dedupeKey,
      name,
      phone,
      email,
      appUser,
    });
  }

  // GroupThat users first, then alphabetical
  contacts.sort((a, b) => {
    if (a.appUser && !b.appUser) return -1;
    if (!a.appUser && b.appUser) return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    contacts,
    isLoading: isReading || isMatching,
    permissionDenied: permissionStatus === Contacts.PermissionStatus.DENIED,
  };
}
