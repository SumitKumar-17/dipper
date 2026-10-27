import { type RefObject, useCallback } from "react";
import { useBirdNow } from "./driver";
import { sectionOf } from "./route";

/** A hop for a scene's onDone, when the route has the bird and it is standing in that roost's section. */
export function useHop(roost: RefObject<HTMLElement | null>): () => void {
  const birdNow = useBirdNow("route");
  return useCallback(() => {
    const bird = birdNow();
    const at = bird?.roost?.el;
    if (bird && at && roost.current && !bird.flying && sectionOf(roost.current).contains(at)) bird.hop();
  }, [birdNow, roost]);
}
