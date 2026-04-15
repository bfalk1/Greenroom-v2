"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, ArrowLeft, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/hooks/useUser";
import { GenreInput } from "@/components/creator/GenreInput";
import { toast } from "sonner";

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

// Accepted preset file extensions per synth
const PRESET_EXTENSIONS: Record<string, string[]> = {
  SERUM: [".fxp"],
  ASTRA: [".fxp", ".zip"],
  SERUM_2: [".fxp"],
  PHASE_PLANT: [".phaseplant", ".zip"],
  SPLICE: [".zip"],
  VITAL: [".vital"],
  SYLENTH1: [".fxp"],
  MASSIVE: [".nmsv", ".zip"],
  BEAT_MAKER: [".zip"],
};

const ALL_EXTENSIONS = [".fxp", ".vital", ".phaseplant", ".nmsv", ".zip", ".aupreset", ".syx"];

export default function CreatorUploadPresetPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    synthName: "",
    presetCategory: "",
    genre: "",
    tags: "",
    creditPrice: "1",
    compatibleVersions: "",
    isInitPreset: false,
  });

  const [presetFile, setPresetFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [presetUploaded, setPresetUploaded] = useState(false);
  const [previewUploaded, setPreviewUploaded] = useState(false);
  const [coverUploaded, setCoverUploaded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced metadata
  const [parameterSnapshot, setParameterSnapshot] = useState<File | null>(null);
  const [modulationInfo, setModulationInfo] = useState("");
  const [macroDescriptions, setMacroDescriptions] = useState([
    { name: "", description: "" },
    { name: "", description: "" },
    { name: "", description: "" },
    { name: "", description: "" },
  ]);

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePresetSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALL_EXTENSIONS.includes(ext)) {
      toast.error(`Invalid file type. Accepted: ${ALL_EXTENSIONS.join(", ")}`);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }

    // Auto-fill name from filename
    if (!formData.name) {
      const baseName = file.name.replace(/\.[^.]+$/, "");
      handleChange("name", baseName);
    }

    setPresetFile(file);
    setPresetUploaded(false);
  };

  const handlePreviewSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Preview audio must be under 20MB");
      return;
    }
    setPreviewFile(file);
    setPreviewUploaded(false);
  };

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Cover image must be under 5MB");
      return;
    }
    setCoverFile(file);
    setCoverUploaded(false);
  };

  const handleMacroChange = (index: number, field: "name" | "description", value: string) => {
    setMacroDescriptions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || user.role !== "CREATOR") {
      toast.error("Creator access required");
      return;
    }

    if (!formData.name || !formData.synthName || !formData.presetCategory || !formData.genre || !presetFile) {
      toast.error("Please fill in all required fields and upload a preset file");
      return;
    }

    if (!previewFile) {
      toast.error("Audio preview is required — buyers need to hear what your preset sounds like");
      return;
    }

    if (presetFile.size === 0) {
      toast.error("Preset file is empty. Please select a valid file.");
      return;
    }

    setUploading(true);

    try {
      // Upload all files via server-side API route (uses service role key)
      const uploadFormData = new FormData();
      uploadFormData.append("presetFile", presetFile);
      uploadFormData.append("previewFile", previewFile);
      if (coverFile) {
        uploadFormData.append("coverFile", coverFile);
      }

      const uploadRes = await fetch("/api/upload/preset", {
        method: "POST",
        body: uploadFormData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error || "File upload failed");
      }

      const { fileUrl, previewUrl, coverImageUrl, fileSizeBytes } = await uploadRes.json();
      setPresetUploaded(true);
      setPreviewUploaded(true);
      if (coverFile) setCoverUploaded(true);

      // Parse parameter snapshot JSON if uploaded
      let parsedParameterSnapshot = null;
      if (parameterSnapshot) {
        try {
          const text = await parameterSnapshot.text();
          parsedParameterSnapshot = JSON.parse(text);
        } catch {
          toast.error("Invalid JSON in parameter snapshot file");
          setUploading(false);
          return;
        }
      }

      // Parse modulation info
      let parsedModulationInfo = null;
      if (modulationInfo.trim()) {
        try {
          parsedModulationInfo = JSON.parse(modulationInfo);
        } catch {
          // Treat as plain text description
          parsedModulationInfo = { description: modulationInfo };
        }
      }

      // Filter empty macros
      const filteredMacros = macroDescriptions.filter(
        (m) => m.name.trim() || m.description.trim()
      );

      // Create preset via API
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          synthName: formData.synthName,
          presetCategory: formData.presetCategory,
          genre: formData.genre,
          tags: formData.tags,
          creditPrice: formData.creditPrice,
          fileUrl,
          previewUrl,
          coverImageUrl,
          compatibleVersions: formData.compatibleVersions
            ? formData.compatibleVersions.split(",").map((v: string) => v.trim()).filter(Boolean)
            : [],
          parameterSnapshot: parsedParameterSnapshot,
          modulationInfo: parsedModulationInfo,
          macroDescriptions: filteredMacros.length > 0 ? filteredMacros : null,
          isInitPreset: formData.isInitPreset,
          fileSizeBytes: fileSizeBytes || presetFile.size,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create preset");
      }

      toast.success("Preset uploaded successfully!");
      router.push("/creator/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      toast.error(message);
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <div className="animate-pulse text-[#a1a1a1]">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== "CREATOR") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Creator Access Required</h2>
          <p className="text-[#a1a1a1] mb-4">
            You need a Creator account to upload presets.
          </p>
          <Button
            onClick={() => router.push("/marketplace")}
            className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
          >
            Browse Marketplace
          </Button>
        </div>
      </div>
    );
  }

  const acceptedExtensions = formData.synthName
    ? PRESET_EXTENSIONS[formData.synthName]?.join(",") || ALL_EXTENSIONS.join(",")
    : ALL_EXTENSIONS.join(",");

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
            <h1 className="text-2xl font-bold text-white">Upload Preset</h1>
            <p className="text-[#a1a1a1] text-sm">
              Share your synth presets with the community
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6"
        >
          {/* Preset Name */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Preset Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g., Ethereal Pad, Heavy Bass Drop"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Description
            </label>
            <textarea
              placeholder="Describe your preset - what it sounds like, how to use it..."
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              rows={3}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a] resize-none"
            />
          </div>

          {/* Synth & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Synth <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.synthName}
                onChange={(e) => {
                  handleChange("synthName", e.target.value);
                  // Clear file if synth changes (different format)
                  if (presetFile) {
                    setPresetFile(null);
                    setPresetUploaded(false);
                  }
                }}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#39b54a]"
                required
              >
                <option value="">Select Synth</option>
                {SYNTHS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.presetCategory}
                onChange={(e) => handleChange("presetCategory", e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#39b54a]"
                required
              >
                <option value="">Select Category</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Genre & Tags */}
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
                Tags (comma separated)
              </label>
              <Input
                type="text"
                placeholder="e.g., warm, analog, lush"
                value={formData.tags}
                onChange={(e) => handleChange("tags", e.target.value)}
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>
          </div>

          {/* Credit Price & Compatible Versions */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Credit Price {!user?.is_whitelisted && <span className="text-[#666] font-normal">(max 5)</span>}
              </label>
              <Input
                type="number"
                min="1"
                max={user?.is_whitelisted ? 50 : 5}
                value={formData.creditPrice}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  const max = user?.is_whitelisted ? 50 : 5;
                  handleChange("creditPrice", String(Math.min(val, max)));
                }}
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Compatible Versions
              </label>
              <Input
                type="text"
                placeholder="e.g., 1.3.0, 1.4.0"
                value={formData.compatibleVersions}
                onChange={(e) => handleChange("compatibleVersions", e.target.value)}
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>
          </div>

          {/* Init Preset Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.isInitPreset}
              onChange={(e) => handleChange("isInitPreset", e.target.checked)}
              className="rounded border-[#2a2a2a] bg-[#0a0a0a] text-[#39b54a] focus:ring-[#39b54a]"
            />
            <span className="text-sm text-[#a1a1a1]">This is an init/template preset</span>
          </label>

          {/* Preset File Upload */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Preset File <span className="text-red-500">*</span>
            </label>
            {formData.synthName && (
              <p className="text-xs text-[#666] mb-2">
                Accepted formats for {SYNTHS.find(s => s.value === formData.synthName)?.label}:{" "}
                {PRESET_EXTENSIONS[formData.synthName]?.join(", ") || "any preset format"}
              </p>
            )}
            <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-6 text-center hover:border-[#39b54a]/50 transition">
              {presetFile ? (
                <div className="flex items-center justify-center gap-2">
                  {presetUploaded ? (
                    <CheckCircle className="w-5 h-5 text-[#39b54a]" />
                  ) : (
                    <Upload className="w-5 h-5 text-[#39b54a]" />
                  )}
                  <span className="text-[#39b54a] text-sm font-medium">
                    {presetFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPresetFile(null);
                      setPresetUploaded(false);
                    }}
                    className="text-[#a1a1a1] hover:text-white ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Upload className="w-6 h-6 text-[#a1a1a1] mx-auto mb-2" />
                  <p className="text-[#a1a1a1] text-sm">
                    Click to upload preset file (max 10MB)
                  </p>
                  <input
                    type="file"
                    accept={acceptedExtensions}
                    onChange={handlePresetSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Audio Preview Upload */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Audio Preview <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-[#666] mb-2">
              Upload a short audio demo showcasing this preset — buyers need to hear it before purchasing
            </p>
            <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-6 text-center hover:border-[#39b54a]/50 transition">
              {previewFile ? (
                <div className="flex items-center justify-center gap-2">
                  {previewUploaded ? (
                    <CheckCircle className="w-5 h-5 text-[#39b54a]" />
                  ) : (
                    <Upload className="w-5 h-5 text-[#39b54a]" />
                  )}
                  <span className="text-[#39b54a] text-sm font-medium">
                    {previewFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewFile(null);
                      setPreviewUploaded(false);
                    }}
                    className="text-[#a1a1a1] hover:text-white ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Upload className="w-6 h-6 text-[#a1a1a1] mx-auto mb-2" />
                  <p className="text-[#a1a1a1] text-sm">
                    Click to upload audio preview (WAV/MP3, max 20MB)
                  </p>
                  <input
                    type="file"
                    accept=".wav,.mp3,.ogg,.m4a"
                    onChange={handlePreviewSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Cover Image Upload */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Cover Art (optional)
            </label>
            <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-6 text-center hover:border-[#39b54a]/50 transition">
              {coverFile ? (
                <div className="flex items-center justify-center gap-2">
                  {coverUploaded ? (
                    <CheckCircle className="w-5 h-5 text-[#39b54a]" />
                  ) : (
                    <Upload className="w-5 h-5 text-[#39b54a]" />
                  )}
                  <span className="text-[#39b54a] text-sm font-medium">
                    {coverFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCoverFile(null);
                      setCoverUploaded(false);
                    }}
                    className="text-[#a1a1a1] hover:text-white ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Upload className="w-6 h-6 text-[#a1a1a1] mx-auto mb-2" />
                  <p className="text-[#a1a1a1] text-sm">
                    Click to upload image (JPG/PNG, max 5MB)
                  </p>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={handleCoverSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Advanced Section */}
          <div className="border border-[#2a2a2a] rounded-lg">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-[#a1a1a1] hover:text-white transition"
            >
              <span>Advanced Metadata</span>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showAdvanced && (
              <div className="px-4 pb-4 space-y-4 border-t border-[#2a2a2a]">
                {/* Parameter Snapshot */}
                <div className="pt-4">
                  <label className="block text-sm font-medium text-white mb-2">
                    Parameter Snapshot (JSON file)
                  </label>
                  <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-4 text-center">
                    {parameterSnapshot ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-[#39b54a] text-sm">{parameterSnapshot.name}</span>
                        <button
                          type="button"
                          onClick={() => setParameterSnapshot(null)}
                          className="text-[#a1a1a1] hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <p className="text-[#a1a1a1] text-sm">Upload JSON file</p>
                        <input
                          type="file"
                          accept=".json"
                          onChange={(e) => setParameterSnapshot(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Modulation Info */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Modulation Info
                  </label>
                  <textarea
                    placeholder="Describe modulation routing (JSON or plain text)"
                    value={modulationInfo}
                    onChange={(e) => setModulationInfo(e.target.value)}
                    rows={3}
                    className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white placeholder-[#666] focus:outline-none focus:border-[#39b54a] resize-none text-sm"
                  />
                </div>

                {/* Macro Descriptions */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Macro Descriptions
                  </label>
                  <div className="space-y-2">
                    {macroDescriptions.map((macro, i) => (
                      <div key={i} className="grid grid-cols-5 gap-2">
                        <Input
                          type="text"
                          placeholder={`Macro ${i + 1}`}
                          value={macro.name}
                          onChange={(e) => handleMacroChange(i, "name", e.target.value)}
                          className="col-span-2 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666] text-sm"
                        />
                        <Input
                          type="text"
                          placeholder="Description"
                          value={macro.description}
                          onChange={(e) => handleMacroChange(i, "description", e.target.value)}
                          className="col-span-3 bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666] text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-2">
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
              disabled={uploading || !presetFile || !previewFile}
              className="flex-1 bg-[#39b54a] text-black hover:bg-[#2e9140] disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload Preset"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
