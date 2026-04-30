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
  const [rawContacts, setRawContacts] = useState<Contacts.Contact[]>([]);

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      setPermissionStatus(status);
      if (status !== Contacts.PermissionStatus.GRANTED) return;

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });
      setRawContacts(data);
    })();
  }, []);

  const emails: string[] = [];
  const phoneNumbers: string[] = [];
  const contactIndex: Record<string, { name: string; phone?: string; email?: string }> = {};

  for (const contact of rawContacts) {
    const name = contact.name ?? '';
    const email = contact.emails?.[0]?.email?.toLowerCase();
    const phone = contact.phoneNumbers?.[0]?.number
      ? normalizePhone(contact.phoneNumbers[0].number)
      : undefined;

    if (email) {
      emails.push(email);
      contactIndex[email] = { name, phone, email };
    }
    if (phone) {
      phoneNumbers.push(phone);
      if (!contactIndex[phone]) contactIndex[phone] = { name, phone, email };
    }
  }

  const { data: matchedUsers = [], isLoading } = useQuery({
    queryKey: ['contactMatching', emails.length, phoneNumbers.length],
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
    const email = contact.emails?.[0]?.email?.toLowerCase();
    const phone = contact.phoneNumbers?.[0]?.number
      ? normalizePhone(contact.phoneNumbers[0].number)
      : undefined;

    const dedupeKey = `${name}|${phone ?? email ?? ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const appUser = (email && userByIdentifier[email]) || (phone && userByIdentifier[phone]) || undefined;

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

  return { contacts, isLoading, permissionDenied: permissionStatus === Contacts.PermissionStatus.DENIED };
}
