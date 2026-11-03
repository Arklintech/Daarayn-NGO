"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { appendTypeahead, moveIndex, typeahead, type TypeaheadState } from "@/lib/admin/selectNav";

export interface AdminSelectOption {
  value: string;
  label: string;
  hint?: string;
  /** Short secondary value shown right-aligned in tabular figures (an amount, a count). */
  meta?: string;
}

interface AdminSelectProps {
  value: string;
  options: AdminSelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
  /** Shown (muted) when `value` matches no option. Without it the first option is shown, as before. */
  placeholder?: string;
  /** Shown inside the open list when there are no options. */
  emptyText?: string;
}

/**
 * Dark, gold-accented listbox that replaces the browser's native <select> popup (which cannot be styled).
 * Keyboard: Enter/Space/ArrowDown open, arrows move, Home/End/PageUp/PageDown jump, typing jumps to a match, Enter selects, Escape or outside click closes.
 */
export default function AdminSelect({ value, options, onChange, ariaLabel, disabled, placeholder, emptyText }: AdminSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const typed = useRef<TypeaheadState>({ buffer: "", at: 0 });
  const reduceMotion = useReducedMotion();
  const listId = useId();
  const found = options.findIndex((o) => o.value === value);
  // With a placeholder, "no match" means nothing is selected; without one the first option is shown, exactly as before.
  const selectedIndex = placeholder !== undefined ? found : Math.max(0, found);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // The highlighted option must stay visible in a long list (every verified donation can be in one dropdown).
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const openList = () => {
    if (disabled) return;
    setActive(options.length === 0 ? -1 : selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };
  const choose = (i: number) => {
    if (i < 0 || i >= options.length) return;
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
    if (["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(e.key)) {
      e.preventDefault();
      setActive((a) => moveIndex(a, e.key, options.length));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      return;
    }
    // type-to-jump
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      typed.current = appendTypeahead(typed.current, e.key, Date.now());
      const hit = typeahead(options.map((o) => o.label), typed.current.buffer, active);
      if (hit >= 0) setActive(hit);
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
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        className="w-full flex items-center justify-between gap-3 pl-4 pr-3 py-3 rounded-xl text-left text-sm text-white transition focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-luxury-gold)]/50 disabled:opacity-50"
        style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${open ? "rgba(212,175,55,0.45)" : "rgba(255,255,255,0.1)"}`, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        <span className={`truncate ${selected ? "" : "text-gray-500"}`}>{selected?.label ?? placeholder ?? "Select"}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            // 150 ms, from the trigger, transform + opacity only; no movement when the visitor asked for reduced motion
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="absolute z-40 left-0 right-0 mt-2 max-h-72 overflow-auto rounded-xl p-1.5"
            style={{
              transformOrigin: "top",
              background: "rgba(11,17,15,0.98)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 0 0 1px rgba(212,175,55,0.10), 0 12px 32px -8px rgba(0,0,0,0.65), 0 4px 10px -4px rgba(0,0,0,0.5)",
              backdropFilter: "blur(14px)",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.18) transparent",
            }}
          >
            {options.length === 0 && (
              <li role="presentation" className="px-3 py-3 text-[13px] text-gray-500">{emptyText ?? "Nothing to choose from."}</li>
            )}
            {options.map((o, i) => {
              const isSelected = o.value === value;
              const isActive = i === active;
              return (
                <li
                  key={o.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-[13px] transition-colors duration-100"
                  style={{
                    background: isActive ? "rgba(212,175,55,0.11)" : "transparent",
                    color: isSelected ? "var(--color-luxury-gold, #D4AF37)" : isActive ? "#fff" : "#d1d5db",
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${isSelected ? "font-medium" : ""}`}>{o.label}</span>
                    {o.hint && <span className="block text-[11px] text-gray-500 truncate">{o.hint}</span>}
                  </span>
                  {o.meta && (
                    <span className="flex-shrink-0 text-[12px] tabular-nums" style={{ color: isSelected ? "inherit" : "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
                      {o.meta}
                    </span>
                  )}
                  <span className="w-4 flex-shrink-0">{isSelected && <Check className="w-4 h-4" />}</span>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
