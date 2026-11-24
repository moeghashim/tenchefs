import type { IdentityName, Refusal } from "../../sdk/index.ts";
import type { IdentityList } from "./identity-list.ts";
import { refusalOf } from "../../sdk/index.ts";

type AdminChange =
  | { readonly status: "idle" }
  | { readonly status: "changing"; readonly name: IdentityName }
  | (Refusal & { readonly status: "failed"; readonly name: IdentityName });

interface AdminChanges {
  readonly adminChange: () => AdminChange;
  readonly setAdmin: (name: IdentityName, admin: boolean) => void;
}

function createAdminChanges(list: Pick<IdentityList, "calls" | "refresh">): AdminChanges {
  let change: AdminChange = { status: "idle" };
  let queue = Promise.resolve();

  async function changeAfter(previous: Promise<void>, name: IdentityName, admin: boolean): Promise<void> {
    await previous;
    change = { name, status: "changing" };
    list.refresh();
    try {
      await list.calls.setAdmin(name, admin);
      change = { status: "idle" };
    } catch (error: unknown) {
      change = { ...refusalOf(error), name, status: "failed" };
    }
    list.refresh();
  }

  return {
    adminChange: () => change,
    setAdmin: (name, admin) => {
      queue = changeAfter(queue, name, admin);
    },
  };
}

export { type AdminChanges, createAdminChanges };
