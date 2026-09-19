import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import SuccessTick from './SuccessTick';

/**
 * Stages run strictly in order, and never animate opacity and size at the same
 * time: content fades out, the box resizes while nothing is visible, then the
 * next content fades in. Overlapping the two is what makes a resizing panel look
 * like it is clipping its own contents.
 */
type Stage = 'first' | 'first-out' | 'collapsing' | 'tick' | 'tick-out' | 'expanding' | 'second-in' | 'second';

const FADE_MS = 170;
const COLLAPSE_MS = 320;
const TICK_MS = 760; // draw (~440ms) plus a hold
const EXPAND_MS = 360;
const COLLAPSED_PX = 72;
const PADDING_PX = { card: 24, plain: 12 };

interface StepMorphProps {
  /** Flip to true once the code is verified; the box collapses to a tick, then opens on `second`. */
  showSecond: boolean;
  first: ReactNode;
  second: ReactNode;
  /** 'card' animates background, ring, shadow and padding with the box; 'plain' animates padding only. */
  surface?: 'card' | 'plain';
  /** Fires on every stage change, for parents that measure their own height (e.g. the Settings accordion). */
  onStageChange?: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Stages where the box is at its collapsed tick size. */
const COLLAPSED: Stage[] = ['collapsing', 'tick', 'tick-out'];
/** Stages that render the second step (mounted invisible during 'expanding' so it can be measured). */
const ON_SECOND: Stage[] = ['expanding', 'second-in', 'second'];
/** Stages where any content is hidden, so the box can resize without showing clipped text. */
const HIDDEN: Stage[] = ['first-out', 'collapsing', 'tick-out', 'expanding'];

export default function StepMorph({ showSecond, first, second, surface = 'card', onStageChange }: StepMorphProps) {
  const [stage, setStage] = useState<Stage>(showSecond ? 'second' : 'first');
  const [box, setBox] = useState<{ height: number | null; width: number | null }>({ height: null, width: null });
  const outerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const reduced = prefersReducedMotion();
  const collapsed = COLLAPSED.includes(stage);
  const onSecond = ON_SECOND.includes(stage);
  const hidden = HIDDEN.includes(stage);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Run the choreography when the parent flips `showSecond`.
  useEffect(() => {
    if (!showSecond || stage !== 'first') return;

    if (reduced) {
      setStage('second');
      return;
    }

    // Pin the current size so every later resize has a concrete value to animate from.
    setBox({ height: contentRef.current?.scrollHeight ?? null, width: outerRef.current?.offsetWidth ?? null });

    const frame = requestAnimationFrame(() => setStage('first-out'));
    const at = [
      FADE_MS,
      FADE_MS + COLLAPSE_MS,
      FADE_MS + COLLAPSE_MS + TICK_MS,
      FADE_MS + COLLAPSE_MS + TICK_MS + FADE_MS,
      FADE_MS + COLLAPSE_MS + TICK_MS + FADE_MS + EXPAND_MS,
      FADE_MS + COLLAPSE_MS + TICK_MS + FADE_MS + EXPAND_MS + FADE_MS,
    ];
    const next: Stage[] = ['collapsing', 'tick', 'tick-out', 'expanding', 'second-in', 'second'];
    at.forEach((delay, i) => timers.current.push(window.setTimeout(() => setStage(next[i]), delay)));

    return () => cancelAnimationFrame(frame);
  }, [showSecond, stage, reduced]);

  useLayoutEffect(() => {
    if (stage === 'expanding') {
      // The second step is mounted at the collapsed size and invisible: measure it and grow to fit.
      setBox({ height: contentRef.current?.scrollHeight ?? null, width: outerRef.current?.parentElement?.offsetWidth ?? null });
    } else if (stage === 'first' || stage === 'second') {
      // Back to natural sizing, so later content changes (errors, strength meter) are never clipped.
      setBox({ height: null, width: null });
    }
    // Deferred: the new `box` state is applied on the next render, so measuring the
    // parent synchronously here would report the size we are animating away from.
    const frame = requestAnimationFrame(() => onStageChange?.());
    return () => cancelAnimationFrame(frame);
  }, [stage, onStageChange]);

  const sizeDuration = stage === 'expanding' ? EXPAND_MS : COLLAPSE_MS;
  const sizeEasing = stage === 'expanding' ? 'ease-out' : 'ease-in-out';
  const card = surface === 'card';

  return (
    <div
      ref={outerRef}
      className={`mx-auto overflow-hidden ${card ? 'rounded-xl bg-white ring-1 ring-gray-200' : ''}`}
      style={{
        height: collapsed ? `${COLLAPSED_PX}px` : box.height === null ? undefined : `${box.height}px`,
        width: collapsed ? `${COLLAPSED_PX}px` : box.width === null ? undefined : `${box.width}px`,
        padding: collapsed ? 0 : PADDING_PX[surface],
        boxShadow: card && !collapsed ? '0 1px 2px 0 rgb(0 0 0 / 0.05)' : 'none',
        transition: reduced
          ? 'none'
          : `height ${sizeDuration}ms ${sizeEasing}, width ${sizeDuration}ms ${sizeEasing},` +
            ` padding ${sizeDuration}ms ${sizeEasing}, box-shadow ${sizeDuration}ms ${sizeEasing}`,
      }}
    >
      {stage === 'tick' || stage === 'tick-out' ? (
        <div
          className="flex h-[72px] items-center justify-center"
          style={{ opacity: stage === 'tick-out' ? 0 : 1, transition: `opacity ${FADE_MS}ms ease-in` }}
        >
          {/* Stays drawn through 'tick-out' so it fades away complete, rather than un-drawing. */}
          <SuccessTick active />
        </div>
      ) : (
        <div
          ref={contentRef}
          style={{
            opacity: hidden ? 0 : 1,
            transition: reduced ? 'none' : `opacity ${FADE_MS}ms ${hidden ? 'ease-in' : 'ease-out'}`,
          }}
        >
          {onSecond ? second : first}
        </div>
      )}
    </div>
  );
}
