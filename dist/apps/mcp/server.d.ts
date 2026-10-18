/** Minimal MCP stdio server (JSON-RPC 2.0) with no extra runtime dependency. */
import type { ToolSet } from '../dsh/tools.ts';
export declare const MCP_PROTOCOL_VERSION = "2024-11-05";
export declare const SERVER_NAME = "dsh-biorxiv";
export declare const SERVER_VERSION = "0.1.0-alpha.19";
export interface McpRequest {
    jsonrpc: '2.0';
    id?: string | number | null;
    method: string;
    params?: unknown;
}
export interface McpResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
}
export declare function handleMcpRequest(request: McpRequest, tools: ToolSet): Promise<McpResponse | null>;
export declare function runMcpServer(tools: ToolSet, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream): void;
//# sourceMappingURL=server.d.ts.map