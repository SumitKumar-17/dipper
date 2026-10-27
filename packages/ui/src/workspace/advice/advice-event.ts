export const ADVICE_EVENT = "dipper:advice";

/** Opens the health and index advice from anywhere. The dialog is mounted once in the shell. */
export function requestAdvice(): void {
  window.dispatchEvent(new CustomEvent(ADVICE_EVENT));
}
