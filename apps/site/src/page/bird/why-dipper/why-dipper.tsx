import { AnimatePresence, motion } from "motion/react";
import { type RefObject, useLayoutEffect } from "react";
import { EASE_OUT } from "../../../shared/motion";
import { usePrefersReducedMotion } from "../../../shared/viewport/media";
import { Slip } from "../../materials";
import { WHY_DIPPER } from "./copy";
import { type Anchor, placeSlip } from "./place";
import { useWhyDipper } from "./use-why-dipper";

// Folds down from its top edge, as the completion section's slips do.
const FOLDED = { opacity: 0, rotateX: -84, transformPerspective: 480 };
const UNFOLDED = { opacity: 1, rotateX: 0, transformPerspective: 480 };

/**
 * Why the project is called roost, on a slip beside the bird: an easter egg for whoever rests the
 * pointer on it, or taps it, while it sits still. Nothing on the page points to it.
 */
export function WhyDipper({ settled }: { settled: boolean }) {
  const { anchor, slip } = useWhyDipper(settled);
  return <AnimatePresence>{anchor ? <WhyDipperSlip key="slip" anchor={anchor} slip={slip} /> : null}</AnimatePresence>;
}

function WhyDipperSlip({ anchor, slip }: { anchor: Anchor; slip: RefObject<HTMLDivElement | null> }) {
  const reduced = usePrefersReducedMotion();

  // Placed before it paints, from its own size; it stays put, as the bird does, until it closes.
  useLayoutEffect(() => {
    const el = slip.current;
    if (!el) return;
    const nav = document.querySelector("[data-site-nav]")?.getBoundingClientRect().bottom ?? 0;
    const { x, y } = placeSlip(anchor, el.offsetWidth, el.offsetHeight, Math.max(0, nav));
    el.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
  }, [anchor, slip]);

  return (
    <motion.div
      ref={slip}
      id="why-dipper"
      role="note"
      className="fixed top-0 left-0 z-40 w-64 origin-top sm:w-72"
      initial={FOLDED}
      animate={UNFOLDED}
      exit={FOLDED}
      transition={reduced ? { duration: 0 } : { duration: 0.3, ease: EASE_OUT }}
    >
      <Slip tilt={-1} className="p-3 text-xs/5 lg:p-4 lg:text-sm/5">
        <p>
          <span className="font-semibold">{WHY_DIPPER.word}</span>{" "}
          <span className="text-paper-muted">{WHY_DIPPER.sound}</span>{" "}
          <span className="text-paper-muted italic">{WHY_DIPPER.kind}</span>
        </p>
        <p className="mt-1">{WHY_DIPPER.sense}</p>
        <p className="mt-3 text-paper-muted">{WHY_DIPPER.idea}</p>
      </Slip>
    </motion.div>
  );
}
