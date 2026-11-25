import type { Outgoing, PostState } from "../../board/index.ts";
import { Alert } from "../../design-system/content.tsx";
import { AttachRefusal } from "./attach-refusal.tsx";
import { BoxFrame } from "../../design-system/layout.tsx";
import type { Draft } from "../../composer/index.ts";
import { FileDrop } from "../../design-system/controls.tsx";
import { MessageForm } from "./message-form.tsx";
import type { ReactNode } from "react";

interface MessageBoxText {
  readonly field: string;
  readonly form: string;
  readonly posts: string;
}

interface MessageBoxProps {
  readonly draft: Draft;
  readonly post: PostState;
  readonly onPost: (outgoing: Outgoing, posted: () => void) => void;
  readonly onSchedule: (() => void) | null;
  readonly text: MessageBoxText;
  readonly focused: boolean;
}

export function MessageBox(props: MessageBoxProps): ReactNode {
  const { draft, post, text } = props;
  const handleFiles = draft.attachments.attach;
  return (
    <BoxFrame>
      <FileDrop onFiles={handleFiles}>
        <MessageForm
          draft={draft}
          focused={props.focused}
          onPost={props.onPost}
          onSchedule={props.onSchedule}
          posting={post.status === "posting"}
          text={text}
        />
      </FileDrop>
      <AttachRefusal attachments={draft.attachments} />
      {post.status === "failed" && <Alert>{`Couldn't post the ${text.posts} (${post.code}): ${post.message}`}</Alert>}
    </BoxFrame>
  );
}
