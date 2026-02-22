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

const INSTRUMENTS = [
  "Drums",
  "Bass",
  "Synth",
  "Guitar",
  "Piano",
  "Vocals",
  "FX",
  "Strings",
  "Brass",
  "Pad",
];

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Generate all key combinations
const KEYS = NOTES.flatMap(note => [`${note} Major`, `${note} Minor`]);

interface FilterState {
  genre: string;
  instrumentType: string;
  sampleType: string;
  key: string;
  sortBy: string;
}

interface SampleFiltersProps {
  onFilterChange: (filters: FilterState) => void;
}

// Searchable dropdown component
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
  options: string[];
  placeholder: string;
  allLabel: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
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

  const displayValue = value === "all" ? allLabel : value;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full h-10 px-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-md text-white text-sm hover:border-[#3a3a3a] transition"
      >
        <span className={value === "all" ? "text-[#a1a1a1]" : "text-white"}>
          {displayValue}
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
                value === "all" ? "text-[#00FF88]" : "text-white"
              }`}
            >
              {allLabel}
            </button>
            {filteredOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                  setSearch("");
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-[#2a2a2a] transition ${
                  value === opt ? "text-[#00FF88]" : "text-white"
                }`}
              >
                {opt}
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

export function SampleFilters({ onFilterChange }: SampleFiltersProps) {
  const [genre, setGenre] = useState("all");
  const [instrumentType, setInstrumentType] = useState("all");
  const [sampleType, setSampleType] = useState("all");
  const [key, setKey] = useState("all");
  const [sortBy, setSortBy] = useState("popular");
  const [genres, setGenres] = useState<string[]>([]);

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
    let newGenre = genre;
    let newInstrument = instrumentType;
    let newType = sampleType;
    let newKey = key;
    let newSort = sortBy;

    if (field === "genre") newGenre = value;
    if (field === "instrument") newInstrument = value;
    if (field === "type") newType = value;
    if (field === "key") newKey = value;
    if (field === "sort") newSort = value;

    setGenre(newGenre);
    setInstrumentType(newInstrument);
    setSampleType(newType);
    setKey(newKey);
    setSortBy(newSort);

    onFilterChange({
      genre: newGenre,
      instrumentType: newInstrument,
      sampleType: newType,
      key: newKey,
      sortBy: newSort,
    });
  };

  return (
    <div className="flex flex-wrap gap-4 mb-8 p-4 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-[#00FF88]" />
        <span className="text-sm font-medium text-white">Filter:</span>
      </div>

      <SearchableSelect
        value={genre}
        onChange={(v) => handleChange("genre", v)}
        options={genres}
        placeholder="Genre"
        allLabel="All Genres"
        className="w-36"
      />

      <SearchableSelect
        value={instrumentType}
        onChange={(v) => handleChange("instrument", v)}
        options={INSTRUMENTS}
        placeholder="Instrument"
        allLabel="All Instruments"
        className="w-36"
      />

      <Select
        value={sampleType}
        onValueChange={(v) => handleChange("type", v)}
      >
        <SelectTrigger className="w-32 bg-[#0a0a0a] border-[#2a2a2a] text-white">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="loop">Loops</SelectItem>
          <SelectItem value="one_shot">One-Shots</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={key}
        onValueChange={(v) => handleChange("key", v)}
      >
        <SelectTrigger className="w-32 bg-[#0a0a0a] border-[#2a2a2a] text-white">
          <SelectValue placeholder="Key" />
        </SelectTrigger>
        <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a] max-h-64 overflow-y-auto">
          <SelectItem value="all">All Keys</SelectItem>
          <SelectItem value="Major">Major</SelectItem>
          <SelectItem value="Minor">Minor</SelectItem>
          <div className="h-px bg-[#2a2a2a] my-1" />
          {KEYS.map((k) => (
            <SelectItem key={k} value={k}>
              {k}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={sortBy}
        onValueChange={(v) => handleChange("sort", v)}
      >
        <SelectTrigger className="w-32 bg-[#0a0a0a] border-[#2a2a2a] text-white">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
          <SelectItem value="popular">Most Popular</SelectItem>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="rating">Top Rated</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
