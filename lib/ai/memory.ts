/**
 * lib/ai/memory.ts
 *
 * Sliding-window session conversation memory for Daarayn AI-TOS.
 */

export interface MemoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export class SessionMemory {
  private messages: MemoryMessage[] = [];
  private maxHistory = 10; // keep last 10 messages for token efficiency

  constructor(initialMessages?: MemoryMessage[]) {
    if (initialMessages) {
      this.messages = initialMessages;
    }
  }

  public addMessage(role: "user" | "assistant", content: string) {
    this.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    if (this.messages.length > this.maxHistory * 2) {
      this.messages = this.messages.slice(-this.maxHistory * 2);
    }
  }

  public getHistory(): MemoryMessage[] {
    return this.messages;
  }

  public formatHistory(): string {
    return this.messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\\n");
  }

  public clear() {
    this.messages = [];
  }
}
