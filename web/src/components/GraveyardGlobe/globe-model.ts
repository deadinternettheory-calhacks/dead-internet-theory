import { BufferGeometry, Float32BufferAttribute, Quaternion, Shape, Vector3 } from 'three';

export const GLOBE_RADIUS = 1.45;

// Latitude/longitude lines rather than triangle diagonals keep the silhouette legible.
export function createWireframe() {
  const points: number[] = [];
  function ring(pointAt: (angle: number) => [number, number, number]) {
    for (let i = 0; i < 96; i++) points.push(...pointAt(i / 96 * Math.PI * 2), ...pointAt((i + 1) / 96 * Math.PI * 2));
  }
  for (let row = 1; row < 12; row++) {
    const latitude = row / 12 * Math.PI;
    ring(angle => [
      GLOBE_RADIUS * Math.sin(latitude) * Math.cos(angle),
      GLOBE_RADIUS * Math.cos(latitude),
      GLOBE_RADIUS * Math.sin(latitude) * Math.sin(angle),
    ]);
  }
  for (let column = 0; column < 12; column++) {
    const longitude = column / 12 * Math.PI;
    ring(angle => [
      GLOBE_RADIUS * Math.sin(angle) * Math.cos(longitude),
      GLOBE_RADIUS * Math.cos(angle),
      GLOBE_RADIUS * Math.sin(angle) * Math.sin(longitude),
    ]);
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3));
}

export function createHeadstoneShape() {
  const shape = new Shape();
  shape.moveTo(-0.135, 0);
  shape.lineTo(0.135, 0);
  shape.lineTo(0.135, 0.225);
  shape.absarc(0, 0.225, 0.135, 0, Math.PI, false);
  shape.lineTo(-0.135, 0);
  return shape;
}

// A deterministic Fibonacci distribution prevents visual changes on every render.
export const GRAVES = Array.from({ length: 28 }, (_, index) => {
  const y = 1 - (index + 0.5) / 28 * 2;
  const radius = Math.sqrt(1 - y * y);
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  const normal = new Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  return {
    position: normal.clone().multiplyScalar(GLOBE_RADIUS).toArray(),
    quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal),
    scale: 0.82 + (index % 4) * 0.1,
    dark: index % 4 === 0,
  };
});
