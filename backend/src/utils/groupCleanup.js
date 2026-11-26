import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Meetup from "../models/meetup.model.js";
import Poll from "../models/poll.model.js";
import Notification from "../models/notification.model.js";
import InviteToken from "../models/inviteToken.model.js";
import PendingInvite from "../models/pendingInvite.model.js";
import InviteEvent from "../models/inviteEvent.model.js";
import AttendanceRecord from "../models/attendanceRecord.model.js";
import { deleteTournamentsForGroup } from "./tournament/cleanup.js";
import { purgeGroupChat, removeAllChatMembers, deleteGroupChatTimeouts } from "./supabaseAdmin.js";

/**
 * Deletes a group and everything that belongs to it: meetups, polls, invites, attendance,
 * tournaments, notifications, its place in members' records, then its chat (messages, photos,
 * membership and timeouts in Supabase; no-ops until Supabase is configured on the server).
 * Checks no permissions and notifies nobody; callers do that. Used by "Delete group" and by
 * scripts/deleteSampleGroups.js.
 */
export async function deleteGroupAndData(group) {
    const groupId = group._id;
    await Meetup.deleteMany({ group: groupId });
    await Poll.deleteMany({ group: groupId });
    await InviteToken.deleteMany({ groupId });
    await PendingInvite.deleteMany({ groupId });
    await InviteEvent.deleteMany({ groupId });
    await AttendanceRecord.deleteMany({ group: groupId });
    await deleteTournamentsForGroup(groupId);
    await Notification.deleteMany({ group: groupId });
    await User.updateMany(
        { _id: { $in: group.members } },
        { $pull: { groups: groupId, mutedGroups: groupId, mutedUntilNextMeetup: groupId, groupMutes: { group: groupId } }, $unset: { [`lastReadAt.${groupId}`]: "" } }
    );
    await Group.findByIdAndDelete(groupId);

    await purgeGroupChat(groupId);
    await removeAllChatMembers(groupId);
    await deleteGroupChatTimeouts(groupId);
}
