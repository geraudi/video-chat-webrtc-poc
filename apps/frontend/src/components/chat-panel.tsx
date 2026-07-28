import { Send } from 'lucide-react';
import { useState } from 'react';

import { Button } from './ui/button';

/**
 * UI-only chat panel. Messaging is not wired to the backend yet — the send
 * action simply clears the input.
 *
 * State is local to this component on purpose: typing re-renders only the chat
 * panel, never the video tiles or the surrounding layout.
 */
export function ChatPanel() {
  const [value, setValue] = useState('');

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    // No backend call yet — just clear the field.
    setValue('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[20px] border-2 border-foreground bg-background p-3">
      <div
        aria-label="Chat messages"
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <p className="py-6 text-center text-sm text-muted-foreground">
          No messages yet
        </p>
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
