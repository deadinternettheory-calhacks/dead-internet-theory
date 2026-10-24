// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { exampleReport } from '../../demo/report';
import { DemoExperience } from './DemoExperience';

let container: HTMLDivElement;
let root: Root;
let reduced = false;
let mediaChange: (() => void) | undefined;
const openReport = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  openReport.mockClear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced; }, addEventListener: (_: string, listener: () => void) => { mediaChange = listener; }, removeEventListener: vi.fn() }));
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
const render = (autoplay = true) => act(async () => root.render(<DemoExperience report={exampleReport} autoplay={autoplay} onOpenReport={openReport}/>));
const click = (name: string) => act(async () => {
  const button = [...container.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent) === name);
  expect(button, name).toBeDefined(); button!.click();
});
const current = () => container.querySelector('[aria-current="step"]')?.textContent;

it('plays the five prepared scenes, stops at the result, and replays', async () => {
  await render();
  expect(current()).toContain('The thread');
  for (const label of ['The wording', 'The timing', 'The history', 'The result']) {
    await act(async () => vi.advanceTimersByTimeAsync(6500));
    expect(current()).toContain(label);
  }
  expect(container.querySelector('[aria-label="Replay walkthrough"]')).not.toBeNull();
  expect(container.textContent).toContain('synthetic data');
  await click('Replay walkthrough');
  expect(current()).toContain('The thread');
  expect(container.querySelector('[aria-label="Pause walkthrough"]')).not.toBeNull();
});
it('pauses on evidence interaction and lets readers skip directly to the full report', async () => {
  await render();
  await act(async () => container.querySelector<HTMLButtonElement>('.map-node')!.click());
  await act(async () => vi.advanceTimersByTimeAsync(30000));
  expect(current()).toContain('The thread');
  await click('Skip to full report ');
  expect(current()).toContain('The result');
  expect(openReport).toHaveBeenCalledOnce();
});
it('starts manually with reduced motion and pauses if that preference changes', async () => {
  reduced = true;
  await render();
  expect(container.querySelector('[aria-label="Play walkthrough"]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(20000));
  expect(current()).toContain('The thread');
  await click('Play walkthrough');
  await act(async () => vi.advanceTimersByTimeAsync(6500));
  expect(current()).toContain('The wording');
  reduced = false;
  await act(async () => mediaChange?.());
  reduced = true;
  await act(async () => mediaChange?.());
  expect(container.querySelector('[aria-label="Play walkthrough"]')).not.toBeNull();
});
it('pauses in a hidden tab without resuming unexpectedly', async () => {
  await render();
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  hidden.mockReturnValue(false);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(10000); });
  expect(current()).toContain('The thread');
  expect(container.querySelector('[aria-label="Play walkthrough"]')).not.toBeNull();
  hidden.mockRestore();
});
