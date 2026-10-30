"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useListboxNav } from "@/lib/hooks/use-listbox-nav";
import type { Ingredient } from "@/lib/supabase/types";

const PICKER_LIMIT = 50;

export default function IngredientPicker({
  ingredients,
  value,
  onChange,
}: {
  ingredients: Ingredient[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [flip, setFlip] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = ingredients.find((i) => i.id === value);

  function openPicker() {
    // Open upward when there isn't room below (avoids clipping at the viewport bottom).
    const r = triggerRef.current?.getBoundingClientRect();
    setFlip(!!r && window.innerHeight - r.bottom < 320 && r.top > window.innerHeight - r.bottom);
    setActive(0);
    setOpen(true);
  }

  function closePicker(refocus = true) {
    setOpen(false);
    setQ("");
    if (refocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const { list, total } = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = t
      ? ingredients.filter((i) => `${i.name} ${i.brand ?? ""}`.toLowerCase().includes(t))
      : ingredients;
    return { list: f.slice(0, PICKER_LIMIT), total: f.length };
  }, [ingredients, q]);

  const choose = (id: string | null) => {
    onChange(id);
    closePicker();
  };

  // Offset 1 when the "Clear selection" row is present.
  const clearOffset = value ? 1 : 0;
  const rowCount = list.length + clearOffset;

  const nav = useListboxNav({
    count: rowCount,
    onSelect: (i) => {
      if (clearOffset && i === 0) choose(null);
      else {
        const it = list[i - clearOffset];
        if (it) choose(it.id);
      }
    },
    onEscape: (e) => {
      e.preventDefault();
      e.stopPropagation();
      closePicker();
    },
    enabled: open,
    listRef,
  });
  const { activeIndex: active, setActiveIndex: setActive } = nav;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && rowCount === 0) e.preventDefault();
    nav.onKeyDown(e);
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closePicker(false) : openPicker())}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-left bg-white hover:bg-gray-50"
      >
        <span className={`truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {selected ? `${selected.name}${selected.brand ? ` (${selected.brand})` : ""}` : "Select ingredient…"}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      {open && (
        <div
          className={`absolute z-30 left-0 right-0 sm:right-auto sm:w-72 bg-white border rounded-lg shadow-lg ${
            flip ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search…"
            aria-label="Search ingredients"
            className="w-full px-3 py-2 text-sm border-b outline-none rounded-t-lg"
          />
          <ul ref={listRef} role="listbox" className="max-h-60 overflow-y-auto">
            {value && (
              <li role="option" aria-selected={active === 0} data-idx={0}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => choose(null)}
                  onMouseEnter={() => setActive(0)}
                  className={`w-full text-left px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 ${
                    active === 0 ? "bg-gray-100" : ""
                  }`}
                >
                  Clear selection
                </button>
              </li>
            )}
            {list.map((i, n) => {
              const idx = n + clearOffset;
              return (
                <li key={i.id} role="option" aria-selected={active === idx} data-idx={idx}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => choose(i.id)}
                    onMouseEnter={() => setActive(idx)}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-emerald-50 ${
                      active === idx ? "bg-emerald-50" : ""
                    }`}
                  >
                    {i.name}
                    {i.brand && <span className="text-gray-400"> ({i.brand})</span>}
                    <span className="text-gray-400 text-xs"> · {i.unit}</span>
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matches</li>}
          </ul>
          {total > PICKER_LIMIT && (
            <p className="px-3 py-1.5 text-xs text-gray-500 border-t">
              Showing {PICKER_LIMIT} of {total} — refine search
            </p>
          )}
        </div>
      )}
    </div>
  );
}
