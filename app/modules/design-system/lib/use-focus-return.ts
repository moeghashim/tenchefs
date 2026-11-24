import { useCallback, useState } from "react";

interface FocusReturn {
  readonly open: boolean;
  readonly returning: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onReturned: () => void;
}

export function useFocusReturn(): FocusReturn {
  const [open, setOpen] = useState(false);
  const [returning, setReturning] = useState(false);
  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    setReturning(!next);
  }, []);
  const onReturned = useCallback(() => {
    setReturning(false);
  }, []);
  return { onOpenChange, onReturned, open, returning };
}
