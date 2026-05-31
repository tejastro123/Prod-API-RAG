"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var index_1 = require("../src/types/index");
var utils_1 = require("../src/lib/utils");
// ─── ChatRequest ──────────────────────────────────────────────────────────────
(0, vitest_1.describe)('ChatRequestSchema', function () {
    (0, vitest_1.it)('accepts valid request', function () {
        (0, vitest_1.expect)(index_1.ChatRequestSchema.safeParse({ message: 'Hello', thread_id: 'abc' }).success).toBe(true);
    });
    (0, vitest_1.it)('applies default thread_id', function () {
        var r = index_1.ChatRequestSchema.safeParse({ message: 'Hello' });
        (0, vitest_1.expect)(r.success && r.data.thread_id).toBe('default');
    });
    (0, vitest_1.it)('rejects empty message', function () {
        (0, vitest_1.expect)(index_1.ChatRequestSchema.safeParse({ message: '' }).success).toBe(false);
    });
    (0, vitest_1.it)('rejects message over 10000 chars', function () {
        (0, vitest_1.expect)(index_1.ChatRequestSchema.safeParse({ message: 'a'.repeat(10001) }).success).toBe(false);
    });
});
// ─── ChatResponse ─────────────────────────────────────────────────────────────
(0, vitest_1.describe)('ChatResponseSchema', function () {
    var valid = {
        response: 'Paris is the capital.',
        thread_id: 'abc',
        model_used: 'primary',
        cached: false,
        processing_time_ms: 320,
        security_notes: [],
    };
    (0, vitest_1.it)('accepts valid response', function () {
        (0, vitest_1.expect)(index_1.ChatResponseSchema.safeParse(valid).success).toBe(true);
    });
    (0, vitest_1.it)('defaults security_notes to []', function () {
        var _ = valid.security_notes, rest = __rest(valid, ["security_notes"]);
        var r = index_1.ChatResponseSchema.safeParse(rest);
        (0, vitest_1.expect)(r.success && r.data.security_notes).toEqual([]);
    });
    (0, vitest_1.it)('accepts cached=true with model_used=cache', function () {
        (0, vitest_1.expect)(index_1.ChatResponseSchema.safeParse(__assign(__assign({}, valid), { cached: true, model_used: 'cache' })).success).toBe(true);
    });
});
// ─── HealthResponse ───────────────────────────────────────────────────────────
(0, vitest_1.describe)('HealthResponseSchema', function () {
    (0, vitest_1.it)('accepts healthy', function () {
        (0, vitest_1.expect)(index_1.HealthResponseSchema.safeParse({
            status: 'healthy', environment: 'production',
            checks: { agent: true, security: true, cache: true },
        }).success).toBe(true);
    });
    (0, vitest_1.it)('accepts degraded', function () {
        (0, vitest_1.expect)(index_1.HealthResponseSchema.safeParse({
            status: 'degraded', environment: 'staging', checks: { agent: false },
        }).success).toBe(true);
    });
    (0, vitest_1.it)('rejects unknown status', function () {
        (0, vitest_1.expect)(index_1.HealthResponseSchema.safeParse({
            status: 'unknown', environment: 'prod', checks: {},
        }).success).toBe(false);
    });
});
// ─── MetricsResponse ──────────────────────────────────────────────────────────
(0, vitest_1.describe)('MetricsResponseSchema', function () {
    (0, vitest_1.it)('accepts valid metrics', function () {
        (0, vitest_1.expect)(index_1.MetricsResponseSchema.safeParse({
            total_requests: 1204, total_errors: 10,
            error_rate: '0.8%', avg_latency_ms: 340,
            cache_hit_rate: '68%', total_input_tokens: 50000, total_output_tokens: 30000,
        }).success).toBe(true);
    });
});
// ─── StreamEvent — all 6 types ────────────────────────────────────────────────
(0, vitest_1.describe)('StreamEventSchema', function () {
    (0, vitest_1.it)('token event', function () {
        (0, vitest_1.expect)(index_1.StreamEventSchema.safeParse({ event: 'token', data: { content: 'Paris' } }).success).toBe(true);
    });
    (0, vitest_1.it)('metadata event', function () {
        (0, vitest_1.expect)(index_1.StreamEventSchema.safeParse({
            event: 'metadata',
            data: { cached: false, model_used: 'primary', processing_time_ms: 320 },
        }).success).toBe(true);
    });
    (0, vitest_1.it)('security event', function () {
        (0, vitest_1.expect)(index_1.StreamEventSchema.safeParse({
            event: 'security', data: { notes: ['Input PII masked: email'] },
        }).success).toBe(true);
    });
    (0, vitest_1.it)('graph_node done with duration', function () {
        (0, vitest_1.expect)(index_1.StreamEventSchema.safeParse({
            event: 'graph_node', data: { node: 'llm_call', status: 'done', duration_ms: 318 },
        }).success).toBe(true);
    });
    (0, vitest_1.it)('graph_node skip without duration', function () {
        (0, vitest_1.expect)(index_1.StreamEventSchema.safeParse({
            event: 'graph_node', data: { node: 'cache_lookup', status: 'skip' },
        }).success).toBe(true);
    });
    (0, vitest_1.it)('done event with full response', function () {
        (0, vitest_1.expect)(index_1.StreamEventSchema.safeParse({
            event: 'done',
            data: { response: 'ok', thread_id: 'abc', model_used: 'primary', cached: false, processing_time_ms: 320, security_notes: [] },
        }).success).toBe(true);
    });
    (0, vitest_1.it)('error event', function () {
        (0, vitest_1.expect)(index_1.StreamEventSchema.safeParse({
            event: 'error', data: { message: 'Rate limit exceeded', code: 429 },
        }).success).toBe(true);
    });
    (0, vitest_1.it)('rejects unknown event type', function () {
        (0, vitest_1.expect)(index_1.StreamEventSchema.safeParse({ event: 'unknown', data: {} }).success).toBe(false);
    });
});
// ─── SSE Parser logic (inline, no import) ─────────────────────────────────────
function collectSSE(raw) {
    return __awaiter(this, void 0, void 0, function () {
        var encoder, stream, events, reader, decoder, buffer, _a, done, value, blocks, _i, blocks_1, block, eventLine, dataLine;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    encoder = new TextEncoder();
                    stream = new ReadableStream({
                        start: function (c) { c.enqueue(encoder.encode(raw)); c.close(); },
                    });
                    events = [];
                    reader = stream.getReader();
                    decoder = new TextDecoder();
                    buffer = '';
                    _e.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 3];
                    return [4 /*yield*/, reader.read()];
                case 2:
                    _a = _e.sent(), done = _a.done, value = _a.value;
                    if (done)
                        return [3 /*break*/, 3];
                    buffer += decoder.decode(value, { stream: true });
                    blocks = buffer.split('\n\n');
                    buffer = (_b = blocks.pop()) !== null && _b !== void 0 ? _b : '';
                    for (_i = 0, blocks_1 = blocks; _i < blocks_1.length; _i++) {
                        block = blocks_1[_i];
                        eventLine = (_c = block.match(/^event: (.+)$/m)) === null || _c === void 0 ? void 0 : _c[1];
                        dataLine = (_d = block.match(/^data: ([\s\S]+)$/m)) === null || _d === void 0 ? void 0 : _d[1];
                        if (!dataLine)
                            continue;
                        try {
                            events.push({ event: eventLine !== null && eventLine !== void 0 ? eventLine : '', data: JSON.parse(dataLine) });
                        }
                        catch ( /* skip */_f) { /* skip */ }
                    }
                    return [3 /*break*/, 1];
                case 3: return [2 /*return*/, events];
            }
        });
    });
}
(0, vitest_1.describe)('SSE parser', function () {
    (0, vitest_1.it)('parses single token event', function () { return __awaiter(void 0, void 0, void 0, function () {
        var evts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, collectSSE('event: token\ndata: {"content":"Paris"}\n\n')];
                case 1:
                    evts = _a.sent();
                    (0, vitest_1.expect)(evts).toHaveLength(1);
                    (0, vitest_1.expect)(evts[0].event).toBe('token');
                    (0, vitest_1.expect)(evts[0].data.content).toBe('Paris');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('parses multiple events in one chunk', function () { return __awaiter(void 0, void 0, void 0, function () {
        var raw, evts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    raw = [
                        'event: token\ndata: {"content":"Paris"}\n\n',
                        'event: metadata\ndata: {"cached":false,"model_used":"primary","processing_time_ms":320}\n\n',
                    ].join('');
                    return [4 /*yield*/, collectSSE(raw)];
                case 1:
                    evts = _a.sent();
                    (0, vitest_1.expect)(evts).toHaveLength(2);
                    (0, vitest_1.expect)(evts[1].event).toBe('metadata');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('silently skips malformed JSON', function () { return __awaiter(void 0, void 0, void 0, function () {
        var raw, evts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    raw = 'event: token\ndata: BAD_JSON\n\nevent: token\ndata: {"content":"ok"}\n\n';
                    return [4 /*yield*/, collectSSE(raw)];
                case 1:
                    evts = _a.sent();
                    (0, vitest_1.expect)(evts).toHaveLength(1);
                    (0, vitest_1.expect)(evts[0].data.content).toBe('ok');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('skips block with no data line', function () { return __awaiter(void 0, void 0, void 0, function () {
        var raw, evts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    raw = 'event: token\n\nevent: token\ndata: {"content":"x"}\n\n';
                    return [4 /*yield*/, collectSSE(raw)];
                case 1:
                    evts = _a.sent();
                    (0, vitest_1.expect)(evts).toHaveLength(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('handles empty input', function () { return __awaiter(void 0, void 0, void 0, function () {
        var evts;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, collectSSE('')];
                case 1:
                    evts = _a.sent();
                    (0, vitest_1.expect)(evts).toHaveLength(0);
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── Formatters ───────────────────────────────────────────────────────────────
(0, vitest_1.describe)('formatMs', function () {
    (0, vitest_1.it)('sub-second', function () { (0, vitest_1.expect)((0, utils_1.formatMs)(320)).toBe('320ms'); });
    (0, vitest_1.it)('seconds', function () { (0, vitest_1.expect)((0, utils_1.formatMs)(1500)).toBe('1.5s'); });
    (0, vitest_1.it)('rounds', function () { (0, vitest_1.expect)((0, utils_1.formatMs)(0.4)).toBe('0ms'); });
});
(0, vitest_1.describe)('formatNumber', function () {
    (0, vitest_1.it)('thousands', function () { (0, vitest_1.expect)((0, utils_1.formatNumber)(1204)).toBe('1.2K'); });
    (0, vitest_1.it)('millions', function () { (0, vitest_1.expect)((0, utils_1.formatNumber)(1500000)).toBe('1.5M'); });
    (0, vitest_1.it)('small', function () { (0, vitest_1.expect)((0, utils_1.formatNumber)(42)).toBe('42'); });
});
(0, vitest_1.describe)('relativeTime', function () {
    (0, vitest_1.it)('just now for <1m', function () { (0, vitest_1.expect)((0, utils_1.relativeTime)(Date.now() - 30000)).toBe('just now'); });
    (0, vitest_1.it)('minutes ago', function () { (0, vitest_1.expect)((0, utils_1.relativeTime)(Date.now() - 5 * 60000)).toBe('5m ago'); });
    (0, vitest_1.it)('hours ago', function () { (0, vitest_1.expect)((0, utils_1.relativeTime)(Date.now() - 2 * 3600000)).toBe('2h ago'); });
    (0, vitest_1.it)('days ago', function () { (0, vitest_1.expect)((0, utils_1.relativeTime)(Date.now() - 3 * 86400000)).toBe('3d ago'); });
});
