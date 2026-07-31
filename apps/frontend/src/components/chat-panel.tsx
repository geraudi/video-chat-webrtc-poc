import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { ChatMessage } from '../hooks/use-video-chat';
import { Button } from './ui/button';

export interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  userId: string | null;
}

export function ChatPanel({ messages, onSend, userId }: ChatPanelProps) {
  const [value, setValue] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    onSend(value.trim());
    setValue('');
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[20px] border-2 border-foreground bg-background p-3">
      <div
        aria-label="Chat messages"
        className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1"
      >
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No messages yet
          </p>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.senderId === userId;
          return (
            <div
              key={i}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-[12px] px-3 py-2 text-sm ${
                  isMe
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="mt-3 flex items-center gap-2">
        <input
          value={value}
          onChange={event => setValue(event.target.value)}
          aria-label="Type a message"
          placeholder="Type a message..."
          className="h-10 flex-1 rounded-[10px] border-2 border-foreground bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="submit"
          size="icon"
          variant="default"
          aria-label="Send message"
          disabled={!value.trim()}
          className="size-10 shrink-0 rounded-[10px]"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
