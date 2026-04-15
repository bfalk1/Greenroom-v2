"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, X, ArrowLeft, Loader2, CheckCircle, AlertCircle,
  Package, Play, Pause, Sliders, Music, Link2, Link2Off,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/hooks/useUser";
import { GenreInput } from "@/components/creator/GenreInput";
import { toast } from "sonner";
import JSZip from "jszip";

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

const PRESET_EXTENSIONS = [".fxp", ".vital", ".phaseplant", ".nmsv", ".aupreset", ".syx"];
const AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg", ".m4a"];

interface PresetToUpload {
  id: string;
  presetFile: File;
  previewFile: File | null;
  name: string;
  synthName: string;
  presetCategory: string;
  genre: string;
  creditPrice: string;
  tags: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  matched: boolean; // whether a preview audio was auto-matched
}

/** Strip extension and normalize for matching: lowercase, trim, collapse whitespace/underscores */
function stemName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[_\-\s]+/g, " ")
    .trim();
}

export default function BatchUploadPresetsPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [presets, setPresets] = useState<PresetToUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [extractingZip, setExtractingZip] = useState(false);

  // Batch defaults
  const [defaultSynth, setDefaultSynth] = useState("");
  const [defaultCategory, setDefaultCategory] = useState("");
  const [defaultGenre, setDefaultGenre] = useState("");
  const [defaultCreditPrice, setDefaultCreditPrice] = useState("1");

  // Audio preview
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const togglePreview = (preset: PresetToUpload) => {
    if (!preset.previewFile) return;

    if (playingId === preset.id) {
      audioRef.current?.pause();
      audioRef.current = null;
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      setPlayingId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);

    const url = URL.createObjectURL(preset.previewFile);
    audioUrlRef.current = url;
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => {
      setPlayingId(null);
      URL.revokeObjectURL(url);
      audioUrlRef.current = null;
    };
    audio.play();
    setPlayingId(preset.id);
  };

  /**
   * Core matching logic: given arrays of preset files and audio files,
   * pair them by filename stem. Returns PresetToUpload entries.
   */
  const matchFiles = (
    presetFiles: File[],
    audioFiles: File[]
  ): PresetToUpload[] => {
    // Build a lookup map: stem → audio file
    const audioMap = new Map<string, File>();
    for (const af of audioFiles) {
      audioMap.set(stemName(af.name), af);
    }

    return presetFiles.map((pf) => {
      const stem = stemName(pf.name);
      const matchedAudio = audioMap.get(stem) || null;
      return {
        id: Math.random().toString(36).slice(2),
        presetFile: pf,
        previewFile: matchedAudio,
        name: pf.name.replace(/\.[^.]+$/, ""),
        synthName: defaultSynth,
        presetCategory: defaultCategory,
        genre: defaultGenre,
        creditPrice: defaultCreditPrice,
        tags: "",
        status: "pending" as const,
        matched: matchedAudio !== null,
      };
    });
  };

  const handleFilesSelect = (files: FileList | null) => {
    if (!files) return;

    const allFiles = Array.from(files);
    const presetFiles = allFiles.filter((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return PRESET_EXTENSIONS.includes(ext) && f.size <= 10 * 1024 * 1024;
    });
    const audioFiles = allFiles.filter((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return AUDIO_EXTENSIONS.includes(ext) && f.size <= 20 * 1024 * 1024;
    });

    if (presetFiles.length === 0) {
      toast.error("No valid preset files found (max 10MB each)");
      return;
    }

    const newPresets = matchFiles(presetFiles, audioFiles);
    const matchedCount = newPresets.filter((p) => p.matched).length;

    setPresets((prev) => [...prev, ...newPresets]);

    if (matchedCount > 0) {
      toast.success(
        `Added ${presetFiles.length} presets — ${matchedCount} auto-matched with audio previews`
      );
    } else if (audioFiles.length > 0) {
      toast.info(
        `Added ${presetFiles.length} presets. ${audioFiles.length} audio files found but names didn't match any preset files.`
      );
    } else {
      toast.success(`Added ${presetFiles.length} presets — drop matching WAV files to auto-pair audio previews`);
    }
  };

  const handleZipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Please select a ZIP file");
      return;
    }

    setExtractingZip(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const presetFiles: File[] = [];
      const audioFiles: File[] = [];

      for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        const baseName = filename.split("/").pop() || filename;
        const ext = "." + baseName.split(".").pop()?.toLowerCase();

        if (PRESET_EXTENSIONS.includes(ext)) {
          const blob = await zipEntry.async("blob");
          if (blob.size <= 10 * 1024 * 1024) {
            presetFiles.push(new File([blob], baseName, { type: "application/octet-stream" }));
          }
        } else if (AUDIO_EXTENSIONS.includes(ext)) {
          const blob = await zipEntry.async("blob");
          if (blob.size <= 20 * 1024 * 1024) {
            const mimeType = ext === ".wav" ? "audio/wav" : ext === ".mp3" ? "audio/mpeg" : "audio/ogg";
            audioFiles.push(new File([blob], baseName, { type: mimeType }));
          }
        }
      }

      if (presetFiles.length === 0) {
        toast.error("No preset files found in ZIP");
        return;
      }

      const newPresets = matchFiles(presetFiles, audioFiles);
      const matchedCount = newPresets.filter((p) => p.matched).length;

      setPresets((prev) => [...prev, ...newPresets]);
      toast.success(
        `Extracted ${presetFiles.length} presets from ZIP — ${matchedCount} matched with audio previews`
      );
    } catch (error) {
      console.error("ZIP extraction error:", error);
      toast.error("Failed to extract ZIP file");
    } finally {
      setExtractingZip(false);
    }
  };

  /** Manually attach an audio preview to a preset */
  const handleAttachPreview = (presetId: string, file: File) => {
    setPresets((prev) =>
      prev.map((p) =>
        p.id === presetId ? { ...p, previewFile: file, matched: true } : p
      )
    );
  };

  const updatePreset = (id: string, field: keyof PresetToUpload, value: string) => {
    setPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const removePreset = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const applyDefaultsToAll = () => {
    setPresets((prev) =>
      prev.map((p) => ({
        ...p,
        synthName: defaultSynth || p.synthName,
        presetCategory: defaultCategory || p.presetCategory,
        genre: defaultGenre || p.genre,
        creditPrice: defaultCreditPrice || p.creditPrice,
      }))
    );
    toast.success("Applied defaults to all presets");
  };

  // Upload a single preset
  const uploadSingle = async (
    preset: PresetToUpload
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: "Not logged in" };

    if (!preset.previewFile) {
      setPresets((prev) =>
        prev.map((p) =>
          p.id === preset.id
            ? { ...p, status: "error", error: "Audio preview is required" }
            : p
        )
      );
      return { success: false, error: "Audio preview is required" };
    }

    if (!preset.synthName || !preset.presetCategory || !preset.genre) {
      setPresets((prev) =>
        prev.map((p) =>
          p.id === preset.id
            ? { ...p, status: "error", error: "Synth, category, and genre are required" }
            : p
        )
      );
      return { success: false, error: "Missing required fields" };
    }

    setPresets((prev) =>
      prev.map((p) => (p.id === preset.id ? { ...p, status: "uploading" } : p))
    );

    try {
      if (preset.presetFile.size === 0) throw new Error("Preset file is empty");

      // Upload files via server-side API route (uses service role key)
      const uploadFormData = new FormData();
      uploadFormData.append("presetFile", preset.presetFile);
      uploadFormData.append("previewFile", preset.previewFile);

      const uploadRes = await fetch("/api/upload/preset", {
        method: "POST",
        body: uploadFormData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "File upload failed");
      }

      const { fileUrl, previewUrl } = await uploadRes.json();

      // Create preset via API
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: preset.name,
          synthName: preset.synthName,
          presetCategory: preset.presetCategory,
          genre: preset.genre,
          creditPrice: preset.creditPrice,
          tags: preset.tags,
          fileUrl,
          previewUrl,
          fileSizeBytes: preset.presetFile.size,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create preset");
      }

      setPresets((prev) =>
        prev.map((p) => (p.id === preset.id ? { ...p, status: "done" } : p))
      );
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setPresets((prev) =>
        prev.map((p) =>
          p.id === preset.id ? { ...p, status: "error", error: message } : p
        )
      );
      return { success: false, error: message };
    }
  };

  const MAX_CONCURRENT = 2;

  const handleUploadAll = async () => {
    if (!user || presets.length === 0) return;

    setUploading(true);
    let successCount = 0;
    let errorCount = 0;

    const pending = presets.filter((p) => p.status === "pending");

    for (let i = 0; i < pending.length; i += MAX_CONCURRENT) {
      const batch = pending.slice(i, i + MAX_CONCURRENT);
      const results = await Promise.all(batch.map(uploadSingle));
      for (const r of results) {
        if (r.success) successCount++;
        else errorCount++;
      }
    }

    setUploading(false);

    if (successCount > 0) toast.success(`Uploaded ${successCount} presets!`);
    if (errorCount > 0) toast.error(`${errorCount} presets failed`);
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "CREATOR") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Creator Access Required</h2>
          <p className="text-[#a1a1a1] mb-4">You need a Creator account to upload presets.</p>
          <Button onClick={() => router.push("/marketplace")} className="bg-[#39b54a] text-black hover:bg-[#2e9140]">
            Browse Marketplace
          </Button>
        </div>
      </div>
    );
  }

  const pendingCount = presets.filter((p) => p.status === "pending").length;
  const doneCount = presets.filter((p) => p.status === "done").length;
  const unmatchedCount = presets.filter((p) => p.status === "pending" && !p.previewFile).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            <h1 className="text-2xl font-bold text-white">Batch Upload Presets</h1>
            <p className="text-[#a1a1a1] text-sm">Upload multiple synth presets with auto-matched audio previews</p>
          </div>
        </div>

        {/* How it works */}
        <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4 mb-6">
          <h3 className="text-white font-medium mb-2">How auto-matching works</h3>
          <p className="text-[#a1a1a1] text-sm mb-3">
            Name your audio previews to match your preset files. The system pairs them by filename:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="bg-[#1a1a1a] rounded px-3 py-2">
              <p className="text-[#39b54a] font-medium mb-1">Preset files</p>
              <code className="text-[#666]">Ethereal_Pad.fxp</code><br />
              <code className="text-[#666]">Heavy_Bass.fxp</code><br />
              <code className="text-[#666]">Bright_Lead.vital</code>
            </div>
            <div className="bg-[#1a1a1a] rounded px-3 py-2">
              <p className="text-[#39b54a] font-medium mb-1">Audio previews (same name, .wav)</p>
              <code className="text-[#666]">Ethereal_Pad.wav</code> <span className="text-[#39b54a]">&#10003; matched</span><br />
              <code className="text-[#666]">Heavy_Bass.wav</code> <span className="text-[#39b54a]">&#10003; matched</span><br />
              <code className="text-[#666]">Bright_Lead.wav</code> <span className="text-[#39b54a]">&#10003; matched</span>
            </div>
          </div>
          <p className="text-[#666] text-xs mt-3">
            Select both preset files and audio files together, or upload a ZIP containing both. Unmatched presets can have audio attached manually.
          </p>
        </div>

        {/* Upload Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-8 text-center hover:border-[#39b54a]/50 transition cursor-pointer bg-[#1a1a1a]"
          >
            <Sliders className="w-10 h-10 text-[#39b54a] mx-auto mb-3" />
            <p className="text-white font-medium mb-1">Select Files</p>
            <p className="text-[#a1a1a1] text-sm">
              Choose preset files (.fxp, .vital, etc.) and matching audio files (.wav, .mp3)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={[...PRESET_EXTENSIONS, ...AUDIO_EXTENSIONS].join(",")}
              multiple
              onChange={(e) => handleFilesSelect(e.target.files)}
              className="hidden"
            />
          </div>

          <div
            onClick={() => !extractingZip && zipInputRef.current?.click()}
            className={`border-2 border-dashed border-[#2a2a2a] rounded-lg p-8 text-center hover:border-[#39b54a]/50 transition cursor-pointer bg-[#1a1a1a] ${
              extractingZip ? "opacity-50" : ""
            }`}
          >
            {extractingZip ? (
              <Loader2 className="w-10 h-10 text-[#39b54a] mx-auto mb-3 animate-spin" />
            ) : (
              <Package className="w-10 h-10 text-[#39b54a] mx-auto mb-3" />
            )}
            <p className="text-white font-medium mb-1">
              {extractingZip ? "Extracting..." : "Upload Preset Pack (ZIP)"}
            </p>
            <p className="text-[#a1a1a1] text-sm">ZIP with preset files + matching audio previews</p>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              onChange={handleZipSelect}
              className="hidden"
              disabled={extractingZip}
            />
          </div>
        </div>

        {/* Batch Defaults */}
        {presets.length > 0 && (
          <div className="bg-[#39b54a]/5 border border-[#39b54a]/30 rounded-lg p-4 mb-6">
            <h3 className="text-[#39b54a] font-semibold mb-1">Batch Settings</h3>
            <p className="text-[#a1a1a1] text-xs mb-4">
              Set defaults and apply to all presets, or edit individually below.
            </p>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs text-[#a1a1a1] mb-1">Synth</label>
                <select
                  value={defaultSynth}
                  onChange={(e) => setDefaultSynth(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm w-32"
                >
                  <option value="">Select</option>
                  {SYNTHS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#a1a1a1] mb-1">Category</label>
                <select
                  value={defaultCategory}
                  onChange={(e) => setDefaultCategory(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm w-32"
                >
                  <option value="">Select</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#a1a1a1] mb-1">Genre</label>
                <div className="w-32">
                  <GenreInput
                    value={defaultGenre}
                    onChange={(v) => setDefaultGenre(v)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#a1a1a1] mb-1">Credits</label>
                <Input
                  type="number"
                  value={defaultCreditPrice}
                  onChange={(e) => setDefaultCreditPrice(e.target.value)}
                  className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm h-9 w-20"
                  min="1"
                />
              </div>
              <Button onClick={applyDefaultsToAll} className="bg-[#39b54a] text-black hover:bg-[#2e9140]">
                Apply to All
              </Button>
            </div>
          </div>
        )}

        {/* Warning for unmatched presets */}
        {unmatchedCount > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <p className="text-yellow-500 text-sm">
              <strong>{unmatchedCount} preset{unmatchedCount > 1 ? "s" : ""}</strong> missing audio preview.
              Audio previews are required — click the attach button on each row to add one, or re-upload with matching filenames.
            </p>
          </div>
        )}

        {/* Preset List */}
        {presets.length > 0 && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden mb-6">
            <div className="p-4 border-b border-[#2a2a2a] flex justify-between items-center">
              <div>
                <h3 className="text-white font-medium">
                  {presets.length} preset{presets.length !== 1 ? "s" : ""} — {doneCount} uploaded, {pendingCount} pending
                </h3>
                <p className="text-[#666] text-xs">Edit metadata per-row. Audio preview is required for each.</p>
              </div>
              <Button
                onClick={() => setPresets([])}
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                Clear All
              </Button>
            </div>

            <div className="max-h-[500px] overflow-y-auto">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className={`p-4 border-b border-[#2a2a2a] last:border-b-0 ${
                    preset.status === "done"
                      ? "bg-[#39b54a]/5"
                      : preset.status === "error"
                      ? "bg-red-500/5"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Preview Play Button */}
                    <button
                      onClick={() => togglePreview(preset)}
                      disabled={!preset.previewFile}
                      className={`w-8 h-8 flex items-center justify-center rounded-full transition flex-shrink-0 ${
                        !preset.previewFile
                          ? "bg-[#2a2a2a] text-[#3a3a3a] cursor-not-allowed"
                          : playingId === preset.id
                          ? "bg-[#39b54a] text-black"
                          : "bg-[#2a2a2a] text-[#a1a1a1] hover:bg-[#3a3a3a] hover:text-white"
                      }`}
                    >
                      {playingId === preset.id ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>

                    {/* Status */}
                    <div className="w-6 flex-shrink-0">
                      {preset.status === "uploading" && <Loader2 className="w-4 h-4 text-[#39b54a] animate-spin" />}
                      {preset.status === "done" && <CheckCircle className="w-4 h-4 text-[#39b54a]" />}
                      {preset.status === "error" && <AlertCircle className="w-4 h-4 text-red-400" />}
                      {preset.status === "pending" && (
                        preset.matched ? (
                          <span title="Audio matched"><Link2 className="w-4 h-4 text-[#39b54a]" /></span>
                        ) : (
                          <span title="No audio preview"><Link2Off className="w-4 h-4 text-yellow-500" /></span>
                        )
                      )}
                    </div>

                    {/* Name */}
                    <Input
                      value={preset.name}
                      onChange={(e) => updatePreset(preset.id, "name", e.target.value)}
                      disabled={preset.status !== "pending"}
                      className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm h-8 flex-1 min-w-[120px]"
                    />

                    {/* Synth */}
                    <select
                      value={preset.synthName}
                      onChange={(e) => updatePreset(preset.id, "synthName", e.target.value)}
                      disabled={preset.status !== "pending"}
                      className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-white text-sm w-28"
                    >
                      <option value="">Synth</option>
                      {SYNTHS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>

                    {/* Category */}
                    <select
                      value={preset.presetCategory}
                      onChange={(e) => updatePreset(preset.id, "presetCategory", e.target.value)}
                      disabled={preset.status !== "pending"}
                      className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-white text-sm w-28"
                    >
                      <option value="">Category</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>

                    {/* Genre */}
                    <Input
                      value={preset.genre}
                      onChange={(e) => updatePreset(preset.id, "genre", e.target.value)}
                      placeholder="Genre"
                      disabled={preset.status !== "pending"}
                      className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm h-8 w-24"
                    />

                    {/* Credits */}
                    <Input
                      type="number"
                      value={preset.creditPrice}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        const max = user?.is_whitelisted ? 50 : 5;
                        updatePreset(preset.id, "creditPrice", String(Math.min(val, max)));
                      }}
                      disabled={preset.status !== "pending"}
                      className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm h-8 w-16"
                      min="1"
                    />

                    {/* Attach preview manually */}
                    {preset.status === "pending" && !preset.previewFile && (
                      <label className="cursor-pointer flex items-center gap-1 px-2 py-1 rounded bg-yellow-500/20 text-yellow-500 text-xs hover:bg-yellow-500/30 transition flex-shrink-0">
                        <Music className="w-3 h-3" />
                        Attach audio
                        <input
                          type="file"
                          accept={AUDIO_EXTENSIONS.join(",")}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleAttachPreview(preset.id, f);
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                    {preset.status === "pending" && preset.previewFile && (
                      <span className="text-[#39b54a] text-xs flex-shrink-0 flex items-center gap-1" title={preset.previewFile.name}>
                        <Music className="w-3 h-3" />
                        {preset.previewFile.name.length > 15
                          ? preset.previewFile.name.slice(0, 12) + "..."
                          : preset.previewFile.name}
                      </span>
                    )}

                    {/* Remove */}
                    {preset.status === "pending" && (
                      <button
                        onClick={() => removePreset(preset.id)}
                        className="text-[#a1a1a1] hover:text-red-400 transition flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {preset.error && (
                    <p className="text-red-400 text-xs mt-2 ml-12">{preset.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Button */}
        {presets.length > 0 && pendingCount > 0 && (
          <div className="flex justify-end">
            <Button
              onClick={handleUploadAll}
              disabled={uploading || unmatchedCount > 0}
              className="bg-[#39b54a] text-black hover:bg-[#2e9140] px-8 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : unmatchedCount > 0 ? (
                <>
                  <AlertCircle className="w-4 h-4 mr-2" />
                  {unmatchedCount} Missing Audio Preview{unmatchedCount > 1 ? "s" : ""}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload {pendingCount} Preset{pendingCount > 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        )}

        {/* Empty State */}
        {presets.length === 0 && (
          <div className="text-center py-16">
            <Upload className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No presets selected</h3>
            <p className="text-[#a1a1a1]">
              Select preset files + matching audio previews, or upload a ZIP containing both
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
