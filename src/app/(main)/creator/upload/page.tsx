"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, ArrowLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/hooks/useUser";
import { createClient } from "@/lib/supabase/client";
import { trackSampleUpload } from "@/lib/analytics";
import { toast } from "sonner";
import { GenreInput } from "@/components/creator/GenreInput";
import { KeySelector } from "@/components/ui/KeySelector";

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

// Recommended filename format: SampleName_Type_Genre_Key_BPM.wav
// Examples: Dark_Trap_Loop_Cm_140.wav, Kick_OneShot_Hip_Hop.wav
const FILENAME_PATTERN = /^[A-Za-z0-9_\-\s]+\.wav$/;

// Keywords that indicate sample type
const LOOP_KEYWORDS = ['loop', 'loops', 'melody', 'chord', 'progression', 'beat', 'pattern', 'stem'];
const ONESHOT_KEYWORDS = ['oneshot', 'one-shot', 'one shot', 'hit', 'stab', 'kick', 'snare', 'clap', 'hihat', 'hi-hat', 'perc', 'fx', 'shot'];

// Genre detection keywords
const GENRE_KEYWORDS: Record<string, string[]> = {
  'Hip-Hop': ['hiphop', 'hip hop', 'hip-hop', 'rap', 'boom bap', 'boombap'],
  'Trap': ['trap'],
  'R&B': ['rnb', 'r&b', 'r and b'],
  'Electronic': ['electronic', 'edm', 'electronica'],
  'Lo-Fi': ['lofi', 'lo-fi', 'lo fi', 'chillhop'],
  'House': ['house', 'deep house', 'tech house'],
  'Techno': ['techno'],
  'Drill': ['drill', 'uk drill'],
  'Pop': ['pop'],
  'Rock': ['rock'],
  'Jazz': ['jazz'],
  'Afrobeats': ['afro', 'afrobeats', 'afrobeat', 'amapiano'],
  'Latin': ['latin', 'reggaeton'],
  'Ambient': ['ambient', 'chill'],
};

