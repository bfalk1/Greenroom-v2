"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const GENRES = [
  "Electronic",
  "Hip-Hop",
  "Pop",
  "Rock",
  "Jazz",
  "Classical",
  "R&B",
  "Country",
  "Latin",
  "Other",
];
const KEYS = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

interface EditSampleModalProps {
  sample: {
    id: string;
    name: string;
    genre: string;
    instrument_type: string;
    sample_type: string;
    key: string;
    bpm?: number;
    credit_price: number;
    tags?: string[];
  };
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function EditSampleModal({
  sample,
  open,
  onClose,
  onSave,
}: EditSampleModalProps) {
  const [formData, setFormData] = useState({
    name: sample.name,
    genre: sample.genre,
    instrument_type: sample.instrument_type,
    sample_type: sample.sample_type,
    key: sample.key,
    bpm: sample.bpm?.toString() || "",
    credit_price: sample.credit_price,
    tags: sample.tags?.join(", ") || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      
      const res = await fetch("/api/mod/samples", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleId: sample.id,
          name: formData.name,
          genre: formData.genre,
          instrumentType: formData.instrument_type,
          sampleType: formData.sample_type,
          key: formData.key,
          bpm: formData.bpm || null,
          creditPrice: formData.credit_price,
          tags: formData.tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save changes");
      }

      onSave();
      onClose();
    } catch (error) {
      console.error("Save error:", error);
      alert(error instanceof Error ? error.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Sample Metadata</DialogTitle>
          <DialogDescription className="text-[#a1a1a1]">
            Modify sample information as a moderator
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-white">Sample Name</Label>
            <Input
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-white">Genre</Label>
              <Select
                value={formData.genre}
                onValueChange={(v) =>
                  setFormData({ ...formData, genre: v })
                }
              >
                <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENRES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white">Instrument Type</Label>
              <Input
                value={formData.instrument_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    instrument_type: e.target.value,
                  })
                }
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-white">Type</Label>
              <Select
                value={formData.sample_type}
                onValueChange={(v) =>
                  setFormData({ ...formData, sample_type: v })
                }
              >
                <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="loop">Loop</SelectItem>
                  <SelectItem value="one_shot">One-Shot</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white">Key</Label>
              <Select
                value={formData.key}
                onValueChange={(v) =>
                  setFormData({ ...formData, key: v })
                }
              >
                <SelectTrigger className="bg-[#0a0a0a] border-[#2a2a2a] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KEYS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white">BPM</Label>
              <Input
                type="number"
                value={formData.bpm}
                onChange={(e) =>
                  setFormData({ ...formData, bpm: e.target.value })
                }
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              />
            </div>
          </div>

          <div>
            <Label className="text-white">Credit Price</Label>
            <Input
              type="number"
              value={formData.credit_price}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  credit_price: parseInt(e.target.value),
                })
              }
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
            />
          </div>

          <div>
            <Label className="text-white">Tags (comma-separated)</Label>
            <Input
              value={formData.tags}
              onChange={(e) =>
                setFormData({ ...formData, tags: e.target.value })
              }
              placeholder="trap, bass, dark"
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="border-[#2a2a2a] text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
