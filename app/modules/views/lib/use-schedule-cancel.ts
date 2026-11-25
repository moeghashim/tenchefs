import { useCallback, useContext } from "react";
import { LandingContext } from "../../landing/index.ts";
import type { Scheduling } from "../../board/index.ts";

interface ScheduleCancel {
  readonly cancelled: string | null;
  readonly scheduling: Scheduling;
}

function useScheduleCancel({ cancelled, scheduling }: ScheduleCancel): () => void {
  const { watch } = useContext(LandingContext);
  return useCallback(() => {
    if (cancelled !== null) {
      watch(cancelled);
    }
    scheduling.close();
  }, [cancelled, scheduling, watch]);
}

export { useScheduleCancel };
