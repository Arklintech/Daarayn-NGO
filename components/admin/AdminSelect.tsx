"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface AdminSelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface AdminSelectProps {
  value: string;
  options: AdminSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * Dark, gold-accented listbox that replaces the browser's native <select> popup (which cannot be styled).
 * Keyboard: Enter/Space/ArrowDown open, arrows move, Home/End jump, Enter selects, Escape or outside click closes.
 */
export default function AdminSelect({ value, options, onChange, ariaLabel, disabled }: AdminSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex);
    setOpen(true);
  };
  const choose = (i: number) => {
    onChange(options[i].value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(options.length - 1, a + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        className="w-full flex items-center justify-between gap-3 pl-4 pr-3 py-3 rounded-xl text-left text-sm text-white transition focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-luxury-gold)]/50 disabled:opacity-50"
        style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${open ? "rgba(212,175,55,0.45)" : "rgba(255,255,255,0.1)"}` }}
      >
        <span className="truncate">{selected?.label ?? "Select"}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 left-0 right-0 mt-2 max-h-72 overflow-auto rounded-xl p-1.5 shadow-2xl"
          style={{ background: "rgba(14,20,18,0.97)", border: "1px solid rgba(212,175,55,0.22)", backdropFilter: "blur(12px)" }}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            const isActive = i === active;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm"
                style={{
                  background: isActive ? "rgba(212,175,55,0.12)" : "transparent",
                  color: isSelected ? "var(--color-luxury-gold, #D4AF37)" : isActive ? "#fff" : "#d1d5db",
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block text-[11px] text-gray-500 truncate">{o.hint}</span>}
                </span>
                {isSelected && <Check className="w-4 h-4 flex-shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
