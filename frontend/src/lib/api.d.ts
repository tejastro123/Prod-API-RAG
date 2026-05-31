import type { StreamEvent } from '@/types';
export declare function parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent>;
export declare function sendChatMessage(message: string, threadId?: string): Promise<Response>;
export declare function fetchHealth(): Promise<any>;
export declare function fetchMetrics(): Promise<any>;
export declare function fetchCacheStats(): Promise<any>;
