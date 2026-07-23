/**
 * lib/ai/knowledge/memory.ts
 *
 * Session Memory Manager for Daarayn AI-TOS.
 * Stores conversation threads in sliding window arrays during active sessions.
 */

export interface KhizrMemoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export class KhizrSessionMemory {
  private messages: KhizrMemoryMessage[] = [];
  private maxHistory = 10; // sliding window size (keep last 10 turns)

  constructor(initialMessages?: KhizrMemoryMessage[]) {
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

  public getHistory(): KhizrMemoryMessage[] {
    return this.messages;
  }

  public formatHistory(): string {
    return this.messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
  }

  public clear() {
    this.messages = [];
  }
}
