import { EventEmitter } from "node:events";

export type ChatEvent =
  | { event: "message"; data: unknown }
  | { event: "online_users"; data: string[] }
  | { event: "typing"; data: { username: string; isTyping: boolean } }
  | { event: "chat_cleared"; data: { by: string } };

type ChatListener = (event: ChatEvent) => void;

/**
 * In-process realtime bus for the sandbox demo.
 *
 * Tracks online users (username -> set of client ids, so multiple tabs with
 * the same name still count as one user) and fans out typed events to every
 * connected server-sent-events stream.
 */
class ChatBus {
  private emitter = new EventEmitter();
  private users = new Map<string, Set<string>>();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  join(username: string, clientId: string): string[] {
    let set = this.users.get(username);
    if (!set) {
      set = new Set();
      this.users.set(username, set);
    }
    set.add(clientId);
    this.emitToAll({ event: "online_users", data: this.onlineNames });
    return this.onlineNames;
  }

  leave(username: string, clientId: string) {
    const set = this.users.get(username);
    if (!set) return;
    set.delete(clientId);
    if (set.size === 0) {
      this.users.delete(username);
      this.emitToAll({ event: "online_users", data: this.onlineNames });
    }
  }

  get onlineNames(): string[] {
    return Array.from(this.users.keys()).sort((a, b) => a.localeCompare(b));
  }

  emitToAll(event: ChatEvent) {
    this.emitter.emit("chat", event);
  }

  onChat(listener: ChatListener): () => void {
    this.emitter.on("chat", listener);
    return () => {
      this.emitter.off("chat", listener);
    };
  }
}

const globalForBus = globalThis as typeof globalThis & {
  __pulseChatBus?: ChatBus;
};

export const chatBus: ChatBus = globalForBus.__pulseChatBus ?? new ChatBus();
globalForBus.__pulseChatBus = chatBus;
