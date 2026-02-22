"use client";

import React, { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const GENRES = [
  "Hip Hop",
  "R&B",
  "Pop",
  "Electronic",
  "Trap",
  "Lo-Fi",
  "Rock",
  "Jazz",
  "Latin",
  "Afrobeats",
  "House",
  "Drill",
  "Ambient",
  "Indie",
  "Techno",
  "Classical",
  "Reggaeton",
  "Soul",
  "Funk",
  "Country",
];

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
const SCALES = ["Major", "Minor"];

// Generate all key combinations
const KEYS = NOTES.flatMap(note => SCALES.map(scale => `${note} ${scale}`));

interface FilterState {
  genre: string;
  instrumentType: string;
  sampleType: string;
  key: string;
  scale: string;
  sortBy: string;
}

interface SampleFiltersProps {
  onFilterChange: (filters: FilterState) => void;
}

export function SampleFilters({ onFilterChange }: SampleFiltersProps) {
  const [genre, setGenre] = useState("all");
  const [instrumentType, setInstrumentType] = useState("all");
  const [sampleType, setSampleType] = useState("all");
  const [key, setKey] = useState("all");
  const [scale, setScale] = useState("all");
  const [sortBy, setSortBy] = useState("popular");

  const handleChange = (field: string, value: string) => {
    let newGenre = genre;
    let newInstrument = instrumentType;
    let newType = sampleType;
    let newKey = key;
    let newScale = scale;
    let newSort = sortBy;

    if (field === "genre") newGenre = value;
    if (field === "instrument") newInstrument = value;
    if (field === "type") newType = value;
    if (field === "key") newKey = value;
    if (field === "scale") newScale = value;
    if (field === "sort") newSort = value;

    setGenre(newGenre);
    setInstrumentType(newInstrument);
    setSampleType(newType);
    setKey(newKey);
    setScale(newScale);
    setSortBy(newSort);

    onFilterChange({
      genre: newGenre,
      instrumentType: newInstrument,
      sampleType: newType,
      key: newKey,
      scale: newScale,
      sortBy: newSort,
    });
  };

  return (
    <div className="flex flex-wrap gap-4 mb-8 p-4 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a]">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-[#00FF88]" />
        <span className="text-sm font-medium text-white">Filter:</span>
      </div>

      <Select
        value={genre}
        onValueChange={(v) => handleChange("genre", v)}
      >
        <SelectTrigger className="w-36 bg-[#0a0a0a] border-[#2a2a2a] text-white">
          <SelectValue placeholder="Genre" />
        </SelectTrigger>
        <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a] max-h-64 overflow-y-auto">
          <SelectItem value="all">All Genres</SelectItem>
          {GENRES.map((g) => (
            <SelectItem key={g} value={g}>
              {g}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={instrumentType}
        onValueChange={(v) => handleChange("instrument", v)}
      >
        <SelectTrigger className="w-36 bg-[#0a0a0a] border-[#2a2a2a] text-white">
          <SelectValue placeholder="Instrument" />
        </SelectTrigger>
        <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a] max-h-64 overflow-y-auto">
          <SelectItem value="all">All Instruments</SelectItem>
          {INSTRUMENTS.map((i) => (
            <SelectItem key={i} value={i}>
              {i}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
        <SelectTrigger className="w-24 bg-[#0a0a0a] border-[#2a2a2a] text-white">
          <SelectValue placeholder="Key" />
        </SelectTrigger>
        <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
          <SelectItem value="all">All Keys</SelectItem>
          {NOTES.map((k) => (
            <SelectItem key={k} value={k}>
              {k}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={scale}
        onValueChange={(v) => handleChange("scale", v)}
      >
        <SelectTrigger className="w-28 bg-[#0a0a0a] border-[#2a2a2a] text-white">
          <SelectValue placeholder="Scale" />
        </SelectTrigger>
        <SelectContent className="bg-[#1a1a1a] border-[#2a2a2a]">
          <SelectItem value="all">Maj / Min</SelectItem>
          <SelectItem value="Major">Major</SelectItem>
          <SelectItem value="Minor">Minor</SelectItem>
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
