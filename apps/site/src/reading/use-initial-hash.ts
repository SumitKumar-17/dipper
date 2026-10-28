import { useEffect } from "react";

/**
 * Scrolls to the URL's #fragment once the text has rendered. The browser looks for the fragment
 * when the HTML arrives, and the headings do not exist until React has mounted, so a link straight
 * to a section (`/docs/#install`) would otherwise open at the top.
 */
export function useInitialHash() {
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
}
