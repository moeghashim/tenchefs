import type { CookoutClient, MessageId, Refusal, TopLevelMessage } from "../../sdk/index.ts";
import { CookoutError, refusalOf } from "../../sdk/index.ts";

type TitlingClient = Pick<CookoutClient, "setThreadTitle">;

type SetTitle = (messageId: MessageId, title: string) => Promise<Refusal | null>;

interface Titled {
  readonly message: TopLevelMessage;
  readonly parent: TopLevelMessage;
}

function titledAs({ message, parent }: Titled): TopLevelMessage {
  const { title: _title, titleSetAt: _titleSetAt, titleSetBy: _titleSetBy, ...untitled } = message;
  const { title, titleSetAt, titleSetBy } = parent;
  return {
    ...untitled,
    ...(typeof title === "string" && { title }),
    ...(typeof titleSetAt === "string" && { titleSetAt }),
    ...(typeof titleSetBy === "string" && { titleSetBy }),
  };
}

function titleRefusal(error: unknown): Refusal {
  const refusal = refusalOf(error);
  if (!(error instanceof CookoutError)) {
    return refusal;
  }
  const [message = refusal.message] = error.schemaProblems.map((problem) => problem.message);
  return { ...refusal, message };
}

export { type SetTitle, type TitlingClient, titledAs, titleRefusal };
