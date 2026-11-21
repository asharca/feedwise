import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { userIdForEmail } from "@/lib/db/queries/mcp";
import { createMcpServer } from "@/lib/mcp/server";

async function main() {
  const email = process.env.FEEDWISE_USER_EMAIL?.trim();
  if (!email) throw new Error("Set FEEDWISE_USER_EMAIL to the account this server should use.");
  const id = await userIdForEmail(email);
  if (!id) throw new Error("No Feedwise account matches FEEDWISE_USER_EMAIL.");
  await createMcpServer(id).connect(new StdioServerTransport());
}
main().catch((error) => {
  // stdout is reserved exclusively for the protocol.
  console.error("[mcp]", error);
  process.exitCode = 1;
});
