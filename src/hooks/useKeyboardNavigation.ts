"use client";

import { useState, useEffect, useCallback } from "react";

interface UseKeyboardNavigationOptions {
  enabled?: boolean;
  onSelect?: (index: number) => void;
  onPlay?: (index: number) => void;
}

export function useKeyboardNavigation<T>(
  items: T[],
  options: UseKeyboardNavigationOptions = {}
) {
  const { enabled = true, onSelect, onPlay } = options;
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Auto-select first item when items load
  useEffect(() => {
    if (items.length > 0 && selectedIndex === -1) {
      setSelectedIndex(0);
    }
  }, [items.length, selectedIndex]);

  // Reset when items change significantly
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(items.length > 0 ? 0 : -1);
    }
  }, [items.length, selectedIndex]);

  // Handle keyboard events
  useEffect(() => {
    if (!enabled || items.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => {
            const newIndex = prev <= 0 ? items.length - 1 : prev - 1;
            onSelect?.(newIndex);
            return newIndex;
          });
          break;

        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => {
            const newIndex = prev >= items.length - 1 ? 0 : prev + 1;
            onSelect?.(newIndex);
            return newIndex;
          });
          break;

        case "ArrowRight":
        case "Enter":
        case " ":
          e.preventDefault();
          if (selectedIndex >= 0) {
            onPlay?.(selectedIndex);
          } else if (items.length > 0) {
            setSelectedIndex(0);
            onPlay?.(0);
          }
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, items.length, selectedIndex, onSelect, onPlay]);

  const isSelected = useCallback(
    (index: number) => index === selectedIndex,
    [selectedIndex]
  );

  return {
    selectedIndex,
    setSelectedIndex,
    isSelected,
  };
}
