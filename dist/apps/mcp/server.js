/** Minimal MCP stdio server (JSON-RPC 2.0) with no extra runtime dependency. */
import { createInterface } from 'node:readline';
export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const SERVER_NAME = 'dsh-biorxiv';
export const SERVER_VERSION = '0.1.0-alpha.19';
function error(id, code, message) {
    return { jsonrpc: '2.0', id, error: { code, message } };
}
function contentText(blocks) {
    return blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n');
}
export async function handleMcpRequest(request, tools) {
    const id = request.id ?? null;
    if (request.method === 'notifications/initialized')
        return null;
    if (request.method === 'initialize') {
        return {
            jsonrpc: '2.0',
            id,
            result: {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            },
        };
    }
    if (request.method === 'ping')
        return { jsonrpc: '2.0', id, result: {} };
    if (request.method === 'tools/list') {
        return {
            jsonrpc: '2.0',
            id,
            result: {
                tools: Object.values(tools).map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.parameters,
                })),
            },
        };
    }
    if (request.method === 'tools/call') {
        const params = request.params;
        if (params === null || typeof params !== 'object' || typeof params.name !== 'string') {
            return error(id, -32602, 'invalid tools/call params');
        }
        const tool = tools[params.name];
        if (tool === undefined)
            return error(id, -32602, `unknown tool: ${params.name}`);
        const args = params.arguments !== null && typeof params.arguments === 'object' ? params.arguments : {};
        try {
            const value = await tool.execute(args);
            const blocks = tool.output.render(args, value);
            const text = contentText(blocks);
            const isError = Boolean(value.ok === false);
            return {
                jsonrpc: '2.0',
                id,
                result: { content: [{ type: 'text', text }], structuredContent: value, isError },
            };
        }
        catch (caught) {
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    content: [{ type: 'text', text: caught instanceof Error ? caught.message : 'tool failed' }],
                    isError: true,
                },
            };
        }
    }
    return error(id, -32601, `method not found: ${request.method}`);
}
export function runMcpServer(tools, input = process.stdin, output = process.stdout) {
    const lines = createInterface({ input, crlfDelay: Infinity });
    lines.on('line', (line) => {
        void (async () => {
            let request;
            try {
                request = JSON.parse(line);
            }
            catch {
                output.write(JSON.stringify(error(null, -32700, 'parse error')) + '\n');
                return;
            }
            const response = await handleMcpRequest(request, tools);
            if (response !== null)
                output.write(JSON.stringify(response) + '\n');
        })();
    });
}
//# sourceMappingURL=server.js.map