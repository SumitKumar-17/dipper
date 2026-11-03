// The Query Walk scene: the real walk from @dipper/ui, in the app's window, over a clause rail that
// follows it and seeks it. This is the light half - the window and the rail paint with the page,
// space reserved - and the walk itself arrives from walk/scene.tsx once the window is near.

import * as React from "react";
import { SceneBoundary } from "../scene-boundary";
import type { SceneProps } from "../types";
import { MD, useMediaQuery } from "../../viewport/media";
import { useNear, useVisible } from "../../viewport/visibility";
import { SceneWindow, type SceneWindowParts } from "./kit/scene-window";
import { guardWalkKeys } from "./walk/guard-keys";
import { WalkRail } from "./walk/rail";
import "./walk/walk.css";

// Before any walk mounts: the guard has to be the first keydown listener on `window`.
const registerWalkWindow = guardWalkKeys();

/** The app area on a phone: the width the stacked walk was designed for, tall enough to show it all. */
const PHONE_WIDTH = 470;
const PHONE_HEIGHT = 930;

const WalkStage = React.lazy(() => import("./walk/scene"));

export const WalkScene: React.FC<SceneProps> = ({ className, autoplay = true, onReady, onDone }) => {
  const windowRef = React.useRef<HTMLDivElement | null>(null);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const [app, setApp] = React.useState<HTMLElement | null>(null);
  // A phone gets the app laid out narrow and tall, which the walk stacks to fit, and scaled by about
  // 0.76: laid out at 1280 and shrunk to the screen's width its text would be unreadable.
  const narrow = !useMediaQuery(MD);
  const near = useNear(windowRef);
  const visible = useVisible(windowRef, 0.4);

  const onParts = React.useCallback((parts: SceneWindowParts) => {
    windowRef.current = parts.window;
    parts.window.setAttribute("data-walk-window", "");
    parts.app.setAttribute("data-walk-pinned", "");
    setApp(parts.app);
  }, []);

  React.useEffect(() => {
    const element = windowRef.current;
    return element ? registerWalkWindow(element) : undefined;
  }, [app]);

  return (
    <SceneWindow
      below={<WalkRail app={app} railRef={railRef} />}
      className={className}
      height={narrow ? PHONE_HEIGHT : 760}
      held={!visible}
      label="Query Walk"
      onParts={onParts}
      width={narrow ? PHONE_WIDTH : 1280}
    >
      {(parts) =>
        near ? (
          // A walk that fails to load leaves its empty window and its rail rather than taking the page with it.
          <SceneBoundary>
            <React.Suspense fallback={null}>
              <WalkStage
                autoplay={autoplay}
                onDone={onDone}
                onReady={onReady}
                parts={parts}
                railRef={railRef}
                visible={visible}
              />
            </React.Suspense>
          </SceneBoundary>
        ) : null
      }
    </SceneWindow>
  );
};
