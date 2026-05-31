export declare function useLiveMetrics(): {
    metrics: {
        total_requests: number;
        total_errors: number;
        error_rate: string;
        avg_latency_ms: number;
        cache_hit_rate: string;
        total_input_tokens: number;
        total_output_tokens: number;
    } | null;
    health: {
        status: "healthy" | "degraded";
        environment: string;
        checks: Record<string, boolean>;
        version?: string | undefined;
    } | null;
    cache: import("zod").objectOutputType<{
        hits: import("zod").ZodOptional<import("zod").ZodNumber>;
        misses: import("zod").ZodOptional<import("zod").ZodNumber>;
        size: import("zod").ZodOptional<import("zod").ZodNumber>;
        hit_rate: import("zod").ZodOptional<import("zod").ZodString>;
    }, import("zod").ZodTypeAny, "passthrough"> | null;
    connected: boolean;
    error: string | null;
    lastUpdated: Date | null;
};
