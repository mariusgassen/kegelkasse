"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { type KeylineSetting, useIslandContext, useKeyline, useReducedMotion } from "./context";
import { deriveScene, type PressTarget } from "./store";
import { IslandSurface, type SurfaceInteraction } from "./surface";

export interface IslandProps {
  /**
   * "container" draws at the top centre of the nearest positioned ancestor (a phone frame);
   * "viewport" pins it to the top centre of the window. Defaults to "container".
   */
  placement?: "container" | "viewport";
  /** Name of the island region for screen readers. Defaults to "Live activities". */
  label?: string;
  /** Class on the region element. Defaults to none. */
  className?: string;
  /** Style on the region element. Defaults to none. */
  style?: CSSProperties;
  /**
   * The thin grey band outside the edge that separates the island from a dark page. "auto" draws
   * it when `backdrop` is dark, or in dark mode when no `backdrop` is given. Defaults to "auto".
   */
  keyline?: KeylineSetting;
  /** The page colour behind the island (hex or rgb()), which sets the keyline's strength. Defaults to none. */
  backdrop?: string;
}

/** Draws the activity stack from the nearest `<IslandProvider>`. */
export const Island = ({ placement = "container", label = "Live activities", className, style, keyline = "auto", backdrop }: IslandProps) => {
  const context = useIslandContext();
  if (!context) throw new Error("islandcn: <Island /> must be inside <IslandProvider>.");
  const { store, clock, metrics, motion, recorder } = context;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const scene = useMemo(() => deriveScene(snapshot), [snapshot]);
  const reduced = useReducedMotion(context.reducedMotion);
  const keylineAlpha = useKeyline(keyline, backdrop, metrics);
  const root = useRef<HTMLDivElement | null>(null);
  const expanded = scene.presentation.kind === "expanded";

  // A press outside the island, or Escape, collapses an expanded island.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && root.current?.contains(target)) return;
      store.api.collapse();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const focusInside = root.current?.contains(document.activeElement) ?? false;
      store.api.collapse();
      if (focusInside) root.current?.querySelector<HTMLButtonElement>('[data-islandcn-hit="pill"]')?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded, store]);

  const setRoot = useCallback((element: HTMLDivElement | null) => {
    root.current = element;
  }, []);

  const swipeCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { swipeCleanup.current?.(); }, []);

  const interaction = useMemo<SurfaceInteraction>(() => {
    // With no activity the pill still swells under a press (idletap-t1), but it is not a control.
    const primaryLabel = scene.primary?.label ?? null;
    return {
      pillLabel:
        primaryLabel === null ? null : expanded ? `${primaryLabel}, expanded. Press Escape to collapse.` : `${primaryLabel}. Press to expand.`,
      bubbleLabel: scene.detached ? `${scene.detached.label}. Press to expand.` : null,
      expanded,
      onPressStart: (target: PressTarget, event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        swipeCleanup.current?.();
        const activity = target === "bubble" ? scene.detached : scene.primary;
        if (target === "pill" && !expanded && activity?.onDismiss) {
          const startX = event.clientX;
          const startY = event.clientY;
          const dismiss = activity.onDismiss;
          let settled = false;
          const cleanup = () => {
            if (settled) return;
            settled = true;
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", cleanup);
            window.removeEventListener("pointercancel", cleanup);
            if (swipeCleanup.current === cleanup) swipeCleanup.current = null;
          };
          const onMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy) * 1.2) {
              cleanup();
              store.release({ cancel: true });
              dismiss();
            }
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", cleanup);
          window.addEventListener("pointercancel", cleanup);
          swipeCleanup.current = cleanup;
        }
        store.press(target);
      },
      onPressEnd: () => {
        swipeCleanup.current?.();
        store.release();
      },
      onPressCancel: () => store.release({ cancel: true }),
      onActivate: (target: PressTarget) => {
        if (expanded) {
          store.api.collapse();
          return;
        }
        const activity = target === "bubble" ? scene.detached : scene.primary;
        if (activity) store.api.expand(activity.id);
      },
    };
  }, [scene, expanded, store]);

  return (
    <IslandSurface
      presentation={scene.presentation}
      contentKey={scene.contentKey}
      change={{ id: snapshot.changeId, at: snapshot.changedAt, instant: snapshot.instant }}
      pressed={snapshot.pressed}
      joining={snapshot.joining}
      pressStyle="swell"
      activityId={scene.primary?.id ?? null}
      alerting={snapshot.expanded?.reason === "alert"}
      handingOff={snapshot.handoff !== null}
      placement={placement}
      regionLabel={label}
      liveLabel={scene.label}
      clock={clock}
      metrics={metrics}
      motion={motion}
      reduced={reduced}
      keyline={keylineAlpha}
      recorder={recorder}
      interaction={interaction}
      className={className}
      style={style}
      rootRef={setRoot}
    />
  );
};
