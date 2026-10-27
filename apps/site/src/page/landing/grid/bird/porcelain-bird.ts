import type { RefObject } from "react";
import type { Bird, RoostOptions } from "../../../../shared/bird";
import { birdLength } from "../../../bird/size";
import type { HeadlineRoost } from "../copy/headline";

/**
 * The page's porcelain bird while the landing has it. It is placed on the headline once the cell
 * bird has handed over, then guided between two roosts as the page scrolls: the headline, and the
 * top edge of the window below. It is only ever moved while the landing holds it; the page's route
 * takes it from there (`setBird(null)`), and gives it back when the visitor scrolls up.
 */
export class PorcelainBird {
  private bird: Bird | null = null;
  private roost: HeadlineRoost | null = null;
  private released = false;
  private placed = false;
  private stopGuide: (() => void) | null = null;

  constructor(private readonly windowRoost: RefObject<HTMLElement | null>) {}

  /** True once the bird can take over from the cells. */
  get ready(): boolean {
    return this.bird !== null;
  }

  /** The bird's length, known before it has loaded, so the cells can land at its size. */
  get size(): number {
    return this.bird?.size ?? birdLength();
  }

  setBird(bird: Bird | null) {
    this.bird = bird;
    if (!bird) this.unguide();
    else if (this.placed) this.guide(bird);
    else this.place();
  }

  /** The headline reflowed: the bird moves to the new first line's last word. */
  setRoost(roost: HeadlineRoost | null) {
    const previous = this.roost;
    this.roost = roost;
    const moved =
      !previous || !roost || previous.el !== roost.el || previous.at !== roost.at || previous.offsetY !== roost.offsetY;
    if (moved && this.placed && this.bird) this.guide(this.bird);
  }

  /** The cell bird has landed and gone, or the intro was skipped: place the bird as soon as it is here. */
  release() {
    this.released = true;
    this.place();
  }

  lookAt(point: { x: number; y: number }) {
    this.bird?.lookAt(point);
  }

  destroy() {
    this.unguide();
    this.bird = null;
  }

  private place() {
    const bird = this.bird;
    const roost = this.roost;
    if (!bird || !roost || !this.released || this.placed) return;
    this.placed = true;
    // Kept still, the guide's first pick places it: appearing first would have the guide fade it
    // out and back in on the same roost.
    if (bird.reducedMotion) {
      this.guide(bird);
      return;
    }
    void bird.appear(roost.el, this.options(roost)).then(() => {
      if (this.bird !== bird) return;
      // It shakes the grid off its feathers.
      bird.flutter();
      this.guide(bird);
    });
  }

  private guide(bird: Bird) {
    this.unguide();
    const roost = this.roost;
    if (!roost) return;
    const below = this.windowRoost.current;
    this.stopGuide = bird.guide([
      { el: roost.el, ...this.options(roost), band: 0.5 },
      ...(below && below.getClientRects().length ? [{ el: below, at: 0.84, band: 0.3 }] : []),
    ]);
  }

  private unguide() {
    this.stopGuide?.();
    this.stopGuide = null;
  }

  private options(roost: HeadlineRoost): RoostOptions {
    return { at: roost.at, facing: "left", offsetY: roost.offsetY };
  }
}
