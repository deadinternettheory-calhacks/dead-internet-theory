import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { createGlobeMotion, dragGlobe, grabGlobe, releaseGlobe, stopGlobe } from './globe-motion';

export function useGlobeDrag(interactive: boolean, playing: boolean, pointer: RefObject<{ x: number; y: number }>) {
  const stage = useRef<HTMLDivElement>(null);
  const motion = useRef(createGlobeMotion());
  const invalidate = useRef(() => {});
  const [dragging, setDragging] = useState(false);

  const releaseCapture = useCallback((id: number | undefined) => {
    if (id !== undefined && stage.current?.hasPointerCapture(id)) stage.current.releasePointerCapture(id);
    setDragging(false);
    pointer.current = { x: 0, y: 0 };
  }, [pointer]);

  const cancel = useCallback(() => {
    const id = motion.current.drag?.id;
    stopGlobe(motion.current);
    releaseCapture(id);
  }, [releaseCapture]);

  useEffect(() => {
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [cancel]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive || !event.isPrimary || event.button !== 0 || motion.current.drag) return;
    grabGlobe(motion.current, event.pointerId, event.clientX, event.clientY, event.timeStamp, event.pointerType === 'touch');
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType !== 'touch') event.currentTarget.focus({ preventScroll: true });
    setDragging(true);
    pointer.current = { x: 0, y: 0 };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (motion.current.drag) {
      const result = dragGlobe(motion.current, event.pointerId, event.clientX, event.clientY, event.timeStamp, box.height);
      if (result === 'scroll') releaseCapture(event.pointerId);
      if (result === 'dragging') invalidate.current();
    } else if (event.pointerType !== 'touch') {
      pointer.current = { x: (event.clientX - box.left) / box.width * 2 - 1, y: (event.clientY - box.top) / box.height * 2 - 1 };
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (motion.current.drag?.id !== event.pointerId) return;
    releaseGlobe(motion.current, event.timeStamp);
    if (!playing) stopGlobe(motion.current);
    releaseCapture(event.pointerId);
    invalidate.current();
  };

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (motion.current.drag?.id === event.pointerId) cancel();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const turns: Record<string, [number, number]> = {
      ArrowLeft: [0, -0.2], ArrowRight: [0, 0.2], ArrowUp: [-0.2, 0], ArrowDown: [0.2, 0], Home: [0, 0],
    };
    if (!(event.key in turns)) return;
    event.preventDefault();
    cancel();
    if (event.key === 'Home') motion.current = createGlobeMotion();
    else {
      const [pitch, yaw] = turns[event.key];
      motion.current.pitch += pitch;
      motion.current.yaw += yaw;
      motion.current.velocityPitch = playing ? pitch * 6 : 0;
      motion.current.velocityYaw = playing ? yaw * 6 : 0;
    }
    invalidate.current();
  };

  return {
    stage, motion, invalidate, dragging, cancel,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture: onPointerCancel, onKeyDown,
      onPointerLeave: () => { if (!motion.current.drag) pointer.current = { x: 0, y: 0 }; } },
  };
}
