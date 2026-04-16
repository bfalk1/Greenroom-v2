"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Music, User, Tag, Loader2 } from "lucide-react";

interface SuggestionData {
  samples: { id: string; name: string; genre: string; creatorName: string }[];
  creators: { id: string; artistName: string; username: string; avatarUrl: string | null }[];
  tags: string[];
  genres: string[];
}

interface SearchSuggestionsProps {
  query: string;
  visible: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function SearchSuggestions({
  query,
  visible,
  onSelect,
  onClose,
}: SearchSuggestionsProps) {
  const [data, setData] = useState<SuggestionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Build flat list of all suggestion items for keyboard nav
  const items = React.useMemo(() => {
    if (!data) return [];
    const list: { type: string; label: string; sublabel?: string; value: string }[] = [];
    for (const s of data.samples) {
      list.push({
        type: "sample",
        label: s.name,
        sublabel: `${s.creatorName} · ${s.genre}`,
        value: s.name,
      });
    }
    for (const c of data.creators) {
      list.push({
        type: "creator",
        label: c.artistName || c.username || "",
        sublabel: c.username ? `@${c.username}` : undefined,
        value: `creator:${c.username || c.id}`,
      });
    }
    for (const g of data.genres) {
      list.push({ type: "genre", label: g, value: g });
    }
    for (const t of data.tags) {
      list.push({ type: "tag", label: t, value: t });
    }
    return list;
  }, [data]);

  // Debounced fetch
  useEffect(() => {
    if (!visible || query.length < 2) {
      setData(null);
      return;
    }

    setLoading(true);
    setActiveIndex(-1);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((result) => {
          if (result) setData(result);
        })
        .catch((err) => {
          if (err.name !== "AbortError") console.error(err);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, visible]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (visible) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [visible, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || items.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i < items.length - 1 ? i + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : items.length - 1));
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        handleItemSelect(items[activeIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [visible, items, activeIndex, onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleItemSelect = (item: (typeof items)[0]) => {
    if (item.type === "creator") {
      const username = item.value.replace("creator:", "");
      router.push(`/artist/${username}`);
    } else {
      onSelect(item.label);
    }
    onClose();
  };

  if (!visible || query.length < 2) return null;

  const hasResults =
    data &&
    (data.samples.length > 0 ||
      data.creators.length > 0 ||
      data.tags.length > 0 ||
      data.genres.length > 0);

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 right-0 z-50 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl overflow-hidden"
    >
      {loading && !data ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-[#39b54a] animate-spin" />
        </div>
      ) : !hasResults ? (
        <div className="px-4 py-4 text-sm text-[#666]">No suggestions found</div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          {/* Samples */}
          {data!.samples.length > 0 && (
            <div>
              <div className="px-3 py-2 text-xs font-semibold text-[#666] uppercase tracking-wider">
                Samples
              </div>
              {data!.samples.map((s, i) => {
                const flatIndex = i;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      handleItemSelect({
                        type: "sample",
                        label: s.name,
                        value: s.name,
                      })
                    }
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left text-sm transition ${
                      activeIndex === flatIndex
                        ? "bg-[#2a2a2a] text-white"
                        : "text-[#a1a1a1] hover:bg-[#222] hover:text-white"
                    }`}
                  >
                    <Music className="w-4 h-4 text-[#39b54a] shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-white">{s.name}</div>
                      <div className="truncate text-xs text-[#666]">
                        {s.creatorName} · {s.genre}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Creators */}
          {data!.creators.length > 0 && (
            <div>
              <div className="px-3 py-2 text-xs font-semibold text-[#666] uppercase tracking-wider">
                Creators
              </div>
              {data!.creators.map((c, i) => {
                const flatIndex = data!.samples.length + i;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      handleItemSelect({
                        type: "creator",
                        label: c.artistName || c.username || "",
                        value: `creator:${c.username || c.id}`,
                      })
                    }
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left text-sm transition ${
                      activeIndex === flatIndex
                        ? "bg-[#2a2a2a] text-white"
                        : "text-[#a1a1a1] hover:bg-[#222] hover:text-white"
                    }`}
                  >
                    {c.avatarUrl ? (
                      <img
                        src={c.avatarUrl}
                        alt=""
                        className="w-6 h-6 rounded-full shrink-0"
                      />
                    ) : (
                      <User className="w-4 h-4 text-[#39b54a] shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-white">
                        {c.artistName || c.username}
                      </div>
                      {c.username && c.artistName && (
                        <div className="truncate text-xs text-[#666]">
                          @{c.username}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Genres */}
          {data!.genres.length > 0 && (
            <div>
              <div className="px-3 py-2 text-xs font-semibold text-[#666] uppercase tracking-wider">
                Genres
              </div>
              {data!.genres.map((g, i) => {
                const flatIndex =
                  data!.samples.length + data!.creators.length + i;
                return (
                  <button
                    key={g}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      handleItemSelect({ type: "genre", label: g, value: g })
                    }
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left text-sm transition ${
                      activeIndex === flatIndex
                        ? "bg-[#2a2a2a] text-white"
                        : "text-[#a1a1a1] hover:bg-[#222] hover:text-white"
                    }`}
                  >
                    <Tag className="w-4 h-4 text-[#39b54a] shrink-0" />
                    <span className="truncate text-white">{g}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tags */}
          {data!.tags.length > 0 && (
            <div>
              <div className="px-3 py-2 text-xs font-semibold text-[#666] uppercase tracking-wider">
                Tags
              </div>
              {data!.tags.map((t, i) => {
                const flatIndex =
                  data!.samples.length +
                  data!.creators.length +
                  data!.genres.length +
                  i;
                return (
                  <button
                    key={t}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      handleItemSelect({ type: "tag", label: t, value: t })
                    }
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left text-sm transition ${
                      activeIndex === flatIndex
                        ? "bg-[#2a2a2a] text-white"
                        : "text-[#a1a1a1] hover:bg-[#222] hover:text-white"
                    }`}
                  >
                    <Tag className="w-4 h-4 text-[#666] shrink-0" />
                    <span className="truncate text-white">{t}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
