import readline from "node:readline";

const input = readline.createInterface({ input: process.stdin });

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

input.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "Flux test MCP", version: "1.0.0" },
      },
    });
    return;
  }
  if (message.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: [{
          name: "echo",
          title: "回显",
          description: "返回输入内容",
          inputSchema: {
            type: "object",
            properties: { message: { type: "string" } },
          },
          annotations: { readOnlyHint: true },
        }],
      },
    });
    return;
  }
  if (message.method === "tools/call") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [{ type: "text", text: String(message.params?.arguments?.message ?? "") }],
        structuredContent: {
          idempotencyKey: message.params?._meta?.["flux/idempotencyKey"],
        },
      },
    });
  }
});
