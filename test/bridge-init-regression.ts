/** The CLI must confirm the host's tool bridge before a tool-enabled turn runs. */
import { assert, bashTool, mockHandle, startMockedProxy, textDelta } from "./helpers.ts";

const { post, proxy } = await startMockedProxy("bridge-init");
const originalRuntime = process.env.OPENCHAMBER_RUNTIME;

try {
  for (const runtime of ["", "web"]) {
    process.env.OPENCHAMBER_RUNTIME = runtime;
    const server = runtime ? "openchamber" : "opencode";
    const connected = {
      type: "system",
      subtype: "init",
      mcp_servers: [{ name: server, status: "connected" }],
      tools: [`mcp__${server}__bash`],
    };
    const cases = [
      { name: "connected", init: connected, tools: true, error: undefined },
      { name: "missing", init: { ...connected, mcp_servers: [] }, tools: true, error: /MCP server is missing/ },
      { name: "failed", init: { ...connected, mcp_servers: [{ name: server, status: "failed" }] }, tools: true, error: /reported status "failed"/ },
      { name: "empty", init: { ...connected, tools: [] }, tools: true, error: /session exposed 0/ },
      { name: "unknown", init: { type: "system", subtype: "init" }, tools: true, error: undefined },
      { name: "tool-free", init: { ...connected, mcp_servers: [], tools: [] }, tools: false, error: undefined },
    ];

    for (const sample of cases) {
      for (const stream of [false, true]) {
        proxy.setClaudeQueryStarter(async () => mockHandle((async function* () {
          yield sample.init;
          yield textDelta("bridge ready");
          yield { type: "result", subtype: "success", is_error: false, result: "bridge ready" };
        })()));
        const response = await post(`${server}-${sample.name}-${stream}`, {
          stream,
          tools: sample.tools ? [bashTool] : [],
          messages: [{ role: "user", content: "Check the bridge" }],
        });
        if (sample.error) {
          assert.equal(response.status, 500, sample.name);
          const body = await response.json() as { error: { message: string } };
          assert.match(body.error.message, sample.error);
          assert.doesNotMatch(body.error.message, /bridge ready/);
        } else {
          assert.equal(response.status, 200, sample.name);
          assert.match(await response.text(), /bridge ready/);
        }
      }
    }
  }
} finally {
  proxy.setClaudeQueryStarter(null);
  proxy.stopProxy();
  if (originalRuntime === undefined) delete process.env.OPENCHAMBER_RUNTIME;
  else process.env.OPENCHAMBER_RUNTIME = originalRuntime;
}

console.log("bridge init regression ok");
