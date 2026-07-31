export interface ChatSessionEvents {
  onChatMessage?: (content: string, senderId: string) => void;
}
