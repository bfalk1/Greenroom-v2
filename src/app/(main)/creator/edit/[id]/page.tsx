"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/hooks/useUser";
import { toast } from "sonner";
import { GenreInput } from "@/components/creator/GenreInput";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES = ["Major", "Minor"];
const INSTRUMENTS = [
  "Drums", "Bass", "Synth", "Guitar", "Piano", "Vocals", "FX", "Strings", "Brass", "Pad",
];

export default function EditSamplePage() {
  const router = useRouter();
  const params = useParams();
  const sampleId = params.id as string;
  const { user, loading: userLoading } = useUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    genre: "",
    instrumentType: "",
    sampleType: "LOOP" as "LOOP" | "ONE_SHOT",
    note: "",
    scale: "",
    bpm: "",
    creditPrice: "1",
    tags: "",
  });

  useEffect(() => {
    if (sampleId) {
      fetchSample();
    }
  }, [sampleId]);

  const fetchSample = async () => {
    try {
      const res = await fetch(`/api/samples/${sampleId}`);
      if (!res.ok) throw new Error("Failed to fetch sample");
      const data = await res.json();
      const sample = data.sample;

      // Parse key into note and scale
      let note = "";
      let scale = "";
      if (sample.key) {
        const parts = sample.key.split(" ");
        note = parts[0] || "";
        scale = parts[1] || "";
      }

      setFormData({
        name: sample.name || "",
        genre: sample.genre || "",
        instrumentType: sample.instrument_type || "",
        sampleType: sample.sample_type || "LOOP",
        note,
        scale,
        bpm: sample.bpm?.toString() || "",
        creditPrice: sample.credit_price?.toString() || "1",
        tags: Array.isArray(sample.tags) ? sample.tags.join(", ") : "",
      });
    } catch (error) {
      toast.error("Failed to load sample");
      router.push("/creator/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.genre || !formData.instrumentType) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/samples/${sampleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          genre: formData.genre,
          instrumentType: formData.instrumentType,
          sampleType: formData.sampleType,
          key: formData.note ? (formData.scale ? `${formData.note} ${formData.scale}` : formData.note) : null,
          bpm: formData.bpm || null,
          creditPrice: formData.creditPrice,
          tags: formData.tags,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update sample");
      }

      toast.success("Sample updated!");
      router.push("/creator/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update sample");
    } finally {
      setSaving(false);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#00FF88]" />
      </div>
    );
  }

  if (!user || (user.role !== "CREATOR" && user.role !== "ADMIN")) {
    router.push("/marketplace");
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            onClick={() => router.push("/creator/dashboard")}
            className="text-[#a1a1a1] hover:text-white hover:bg-[#1a1a1a]"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">Edit Sample</h1>
            <p className="text-[#a1a1a1] text-sm">Update your sample details</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6"
        >
          {/* Sample Name */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Sample Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              required
            />
          </div>

          {/* Genre & Instrument Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Genre <span className="text-red-500">*</span>
              </label>
              <GenreInput
                value={formData.genre}
                onChange={(v) => handleChange("genre", v)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Instrument Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.instrumentType}
                onChange={(e) => handleChange("instrumentType", e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#00FF88]"
                required
              >
                <option value="">Select Instrument</option>
                {INSTRUMENTS.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Type, Note, Scale, BPM */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Sample Type
              </label>
              <select
                value={formData.sampleType}
                onChange={(e) => handleChange("sampleType", e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#00FF88]"
              >
                <option value="LOOP">Loop</option>
                <option value="ONE_SHOT">One-Shot</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Note
              </label>
              <select
                value={formData.note}
                onChange={(e) => handleChange("note", e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#00FF88]"
              >
                <option value="">—</option>
                {NOTES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Scale
              </label>
              <select
                value={formData.scale}
                onChange={(e) => handleChange("scale", e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#00FF88]"
              >
                <option value="">—</option>
                {SCALES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                BPM
              </label>
              <Input
                type="number"
                min="20"
                max="300"
                value={formData.bpm}
                onChange={(e) => handleChange("bpm", e.target.value)}
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              />
            </div>
          </div>

          {/* Tags & Credit Price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Tags (comma separated)
              </label>
              <Input
                type="text"
                value={formData.tags}
                onChange={(e) => handleChange("tags", e.target.value)}
                placeholder="e.g., dark, ambient, heavy"
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Credit Price
              </label>
              <Input
                type="number"
                min="1"
                max="100"
                value={formData.creditPrice}
                onChange={(e) => handleChange("creditPrice", e.target.value)}
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/creator/dashboard")}
              className="flex-1 border-[#2a2a2a] text-white hover:bg-[#2a2a2a]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 bg-[#00FF88] text-black hover:bg-[#00cc6a]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
