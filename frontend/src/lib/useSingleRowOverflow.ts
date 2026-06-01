"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

interface UseSingleRowOverflowOptions {
  itemKeys: string[];
  enabled?: boolean;
  resetKey?: string;
}

export function useSingleRowOverflow({ itemKeys, enabled = true, resetKey }: UseSingleRowOverflowOptions) {
  const [visibleCount, setVisibleCount] = useState(itemKeys.length);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemWidthsRef = useRef<Map<string, number>>(new Map());
  const overflowWidthsRef = useRef<Map<number, number>>(new Map());
  const frameRef = useRef<number | null>(null);
  const itemKeySignature = useMemo(() => itemKeys.join("|"), [itemKeys]);

  const calculateVisibleCount = useCallback(() => {
    if (!enabled || itemKeys.length === 0) return;

    const container = containerRef.current;
    if (!container) return;

    const itemWidths = itemKeys.map((key) => itemWidthsRef.current.get(key) ?? 0);
    if (itemWidths.some((width) => width <= 0)) return;

    const style = window.getComputedStyle(container);
    const gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 0;
    const containerWidth = container.getBoundingClientRect().width;
    const prefixWidths = [0];

    itemWidths.forEach((width, index) => {
      prefixWidths.push(prefixWidths[index] + width + (index > 0 ? gap : 0));
    });

    const totalItemsWidth = prefixWidths[itemWidths.length];
    if (totalItemsWidth <= containerWidth) {
      setVisibleCount((current) => (current === itemKeys.length ? current : itemKeys.length));
      return;
    }

    let nextVisibleCount = 0;

    for (let visibleItems = 0; visibleItems < itemKeys.length; visibleItems++) {
      const hiddenItems = itemKeys.length - visibleItems;
      const overflowWidth = overflowWidthsRef.current.get(hiddenItems);
      if (!overflowWidth) return;

      const totalWidth = prefixWidths[visibleItems] + (visibleItems > 0 ? gap : 0) + overflowWidth;
      if (totalWidth <= containerWidth) {
        nextVisibleCount = visibleItems;
      }
    }

    setVisibleCount((current) => (current === nextVisibleCount ? current : nextVisibleCount));
  }, [enabled, itemKeys]);

  const scheduleCalculation = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      calculateVisibleCount();
    });
  }, [calculateVisibleCount]);

  const registerItem = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (!node) return;

      itemWidthsRef.current.set(key, node.getBoundingClientRect().width);
      scheduleCalculation();
    },
    [scheduleCalculation],
  );

  const registerOverflowIndicator = useCallback(
    (count: number) => (node: HTMLElement | null) => {
      if (!node) return;

      overflowWidthsRef.current.set(count, node.getBoundingClientRect().width);
      scheduleCalculation();
    },
    [scheduleCalculation],
  );

  useEffect(() => {
    setVisibleCount(itemKeys.length);
  }, [itemKeySignature, itemKeys.length, resetKey]);

  useLayoutEffect(() => {
    calculateVisibleCount();
  }, [calculateVisibleCount]);

  useEffect(() => {
    if (!enabled || typeof ResizeObserver === "undefined") return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => scheduleCalculation());
    observer.observe(container);

    return () => observer.disconnect();
  }, [enabled, scheduleCalculation]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return {
    containerRef,
    visibleCount,
    registerItem,
    registerOverflowIndicator,
    recalculate: scheduleCalculation,
  };
}
