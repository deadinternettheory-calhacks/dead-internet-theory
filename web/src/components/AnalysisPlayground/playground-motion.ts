/** Keep the whole character (including its hop, arms and lens) inside the viewport. */
export function ghostTravel(time: number, width: number, height: number) {
  const xRange = Math.max(0, width / 2 - 1.05);
  const yRange = Math.max(0, height / 2 - 1.35);
  return {
    x: Math.sin(time * 0.21 + 1.2) * xRange,
    y: Math.sin(time * 0.29 - 0.3) * yRange,
  };
}
