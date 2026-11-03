import type { SceneProps } from "../types";
import { LegacyScene, type LegacySceneDef } from "./legacy-scene";

// The reserve is the element's own final box (window chrome included), so the page holds the space
// from first paint and nothing moves when the module, markup and fonts arrive.
const terminal: LegacySceneDef = {
  module: "terminal",
  tag: "dipper-terminal",
  reserve: <div data-dipper-terminal-reserve="" />,
};

export const LegacyTerminalScene = (props: SceneProps) => <LegacyScene def={terminal} {...props} />;
