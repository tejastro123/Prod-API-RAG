import { z } from 'zod';
export declare const ChatRequestSchema: z.ZodObject<{
    message: z.ZodString;
    thread_id: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    thread_id: string;
}, {
    message: string;
    thread_id?: string | undefined;
}>;
export declare const ChatResponseSchema: z.ZodObject<{
    response: z.ZodString;
    thread_id: z.ZodString;
    model_used: z.ZodString;
    cached: z.ZodBoolean;
    processing_time_ms: z.ZodNumber;
    security_notes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    cached: boolean;
    processing_time_ms: number;
    security_notes: string[];
    response: string;
    model_used: string;
    thread_id: string;
}, {
    cached: boolean;
    processing_time_ms: number;
    response: string;
    model_used: string;
    thread_id: string;
    security_notes?: string[] | undefined;
}>;
export declare const HealthResponseSchema: z.ZodObject<{
    status: z.ZodEnum<["healthy", "degraded"]>;
    environment: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
    checks: z.ZodRecord<z.ZodString, z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    status: "healthy" | "degraded";
    environment: string;
    checks: Record<string, boolean>;
    version?: string | undefined;
}, {
    status: "healthy" | "degraded";
    environment: string;
    checks: Record<string, boolean>;
    version?: string | undefined;
}>;
export declare const MetricsResponseSchema: z.ZodObject<{
    total_requests: z.ZodNumber;
    total_errors: z.ZodNumber;
    error_rate: z.ZodString;
    avg_latency_ms: z.ZodNumber;
    cache_hit_rate: z.ZodString;
    total_input_tokens: z.ZodNumber;
    total_output_tokens: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    total_requests: number;
    total_errors: number;
    error_rate: string;
    avg_latency_ms: number;
    cache_hit_rate: string;
    total_input_tokens: number;
    total_output_tokens: number;
}, {
    total_requests: number;
    total_errors: number;
    error_rate: string;
    avg_latency_ms: number;
    cache_hit_rate: string;
    total_input_tokens: number;
    total_output_tokens: number;
}>;
export declare const CacheStatsSchema: z.ZodObject<{
    hits: z.ZodOptional<z.ZodNumber>;
    misses: z.ZodOptional<z.ZodNumber>;
    size: z.ZodOptional<z.ZodNumber>;
    hit_rate: z.ZodOptional<z.ZodString>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    hits: z.ZodOptional<z.ZodNumber>;
    misses: z.ZodOptional<z.ZodNumber>;
    size: z.ZodOptional<z.ZodNumber>;
    hit_rate: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    hits: z.ZodOptional<z.ZodNumber>;
    misses: z.ZodOptional<z.ZodNumber>;
    size: z.ZodOptional<z.ZodNumber>;
    hit_rate: z.ZodOptional<z.ZodString>;
}, z.ZodTypeAny, "passthrough">>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;
export type CacheStats = z.infer<typeof CacheStatsSchema>;
export type MessageRole = 'user' | 'assistant';
export interface Message {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: number;
    model_used?: string;
    cached?: boolean;
    processing_time_ms?: number;
    security_notes?: string[];
    isStreaming?: boolean;
}
export interface Thread {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messageCount: number;
}
export declare const StreamEventSchema: z.ZodDiscriminatedUnion<"event", [z.ZodObject<{
    event: z.ZodLiteral<"token">;
    data: z.ZodObject<{
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        content: string;
    }, {
        content: string;
    }>;
}, "strip", z.ZodTypeAny, {
    event: "token";
    data: {
        content: string;
    };
}, {
    event: "token";
    data: {
        content: string;
    };
}>, z.ZodObject<{
    event: z.ZodLiteral<"metadata">;
    data: z.ZodObject<{
        cached: z.ZodBoolean;
        model_used: z.ZodString;
        processing_time_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        cached: boolean;
        processing_time_ms: number;
        model_used: string;
    }, {
        cached: boolean;
        processing_time_ms: number;
        model_used: string;
    }>;
}, "strip", z.ZodTypeAny, {
    event: "metadata";
    data: {
        cached: boolean;
        processing_time_ms: number;
        model_used: string;
    };
}, {
    event: "metadata";
    data: {
        cached: boolean;
        processing_time_ms: number;
        model_used: string;
    };
}>, z.ZodObject<{
    event: z.ZodLiteral<"security">;
    data: z.ZodObject<{
        notes: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        notes: string[];
    }, {
        notes: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    event: "security";
    data: {
        notes: string[];
    };
}, {
    event: "security";
    data: {
        notes: string[];
    };
}>, z.ZodObject<{
    event: z.ZodLiteral<"graph_node">;
    data: z.ZodObject<{
        node: z.ZodString;
        status: z.ZodEnum<["start", "done", "skip", "error"]>;
        duration_ms: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        status: "start" | "done" | "skip" | "error";
        node: string;
        duration_ms?: number | undefined;
    }, {
        status: "start" | "done" | "skip" | "error";
        node: string;
        duration_ms?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    event: "graph_node";
    data: {
        status: "start" | "done" | "skip" | "error";
        node: string;
        duration_ms?: number | undefined;
    };
}, {
    event: "graph_node";
    data: {
        status: "start" | "done" | "skip" | "error";
        node: string;
        duration_ms?: number | undefined;
    };
}>, z.ZodObject<{
    event: z.ZodLiteral<"done">;
    data: z.ZodObject<{
        response: z.ZodString;
        thread_id: z.ZodString;
        model_used: z.ZodString;
        cached: z.ZodBoolean;
        processing_time_ms: z.ZodNumber;
        security_notes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        cached: boolean;
        processing_time_ms: number;
        security_notes: string[];
        response: string;
        model_used: string;
        thread_id: string;
    }, {
        cached: boolean;
        processing_time_ms: number;
        response: string;
        model_used: string;
        thread_id: string;
        security_notes?: string[] | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    event: "done";
    data: {
        cached: boolean;
        processing_time_ms: number;
        security_notes: string[];
        response: string;
        model_used: string;
        thread_id: string;
    };
}, {
    event: "done";
    data: {
        cached: boolean;
        processing_time_ms: number;
        response: string;
        model_used: string;
        thread_id: string;
        security_notes?: string[] | undefined;
    };
}>, z.ZodObject<{
    event: z.ZodLiteral<"error">;
    data: z.ZodObject<{
        message: z.ZodString;
        code: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        message: string;
        code: number;
    }, {
        message: string;
        code: number;
    }>;
}, "strip", z.ZodTypeAny, {
    event: "error";
    data: {
        message: string;
        code: number;
    };
}, {
    event: "error";
    data: {
        message: string;
        code: number;
    };
}>]>;
export type StreamEvent = z.infer<typeof StreamEventSchema>;
