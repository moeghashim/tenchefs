import { useCallback, useContext } from "react";
import { LandingContext } from "../../landing/index.ts";

function useProfileClose(): () => void {
  const { watch } = useContext(LandingContext);
  return useCallback(() => {
    const opener = globalThis.location.hash;
    watch(`main a[href="${CSS.escape(opener)}"]`);
  }, [watch]);
}

export { useProfileClose };
