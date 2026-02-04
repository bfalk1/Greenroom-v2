"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

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

export function SampleFilters() {
  return (
    <aside className="w-64 shrink-0 space-y-6">
      <div>
        <Label className="text-sm font-medium">Search</Label>
        <Input placeholder="Search samples..." className="mt-1.5" />
      </div>

      <Separator />

      <div>
        <Label className="mb-2 text-sm font-medium">Genre</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {GENRES.map((genre) => (
            <button
              key={genre}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-emerald-500 hover:text-emerald-500"
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <Label className="mb-2 text-sm font-medium">Instrument</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {INSTRUMENTS.map((instrument) => (
            <button
              key={instrument}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-emerald-500 hover:text-emerald-500"
            >
              {instrument}
            </button>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-sm font-medium">BPM Range</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input type="number" placeholder="Min" className="w-20" />
          <span className="text-muted-foreground">–</span>
          <Input type="number" placeholder="Max" className="w-20" />
        </div>
      </div>
    </aside>
  );
}