// Parse metadata from filename
function parseFilename(filename: string): { 
  name: string | null; 
  key: string | null; 
  bpm: string | null;
  sampleType: "LOOP" | "ONE_SHOT" | null;
  genre: string | null;
  isValid: boolean;
  warning: string | null;
} {
  const baseName = filename.replace(/\.wav$/i, "");
  const parts = baseName.split(/[_\-\s]+/);
  const lowerBaseName = baseName.toLowerCase();
  
  let detectedBpm: string | null = null;
  let detectedKey: string | null = null;
  let detectedType: "LOOP" | "ONE_SHOT" | null = null;
  let detectedGenre: string | null = null;
  const nameParts: string[] = [];
  
  // Detect sample type from full filename
  const isOneShot = ONESHOT_KEYWORDS.some(kw => lowerBaseName.includes(kw.replace(/\s+/g, '')) || lowerBaseName.includes(kw.replace(/\s+/g, '_')));
  const isLoop = LOOP_KEYWORDS.some(kw => lowerBaseName.includes(kw));
  
  if (isOneShot && !isLoop) {
    detectedType = "ONE_SHOT";
  } else if (isLoop && !isOneShot) {
    detectedType = "LOOP";
  }
  
  // Detect genre from full filename
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lowerBaseName.includes(kw.replace(/\s+/g, '')) || lowerBaseName.includes(kw.replace(/\s+/g, '_'))) {
        detectedGenre = genre;
        break;
      }
    }
    if (detectedGenre) break;
  }
  
  // Key patterns: Am, Cmaj, C#min, Db, etc.
  const keyPatterns = [
    /^([A-G][#b]?)(maj|min|major|minor)?$/i,
    /^([A-G][#b]?)\s*(Major|Minor)$/i,
  ];
  
  for (const part of parts) {
    // Check for BPM (number between 40-300)
    const bpmMatch = part.match(/^(\d+)(bpm)?$/i);
    if (bpmMatch && !detectedBpm) {
      const num = parseInt(bpmMatch[1]);
      if (num >= 40 && num <= 300) {
        detectedBpm = bpmMatch[1];
        continue;
      }
    }
    
    // Check for key
    for (const pattern of keyPatterns) {
      const keyMatch = part.match(pattern);
      if (keyMatch && !detectedKey) {
        const root = keyMatch[1].charAt(0).toUpperCase() + keyMatch[1].slice(1);
        const quality = keyMatch[2]?.toLowerCase();
        if (quality === "min" || quality === "minor") {
          detectedKey = `${root} Minor`;
        } else if (quality === "maj" || quality === "major") {
          detectedKey = `${root} Major`;
        } else {
          // Default to major if no quality specified
          detectedKey = `${root} Major`;
        }
        continue;
      }
    }
    
    // Skip type keywords from name
    const lowerPart = part.toLowerCase();
    if (LOOP_KEYWORDS.includes(lowerPart) || ONESHOT_KEYWORDS.includes(lowerPart)) {
      continue;
    }
    
    // Skip genre keywords from name
    let isGenreKeyword = false;
    for (const keywords of Object.values(GENRE_KEYWORDS)) {
      if (keywords.some(kw => kw.replace(/\s+/g, '').toLowerCase() === lowerPart)) {
        isGenreKeyword = true;
        break;
      }
    }
    if (isGenreKeyword) continue;
    
    nameParts.push(part);
  }
  
  // Check if filename follows recommended format
  const hasSpecialChars = /[^A-Za-z0-9_\-\s.]/.test(filename);
  const isValid = FILENAME_PATTERN.test(filename);
  
  let warning: string | null = null;
  if (hasSpecialChars) {
    warning = "Filename contains special characters. Recommended format: SampleName_Type_Genre_Key_BPM.wav";
  } else if (!detectedBpm && !detectedKey && !detectedType && nameParts.length === parts.length) {
    warning = "Consider naming format: SampleName_Loop_HipHop_Am_120.wav";
  }
  
  return {
    name: baseName, // Use full filename as sample name (like Splice)
    key: detectedKey,
    bpm: detectedBpm,
    sampleType: detectedType,
    genre: detectedGenre,
    isValid,
    warning,
  };
}

export default function CreatorUploadPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();

  const [formData, setFormData] = useState({
    name: "",
    genre: "",
    instrumentType: "",
    sampleType: "LOOP" as "LOOP" | "ONE_SHOT",
    key: "",
    bpm: "",
    creditPrice: "1",
    tags: "",
  });

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [audioUploaded, setAudioUploaded] = useState(false);
  const [coverUploaded, setCoverUploaded] = useState(false);
  const [filenameWarning, setFilenameWarning] = useState<string | null>(null);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".wav")) {
      toast.error("Only WAV files are accepted");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File size must be under 50MB");
      return;
    }
    
    // Parse filename for metadata
    const parsed = parseFilename(file.name);
    setFilenameWarning(parsed.warning);
    
    // Auto-fill form fields from filename
    const updates: Partial<typeof formData> = {};
    
    // Always use filename as sample name
    if (parsed.name) {
      updates.name = parsed.name;
    }
    if (parsed.key && !formData.key) {
      updates.key = parsed.key;
    }
    if (parsed.bpm && !formData.bpm) {
      updates.bpm = parsed.bpm;
    }
    if (parsed.sampleType && formData.sampleType === "LOOP") {
      // Only auto-fill if still default
      updates.sampleType = parsed.sampleType;
    }
    if (parsed.genre && !formData.genre) {
      // Match to our GENRES array
      const matchedGenre = GENRES.find(g => g.toLowerCase() === parsed.genre!.toLowerCase());
      if (matchedGenre) {
        updates.genre = matchedGenre;
      }
    }
    
    if (Object.keys(updates).length > 0) {
      setFormData((prev) => ({ ...prev, ...updates }));
      const fields = Object.keys(updates).join(", ");
      toast.success(`Auto-filled: ${fields} 🎵`);
    }
    
    setAudioFile(file);
    setAudioUploaded(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || user.role !== "CREATOR") {
      toast.error("Creator access required");
      return;
    }

    if (!formData.name || !formData.genre || !formData.instrumentType || !audioFile) {
      toast.error("Please fill in all required fields and upload an audio file");
      return;
    }

    // Validate file size - prevent 0-byte uploads
    if (audioFile.size === 0) {
      toast.error("Audio file is empty (0 bytes). Please select a valid audio file.");
      return;
    }

    setUploading(true);

    try {
      // Generate waveform data from the audio file
      let waveformData: number[] | null = null;
      try {
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const rawData = audioBuffer.getChannelData(0);
        
        const samples = 80;
        const blockSize = Math.floor(rawData.length / samples);
        const peaks: number[] = [];
        
        for (let i = 0; i < samples; i++) {
          const blockStart = blockSize * i;
          let peak = 0;
          for (let j = 0; j < blockSize; j++) {
            const abs = Math.abs(rawData[blockStart + j] || 0);
            if (abs > peak) peak = abs;
          }
          peaks.push(peak);
        }
        
        const maxValue = Math.max(...peaks);
        waveformData = maxValue > 0 ? peaks.map(n => n / maxValue) : null;
        audioContext.close();
      } catch (e) {
        console.error("Failed to generate waveform:", e);
      }

      // Upload audio file to Supabase Storage
      const audioExt = audioFile.name.split(".").pop();
      const audioPath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${audioExt}`;

      const { error: audioError } = await supabase.storage
        .from("samples")
        .upload(audioPath, audioFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (audioError) {
        throw new Error(`Audio upload failed: ${audioError.message}`);
      }
      setAudioUploaded(true);

      // Get the file URL (private bucket — use signed URL or path)
      const fileUrl = `samples/${audioPath}`;

      // Upload cover image if provided
      let coverImageUrl: string | null = null;
      if (coverFile) {
        const coverExt = coverFile.name.split(".").pop();
        const coverPath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${coverExt}`;

        const { error: coverError } = await supabase.storage
          .from("covers")
          .upload(coverPath, coverFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (coverError) {
          throw new Error(`Cover upload failed: ${coverError.message}`);
        }
        setCoverUploaded(true);

        const {
          data: { publicUrl },
        } = supabase.storage.from("covers").getPublicUrl(coverPath);
        coverImageUrl = publicUrl;
      }

      // Create sample via API
      // Note: previewUrl is NOT set here - it will be generated server-side
      // as a compressed, truncated MP3 to prevent theft of full WAV files
      const res = await fetch("/api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          genre: formData.genre,
          instrumentType: formData.instrumentType,
          sampleType: formData.sampleType,
          key: formData.key || null,
          bpm: formData.bpm || null,
          creditPrice: formData.creditPrice,
          tags: formData.tags,
          fileUrl,
          coverImageUrl,
          waveformData,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create sample");
      }

      trackSampleUpload({
        genre: formData.genre,
        sampleType: formData.sampleType,
        creditPrice: Number(formData.creditPrice),
      });
      toast.success("Sample uploaded successfully! 🎵");
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
            You need a Creator account to upload samples.
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
            <h1 className="text-2xl font-bold text-white">Upload Sample</h1>
            <p className="text-[#a1a1a1] text-sm">
              Share your sounds with the world
            </p>
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
              placeholder="e.g., Deep House Groove 120 BPM"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
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
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#39b54a]"
                required
              >
                <option value="">Select Instrument</option>
                {INSTRUMENTS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Type, Key, BPM */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Sample Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.sampleType}
                onChange={(e) => handleChange("sampleType", e.target.value)}
                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#39b54a]"
              >
                <option value="LOOP">Loop</option>
                <option value="ONE_SHOT">One-Shot</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Key
              </label>
              <KeySelector
                value={formData.key}
                onChange={(v) => handleChange("key", v)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                BPM
              </label>
              <Input
                type="number"
                min="20"
                max="300"
                placeholder="e.g., 120"
                value={formData.bpm}
                onChange={(e) => handleChange("bpm", e.target.value)}
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
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
                placeholder="e.g., chill, dark, bouncy"
                value={formData.tags}
                onChange={(e) => handleChange("tags", e.target.value)}
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>
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
          </div>

          {/* Audio File Upload */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Audio File (WAV) <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-[#666] mb-2">
              💡 Smart naming: <code className="bg-[#2a2a2a] px-1 rounded">Name_Type_Genre_Key_BPM.wav</code> auto-fills fields!
              <br />
              <span className="text-[#555]">Examples: Dark_Loop_Trap_Am_140.wav, Kick_OneShot_HipHop.wav</span>
            </p>
            <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-6 text-center hover:border-[#39b54a]/50 transition">
              {audioFile ? (
                <div className="flex items-center justify-center gap-2">
                  {audioUploaded ? (
                    <CheckCircle className="w-5 h-5 text-[#39b54a]" />
                  ) : (
                    <Upload className="w-5 h-5 text-[#39b54a]" />
                  )}
                  <span className="text-[#39b54a] text-sm font-medium">
                    {audioFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAudioFile(null);
                      setAudioUploaded(false);
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
                    Click to upload WAV file (max 50MB)
                  </p>
                  <input
                    type="file"
                    accept=".wav"
                    onChange={handleAudioSelect}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {filenameWarning && (
              <p className="text-xs text-yellow-500 mt-2">
                ⚠️ {filenameWarning}
              </p>
            )}
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
              disabled={uploading || !audioFile}
              className="flex-1 bg-[#39b54a] text-black hover:bg-[#2e9140] disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload Sample"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
