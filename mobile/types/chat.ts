export interface ReactionResult {
  action: 'added' | 'removed' | 'changed';
  emoji: string;
  previousEmoji?: string;
  messageId: string;
  senderId: string;
  senderName: string;
}

export interface ChatMessage {
  id: string;
  group_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
  reactions?: Record<string, string[]>;
  deleted_at?: string | null;
  edited_at?: string | null;
  reply_to_id?: string | null;
  reply_to_content?: string | null;
  reply_to_sender?: string | null;
}
