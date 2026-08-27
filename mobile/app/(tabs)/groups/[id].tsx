// Android reaches Group Details here, nested under the Groups tab's own stack,
// so the tab bar stays visible while browsing group info (and, unlike iOS, can
// actually be reset back to the list by tapping the tab again — see
// AndroidTabBar.tsx). iOS instead gets its own root-level copy of this same
// screen at app/group-details/[id].tsx, entirely outside (tabs), because its
// native tab bar has no such reset mechanism — see that file for why.
export { default } from '@/components/GroupDetailsScreen';
