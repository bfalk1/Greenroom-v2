"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X } from "lucide-react";

const GENRES = [
  "Electronic",
  "Hip-Hop",
  "Pop",
  "Rock",
  "R&B",
  "Ambient",
  "Indie",
  "Techno",
  "House",
  "Trap",
  "Jazz",
  "Classical",
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

interface SampleUploadFormProps {
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function SampleUploadForm({
  userId,
  onSuccess,
  onCancel,
}: SampleUploadFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    genre: "",
    instrument_type: "",
    sample_type: "loop",
    key: "",
    bpm: "",
    credit_price: "1",
    tags: "",
    file_url: "",
    cover_art_url: "",
  });
  const [uploading, setUploading] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [coverProgress, setCoverProgress] = useState(0);
  const [audioFileName, setAudioFileName] = useState("");

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setAudioFileName(file.name);
      setAudioProgress(50);
      // TODO: Replace with Supabase storage upload
      setAudioProgress(100);
      setFormData((prev) => ({ ...prev, file_url: "uploaded-audio-url" }));
      setTimeout(() => setAudioProgress(0), 1000);
    } catch (error) {
      console.error("Audio upload error:", error);
      alert("Audio upload failed");
      setAudioProgress(0);
      setAudioFileName("");
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCoverProgress(50);
      // TODO: Replace with Supabase storage upload
      setCoverProgress(100);
      setFormData((prev) => ({ ...prev, cover_art_url: "uploaded-cover-url" }));
      setTimeout(() => setCoverProgress(0), 1000);
    } catch (error) {
      console.error("Cover upload error:", error);
      alert("Cover upload failed");
      setCoverProgress(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.name ||
      !formData.genre ||
      !formData.instrument_type ||
      !formData.key ||
      !formData.file_url
    ) {
      alert(
        "Please fill in all required fields and upload an audio file"
      );
      return;
    }

    setUploading(true);
    try {
      // TODO: Replace with Supabase/Prisma call
      onSuccess();
    } catch (error) {
      alert("Failed to upload sample");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 mb-8"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-white">Upload New Sample</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-[#a1a1a1] hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Sample Name */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Sample Name <span className="text-red-500">*</span>
        </label>
        <Input
          type="text"
          placeholder="e.g., Deep House Loop 120 BPM"
          value={formData.name}
          onChange={(e) => handleInputChange("name", e.target.value)}
          className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
          required
        />
      </div>

      {/* Genre & Instrument */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Genre <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.genre}
            onChange={(e) => handleInputChange("genre", e.target.value)}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#39b54a]"
            required
          >
            <option value="">Select Genre</option>
            {GENRES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Instrument <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            placeholder="e.g., Drums, Bass, Synth"
            value={formData.instrument_type}
            onChange={(e) =>
              handleInputChange("instrument_type", e.target.value)
            }
            className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
            required
          />
        </div>
      </div>

      {/* Type, Key, BPM */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Type <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.sample_type}
            onChange={(e) =>
              handleInputChange("sample_type", e.target.value)
            }
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#39b54a]"
          >
            <option value="loop">Loop</option>
            <option value="one_shot">One-Shot</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Key <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.key}
            onChange={(e) => handleInputChange("key", e.target.value)}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#39b54a]"
            required
          >
            <option value="">Select Key</option>
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            BPM
          </label>
          <Input
            type="number"
            placeholder="e.g., 120"
            value={formData.bpm}
            onChange={(e) => handleInputChange("bpm", e.target.value)}
            className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
          />
        </div>
      </div>

      {/* Tags & Price */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Tags (comma separated)
          </label>
          <Input
            type="text"
            placeholder="e.g., ambient, chill, lo-fi"
            value={formData.tags}
            onChange={(e) => handleInputChange("tags", e.target.value)}
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
            value={formData.credit_price}
            onChange={(e) =>
              handleInputChange("credit_price", e.target.value)
            }
            className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
          />
        </div>
      </div>

      {/* Audio File Upload */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Audio File (WAV) <span className="text-red-500">*</span>
        </label>
        <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-6 text-center hover:border-[#39b54a]/50 transition">
          {formData.file_url ? (
            <div>
              <p className="text-[#39b54a] text-sm font-medium">
                Audio uploaded ✓
              </p>
              <p className="text-[#a1a1a1] text-xs mt-1 truncate">
                {audioFileName}
              </p>
            </div>
          ) : audioProgress > 0 ? (
            <div className="w-full bg-[#0a0a0a] rounded-full h-2">
              <div
                className="bg-[#39b54a] h-2 rounded-full transition-all"
                style={{ width: `${audioProgress}%` }}
              />
            </div>
          ) : (
            <label className="cursor-pointer">
              <Upload className="w-5 h-5 text-[#a1a1a1] mx-auto mb-2" />
              <p className="text-[#a1a1a1] text-sm">Upload WAV file</p>
              <input
                type="file"
                accept=".wav"
                onChange={handleAudioUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Cover Art Upload */}
      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Cover Art (optional)
        </label>
        <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-6 text-center hover:border-[#39b54a]/50 transition">
          {formData.cover_art_url ? (
            <p className="text-[#39b54a] text-sm">Cover uploaded ✓</p>
          ) : coverProgress > 0 ? (
            <div className="w-full bg-[#0a0a0a] rounded-full h-2">
              <div
                className="bg-[#39b54a] h-2 rounded-full transition-all"
                style={{ width: `${coverProgress}%` }}
              />
            </div>
          ) : (
            <label className="cursor-pointer">
              <Upload className="w-5 h-5 text-[#a1a1a1] mx-auto mb-2" />
              <p className="text-[#a1a1a1] text-sm">Upload image</p>
              <input
                type="file"
                accept=".jpg,.jpeg,.png"
                onChange={handleCoverUpload}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1 border-[#2a2a2a] text-white hover:bg-[#1a1a1a]"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={uploading || !formData.file_url}
          className="flex-1 bg-[#39b54a] text-black hover:bg-[#2e9140] disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload Sample"}
        </Button>
      </div>
    </form>
  );
}
