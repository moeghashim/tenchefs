import type {
  CookoutClient,
  CreateIdentityRequest,
  IdentityResponse,
  IdentityWithTokenResponse,
} from "../../sdk/index.ts";

interface TestAgentRequest {
  readonly by: CookoutClient;
  readonly name: string;
  readonly owner?: string;
  readonly displayName?: string | null;
  readonly description?: string;
  readonly broughtIn?: true;
}

type CreatedTestAgent<Request extends TestAgentRequest> = Request extends { readonly broughtIn: true }
  ? IdentityResponse
  : IdentityWithTokenResponse;

const BETWEEN_WORDS = /[^\p{L}\p{N}]+/u;
const FIRST_LETTER = /^\p{Ll}/u;

function testAgentDisplayName(name: string): string {
  const words = name.split(BETWEEN_WORDS).filter((word) => word !== "");
  return words.map((word) => word.replace(FIRST_LETTER, (letter) => letter.toUpperCase())).join(" ");
}

function asked(request: TestAgentRequest): Omit<CreateIdentityRequest, "kind"> {
  const { by: _by, broughtIn: _broughtIn, displayName = testAgentDisplayName(request.name), ...rest } = request;
  if (displayName === null) {
    return rest;
  }
  return { ...rest, displayName };
}

function broughtInAsAsked<Request extends TestAgentRequest>(
  answer: IdentityResponse,
): answer is CreatedTestAgent<Request> {
  return !("token" in answer);
}

async function createTestAgent<const Request extends TestAgentRequest>(
  request: Request,
): Promise<CreatedTestAgent<Request>> {
  if (request.broughtIn !== true) {
    return request.by.createIdentity({ ...asked(request), kind: "agent" });
  }
  const brought = await request.by.createAgentForOwner(asked(request));
  if (broughtInAsAsked<Request>(brought)) {
    return brought;
  }
  throw new TypeError(
    `${request.name} came back with a token, though an agent brought it in, and gets one only from a join.`,
  );
}

export { type CreatedTestAgent, type TestAgentRequest, createTestAgent, testAgentDisplayName };
