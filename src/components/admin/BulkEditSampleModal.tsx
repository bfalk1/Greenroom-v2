"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeySelector } from "@/components/ui/KeySelector";
import { GENRES, INSTRUMENTS } from "@/lib/sampleMetadata";

type FieldKey =
  | "genre"
  | "instrumentType"
  | "sampleType"
  | "key"
  | "bpm"
  | "creditPrice"
  | "tags";

// Module-scoped so it keeps a stable identity across renders — defining it
// inside the modal would remount the inputs (and drop focus) on every keystroke.
function FieldRow({
  checked,
  onToggle,
  label,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-2 w-28 flex-shrink-0 cursor-pointer">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
        <span className="text-sm text-white">{label}</span>
      </label>
      <div className={`flex-1 ${checked ? "" : "opacity-40 pointer-events-none"}`}>
        {children}
      </div>
    </div>
  );
}

interface BulkEditSampleModalProps {
  open: boolean;
  count: number;
  onClose: () => void;
  /** Apply only the toggled-on fields. Parent performs the API call. */
  onApply: (changes: Record<string, unknown>) => Promise<void> | void;
  maxCreditPrice?: number;
}

export function BulkEditSampleModal({
  open,
  count,
  onClose,
  onApply,
  maxCreditPrice = 50,
}: BulkEditSampleModalProps) {
  const [enabled, setEnabled] = useState<Record<FieldKey, boolean>>({
    genre: false,
    instrumentType: false,
    sampleType: false,
    key: false,
    bpm: false,
    creditPrice: false,
    tags: false,
  });
  const [genre, setGenre] = useState("");
  const [instrumentType, setInstrumentType] = useState(INSTRUMENTS[0]);
  const [sampleType, setSampleType] = useState<"LOOP" | "ONE_SHOT">("LOOP");
  const [key, setKey] = useState("");
  const [bpm, setBpm] = useState("");
  const [creditPrice, setCreditPrice] = useState("1");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  // The modal stays mounted (to avoid input focus loss), so its state would
  // otherwise persist across opens — re-applying stale toggles/values to a
  // different selection. Reset to a clean, all-unchecked form on each open.
  useEffect(() => {
    if (!open) return;
    setEnabled({
      genre: false,
      instrumentType: false,
      sampleType: false,
      key: false,
      bpm: false,
      creditPrice: false,
      tags: false,
    });
    setGenre("");
    setInstrumentType(INSTRUMENTS[0]);
    setSampleType("LOOP");
    setKey("");
    setBpm("");
    setCreditPrice("1");
    setTags("");
  }, [open]);

  const toggle = (f: FieldKey) =>
    setEnabled((prev) => ({ ...prev, [f]: !prev[f] }));

  const anyEnabled = Object.values(enabled).some(Boolean);

  const handleApply = async () => {
    const changes: Record<string, unknown> = {};
    if (enabled.genre) changes.genre = genre;
    if (enabled.instrumentType) changes.instrumentType = instrumentType;
    if (enabled.sampleType) changes.sampleType = sampleType;
    if (enabled.key) changes.key = key;
    if (enabled.bpm) changes.bpm = bpm === "" ? null : bpm;
    if (enabled.creditPrice) changes.creditPrice = creditPrice;
    if (enabled.tags) changes.tags = tags;

    if (Object.keys(changes).length === 0) return;

    try {
      setSaving(true);
      await onApply(changes);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Bulk Edit — {count} sample{count === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription className="text-[#a1a1a1]">
            Check a field to change it on all selected samples. Unchecked fields
            are left untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <FieldRow checked={enabled.genre} onToggle={() => toggle("genre")} label="Genre">
            <input
              type="text"
              list="bulk-genre-list"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="Genre"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm"
            />
            <datalist id="bulk-genre-list">
              {GENRES.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </FieldRow>

          <FieldRow checked={enabled.instrumentType} onToggle={() => toggle("instrumentType")} label="Instrument">
            <select
              value={instrumentType}
              onChange={(e) => setInstrumentType(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm"
            >
              {INSTRUMENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow checked={enabled.sampleType} onToggle={() => toggle("sampleType")} label="Type">
            <select
              value={sampleType}
              onChange={(e) =>
                setSampleType(e.target.value as "LOOP" | "ONE_SHOT")
              }
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm"
            >
              <option value="LOOP">Loop</option>
              <option value="ONE_SHOT">One-Shot</option>
            </select>
          </FieldRow>

          <FieldRow checked={enabled.key} onToggle={() => toggle("key")} label="Key">
            <KeySelector value={key} onChange={setKey} placeholder="Key" />
          </FieldRow>

          <FieldRow checked={enabled.bpm} onToggle={() => toggle("bpm")} label="BPM">
            <Input
              type="number"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              placeholder="BPM"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm"
            />
          </FieldRow>

          <FieldRow checked={enabled.creditPrice} onToggle={() => toggle("creditPrice")} label="Credits">
            <Input
              type="number"
              value={creditPrice}
              onChange={(e) => setCreditPrice(e.target.value)}
              min={1}
              max={maxCreditPrice}
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm"
            />
          </FieldRow>

          <FieldRow checked={enabled.tags} onToggle={() => toggle("tags")} label="Tags">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="comma, separated, tags"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm"
            />
          </FieldRow>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-[#2a2a2a] text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={saving || !anyEnabled}
            className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
          >
            {saving ? "Applying..." : `Apply to ${count}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
