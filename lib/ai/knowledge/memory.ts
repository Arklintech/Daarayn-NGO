/**
 * lib/ai/knowledge/memory.ts
 *
 * Session Memory Manager for Daarayn AI-TOS.
 * Stores conversation threads in sliding window arrays during active sessions.
 */

export interface KhidrMemoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export class KhidrSessionMemory {
  private messages: KhidrMemoryMessage[] = [];
  private maxHistory = 10; // sliding window size (keep last 10 turns)

  constructor(initialMessages?: KhidrMemoryMessage[]) {
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

  public getHistory(): KhidrMemoryMessage[] {
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
