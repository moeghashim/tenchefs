import { agentFactory as rule } from "../rules/agent-factory.js";
import { ruleTester } from "./rule-tester.js";

const errors = [{ messageId: "factory" }];

ruleTester.run("agent-factory", rule, {
  invalid: [
    { code: 'await admin.createIdentity({ displayName: "Bot", kind: "agent", name: "bot" });', errors },
    { code: 'await cookout.client.createIdentity({ kind: "agent", name: "bot", owner: "ada" });', errors },
    { code: "await by.createIdentity({ ...request, displayName: request.name });", errors },
    { code: 'await chief.client.createAgentForOwner({ displayName: "Worker", name: "worker" });', errors },
    { code: 'await chief.client["createAgentForOwner"]({ name: "worker" });', errors },
    { code: "await chief.client.createAgentForOwner(request);", errors },
  ],
  valid: [
    { code: 'await createTestAgent({ by: admin, name: "bot" });' },
    { code: 'await admin.createIdentity({ kind: "human", name: "ada" });' },
    { code: 'yield* cookout.createIdentity("bot", { owner: "ada" });' },
    { code: 'yield* cookout.createIdentity("bot");' },
    { code: "yield* storage.createIdentity(identity, hash);" },
    { code: 'await createIdentity({ kind: "agent", name: "bot" });' },
  ],
});
