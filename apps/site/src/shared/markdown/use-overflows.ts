import { type RefObject, useEffect, useState } from "react";

/**
 * Whether the element is wider than its box, live. A scrolling block has to take focus or a keyboard
 * cannot read what overflows it, but one that fits would only be an empty stop in the tab order.
 */
export function useOverflows(ref: RefObject<HTMLElement | null>): boolean {
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollWidth > element.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return overflows;
}
