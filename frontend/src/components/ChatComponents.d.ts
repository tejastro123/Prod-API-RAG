import type { Message } from '@/types';
export declare function StreamingCursor(): import("react/jsx-runtime").JSX.Element;
export declare function SecurityBadge({ notes }: {
    notes: string[];
}): import("react/jsx-runtime").JSX.Element;
export declare function ModelBadge({ cached, model, ms }: {
    cached?: boolean;
    model?: string;
    ms?: number;
}): import("react/jsx-runtime").JSX.Element | null;
export declare function MessageBubble({ message }: {
    message: Message;
}): import("react/jsx-runtime").JSX.Element;
export declare function ChatInput(): import("react/jsx-runtime").JSX.Element;
export declare function MessagesArea(): import("react/jsx-runtime").JSX.Element;
