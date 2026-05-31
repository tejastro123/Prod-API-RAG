export interface GraphNodeEvent {
    node: string;
    status: 'start' | 'done' | 'skip' | 'error';
    duration_ms?: number;
}
interface TimelineNode {
    node: string;
    label: string;
    status: 'done' | 'skip' | 'error' | 'pending';
    duration_ms?: number;
}
export declare function inferTimeline(opts: {
    cached?: boolean;
    processing_time_ms?: number;
    security_notes?: string[];
    graphNodes?: GraphNodeEvent[];
}): TimelineNode[];
interface ExecutionTimelineProps {
    cached?: boolean;
    processing_time_ms?: number;
    security_notes?: string[];
    graphNodes?: GraphNodeEvent[];
}
export declare function ExecutionTimeline({ cached, processing_time_ms, security_notes, graphNodes, }: ExecutionTimelineProps): import("react/jsx-runtime").JSX.Element;
export {};
