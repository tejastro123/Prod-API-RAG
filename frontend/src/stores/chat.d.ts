import type { Message, Thread } from '@/types';
interface ChatStore {
    threads: Thread[];
    activeThreadId: string;
    messages: Record<string, Message[]>;
    isStreaming: boolean;
    streamingContent: string;
    sendMessage: (content: string) => Promise<void>;
    createThread: () => void;
    deleteThread: (id: string) => void;
    setActiveThread: (id: string) => void;
    clearMessages: () => void;
}
export declare const useChatStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<ChatStore>, "persist"> & {
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<ChatStore, {
            threads: Thread[];
            activeThreadId: string;
            messages: Record<string, Message[]>;
        }>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: ChatStore) => void) => () => void;
        onFinishHydration: (fn: (state: ChatStore) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<ChatStore, {
            threads: Thread[];
            activeThreadId: string;
            messages: Record<string, Message[]>;
        }>>;
    };
}>;
export {};
