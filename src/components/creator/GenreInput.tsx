"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Genre {
  id: string;
  name: string;
  usageCount?: number;
}

interface GenreInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

export function GenreInput({ value, onChange, required }: GenreInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch genres on mount
  useEffect(() => {
    fetchGenres();
  }, []);

  const fetchGenres = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/genres");
      if (res.ok) {
        const data = await res.json();
        setGenres(data.genres || []);
      }
    } catch (error) {
      console.error("Failed to fetch genres:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filteredGenres = genres.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = genres.find(
    g => g.name.toLowerCase() === search.toLowerCase()
  );

  const handleSelect = (genreName: string) => {
    onChange(genreName);
    setSearch("");
    setIsOpen(false);
  };

  const handleCreateNew = async () => {
    if (!search.trim()) return;

    try {
      const res = await fetch("/api/genres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: search.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        onChange(data.genre.name);
        setSearch("");
        setIsOpen(false);
        // Refresh genres list
        fetchGenres();
      }
    } catch (error) {
      console.error("Failed to create genre:", error);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredGenres.length === 1) {
        handleSelect(filteredGenres[0].name);
      } else if (!exactMatch && search.trim()) {
        handleCreateNew();
      }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full h-10 px-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-white text-sm hover:border-[#3a3a3a] transition focus:outline-none focus:border-[#39b54a]"
      >
        <span className={value ? "text-white" : "text-[#666]"}>
          {value || "Select or type genre"}
        </span>
        <ChevronDown className="w-4 h-4 text-[#a1a1a1]" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-lg">
          <div className="p-2 border-b border-[#2a2a2a]">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Search or type new genre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleInputKeyDown}
              className="h-8 bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm placeholder-[#666]"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-2 text-sm text-[#666]">Loading...</div>
            ) : (
              <>
                {filteredGenres.map((genre) => (
                  <button
                    key={genre.id}
                    type="button"
                    onClick={() => handleSelect(genre.name)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[#2a2a2a] transition flex items-center justify-between ${
                      value === genre.name ? "text-[#39b54a]" : "text-white"
                    }`}
                  >
                    <span>{genre.name}</span>
                    {genre.usageCount !== undefined && genre.usageCount > 0 && (
                      <span className="text-xs text-[#666]">{genre.usageCount}</span>
                    )}
                  </button>
                ))}
                
                {/* Show "Create new" option if search doesn't exactly match */}
                {search.trim() && !exactMatch && (
                  <button
                    type="button"
                    onClick={handleCreateNew}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[#2a2a2a] transition text-[#39b54a] flex items-center gap-2 border-t border-[#2a2a2a]"
                  >
                    <Plus className="w-4 h-4" />
                    Create "{search.trim()}"
                  </button>
                )}
                
                {filteredGenres.length === 0 && !search.trim() && (
                  <div className="px-3 py-2 text-sm text-[#666]">No genres found</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      
      {required && <input type="hidden" value={value} required />}
    </div>
  );
}
