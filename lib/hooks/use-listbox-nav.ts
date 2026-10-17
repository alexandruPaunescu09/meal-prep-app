"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";

interface Options {
  /** Number of selectable rows. The active index resets to 0 when this changes. */
  count: number;
  /** Called with the active index on Enter. */
  onSelect: (index: number) => void;
  /** Called on Escape (only while `enabled`). Handle preventDefault/stopPropagation here. */
  onEscape?: (e: KeyboardEvent) => void;
  /** Enter/Escape are ignored while false (e.g. a closed combobox). Arrows always work. */
  enabled?: boolean;
  /** Prefix for option ids, for `aria-activedescendant`. */
  idPrefix?: string;
  /** Optional list element; the active `[data-idx]` row is scrolled into view. */
  listRef?: RefObject<HTMLElement | null>;
}

/** Keyboard navigation for a listbox: ArrowUp/ArrowDown/Enter/Escape plus an active index. */
export function useListboxNav({
  count,
  onSelect,
  onEscape,
  enabled = true,
  idPrefix = "listbox",
  listRef,
}: Options) {
  const [active, setActive] = useState(0);
  const [prevCount, setPrevCount] = useState(count);
  if (prevCount !== count) {
    setPrevCount(count);
    setActive(0);
  }

  const activeIndex = count === 0 ? -1 : Math.min(active, count - 1);

  useEffect(() => {
    if (!enabled || activeIndex < 0) return;
    listRef?.current
      ?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, enabled, listRef]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, Math.max(count - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter" && enabled && activeIndex >= 0) {
      e.preventDefault();
      onSelect(activeIndex);
    } else if (e.key === "Escape" && enabled) {
      onEscape?.(e);
    }
  }

  function getOptionProps(index: number) {
    return {
      id: `${idPrefix}-opt-${index}`,
      "data-idx": index,
      "aria-selected": index === activeIndex,
    };
  }

  return {
    activeIndex,
    setActiveIndex: setActive,
    activeId: activeIndex >= 0 ? `${idPrefix}-opt-${activeIndex}` : undefined,
    onKeyDown,
    getOptionProps,
  };
}
