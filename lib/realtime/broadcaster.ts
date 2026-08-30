type EventListener = (event: { type: string; payload: any }) => void;

class RealtimeBroadcaster {
  private listeners: Set<EventListener> = new Set();

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public broadcast(type: string, payload: any): void {
    const event = { type, payload };
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("[RealtimeBroadcaster] Error notifying listener:", err);
      }
    });
  }
}

export const realtimeBroadcaster = new RealtimeBroadcaster();
