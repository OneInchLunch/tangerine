/** Promise-based delay shared by the screenshot harness and seed helpers. */
export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
