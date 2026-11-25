import { expect, it } from "vitest";

interface Created {
  readonly name: string;
}

const admin = {
  createIdentity: async (request: { readonly kind: "agent"; readonly name: string }): Promise<Created> =>
    Promise.resolve({ name: request.name }),
};

it("makes an agent without the factory", async () => {
  await expect(admin.createIdentity({ kind: "agent", name: "bot" })).resolves.toStrictEqual({ name: "bot" });
});
