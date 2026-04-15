"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";

const SYNTHS = [
  { value: "SERUM", label: "Serum" },
  { value: "ASTRA", label: "Astra" },
  { value: "SERUM_2", label: "Serum 2" },
  { value: "PHASE_PLANT", label: "Phase Plant" },
  { value: "SPLICE", label: "Splice" },
  { value: "VITAL", label: "Vital" },
  { value: "SYLENTH1", label: "Sylenth1" },
  { value: "MASSIVE", label: "Massive" },
  { value: "BEAT_MAKER", label: "Beat Maker" },
];

const CATEGORIES = [
  { value: "BASS", label: "Bass" },
  { value: "LEAD", label: "Lead" },
  { value: "PAD", label: "Pad" },
  { value: "PLUCK", label: "Pluck" },
  { value: "FX", label: "FX" },
  { value: "KEYS", label: "Keys" },
  { value: "ARP", label: "Arp" },
  { value: "SEQUENCE", label: "Sequence" },
  { value: "OTHER", label: "Other" },
];

export interface PresetFilterState {
  synthName: string;
  category: string;
  genre: string;
  sortBy: string;
}

interface PresetFiltersProps {
  onFilterChange: (filters: PresetFilterState) => void;
}

// Searchable dropdown component (matches SampleFilters pattern)
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  allLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  allLabel: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
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

  const displayLabel = value === "all"
    ? allLabel
    : options.find(o => o.value === value)?.label || value;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full h-10 px-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-md text-white text-sm hover:border-[#3a3a3a] transition"
      >
        <span className={value === "all" ? "text-[#a1a1a1]" : "text-white"}>
          {displayLabel}
        </span>
        <ChevronDown className="w-4 h-4 text-[#a1a1a1]" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-md shadow-lg">
          <div className="p-2 border-b border-[#2a2a2a]">
            <Input
              ref={inputRef}
              type="text"
              placeholder={`Search ${placeholder.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm placeholder-[#666]"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onChange("all");
                setIsOpen(false);
                setSearch("");
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-[#2a2a2a] transition ${
                value === "all" ? "text-[#39b54a]" : "text-white"
              }`}
            >
              {allLabel}
            </button>
            {filteredOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                  setSearch("");
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-[#2a2a2a] transition ${
                  value === opt.value ? "text-[#39b54a]" : "text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-[#666]">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PresetFilters({ onFilterChange }: PresetFiltersProps) {
  const [mounted, setMounted] = useState(false);
  const [synthName, setSynthName] = useState("all");
  const [category, setCategory] = useState("all");
  const [genre, setGenre] = useState("all");
  const [sortBy, setSortBy] = useState("random");
  const [genres, setGenres] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch genres from API
  useEffect(() => {
    fetch("/api/genres")
      .then(res => res.json())
      .then(data => {
        if (data.genres) {
          setGenres(data.genres.map((g: { name: string }) => g.name));
        }
      })
      .catch(console.error);
  }, []);

  const handleChange = (field: string, value: string) => {
    let newSynth = synthName;
    let newCategory = category;
    let newGenre = genre;
    let newSort = sortBy;

    if (field === "synth") newSynth = value;
    if (field === "category") newCategory = value;
    if (field === "genre") newGenre = value;
    if (field === "sort") newSort = value;

    setSynthName(newSynth);
    setCategory(newCategory);
    setGenre(newGenre);
    setSortBy(newSort);

    onFilterChange({
      synthName: newSynth,
      category: newCategory,
      genre: newGenre,
      sortBy: newSort,
    });
  };

  if (!mounted) {
    return (
      <div className="flex flex-wrap gap-4 mb-8 p-4 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#39b54a]" />
          <span className="text-sm font-medium text-white">Filter:</span>
        </div>
      </div>
    );
  }

  const genreOptions = genres.map(g => ({ value: g, label: g }));

  return (
    <div className="flex flex-wrap gap-4 mb-8 p-4 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-[#39b54a]" />
        <span className="text-sm font-medium text-white">Filter:</span>
      </div>

      <SearchableSelect
        value={synthName}
        onChange={(v) => handleChange("synth", v)}
        options={SYNTHS}
        placeholder="Synth"
        allLabel="All Synths"
        className="w-36"
      />

      <SearchableSelect
        value={category}
        onChange={(v) => handleChange("category", v)}
        options={CATEGORIES}
        placeholder="Category"
        allLabel="All Categories"
        className="w-36"
      />

      <SearchableSelect
        value={genre}
        onChange={(v) => handleChange("genre", v)}
        options={genreOptions}
        placeholder="Genre"
        allLabel="All Genres"
        className="w-36"
      />

      <Select
        value={sortBy}
        onValueChange={(v) => handleChange("sort", v)}
      >
        <SelectTrigger className="w-32 bg-[#0a0a0a] border-[#2a2a2a] text-white">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
          <SelectItem value="random">Random</SelectItem>
          <SelectItem value="newest">Most Recent</SelectItem>
          <SelectItem value="popular">Most Popular</SelectItem>
          <SelectItem value="rating">Top Rated</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
