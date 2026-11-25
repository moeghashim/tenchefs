import { Button } from "../../design-system/controls.tsx";
import type { ReactNode } from "react";

const TEXT = { logOut: "Log out" } as const;

interface LogOutButtonProps {
  readonly onLogOut: () => void;
}

export function LogOutButton(props: LogOutButtonProps): ReactNode {
  const handleClick = props.onLogOut;
  return <Button onClick={handleClick}>{TEXT.logOut}</Button>;
}
