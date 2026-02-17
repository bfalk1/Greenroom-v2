"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, ArrowLeft, Music, Loader2, CheckCircle, AlertCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser } from "@/lib/hooks/useUser";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";

const GENRES = [
  "Hip Hop", "R&B", "Pop", "Electronic", "Trap", "Lo-Fi", 
  "Rock", "Jazz", "Latin", "Afrobeats", "House", "Drill",
  "Ambient", "Indie", "Techno", "Classical", "Reggaeton", 
  "Soul", "Funk", "Country",
];

const INSTRUMENTS = [
  "Drums", "Bass", "Synth", "Guitar", "Piano", "Vocals", 
  "FX", "Strings", "Brass", "Pad",
];

interface SampleToUpload {
  id: string;
  file: File;
  name: string;
  genre: string;
  instrumentType: string;
  sampleType: "LOOP" | "ONE_SHOT";
  key: string;
  bpm: string;
  creditPrice: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

// Parse metadata from filename: SampleName_Key_BPM.wav
function parseFilename(filename: string): { name: string; key: string; bpm: string } {
  const baseName = filename.replace(/\.wav$/i, "");
  const parts = baseName.split(/[_\-\s]+/);
  
  let detectedBpm = "";
  let detectedKey = "";
  const nameParts: string[] = [];
  
  const keyPatterns = [/^([A-G][#b]?)(maj|min|major|minor)?$/i];
  
  for (const part of parts) {
    const bpmMatch = part.match(/^(\d+)(bpm)?$/i);
    if (bpmMatch && !detectedBpm) {
      const num = parseInt(bpmMatch[1]);
      if (num >= 40 && num <= 300) {
        detectedBpm = bpmMatch[1];
        continue;
      }
    }
    
    for (const pattern of keyPatterns) {
      const keyMatch = part.match(pattern);
      if (keyMatch && !detectedKey) {
        const root = keyMatch[1].charAt(0).toUpperCase() + keyMatch[1].slice(1).toLowerCase();
        const quality = keyMatch[2]?.toLowerCase();
        if (quality === "min" || quality === "minor") {
          detectedKey = `${root} Minor`;
        } else {
          detectedKey = `${root} Major`;
        }
        continue;
      }
    }
    
    nameParts.push(part);
  }
  
  return {
    name: nameParts.join(" ") || baseName,
    key: detectedKey,
    bpm: detectedBpm,
  };
}

export default function BatchUploadPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const [samples, setSamples] = useState<SampleToUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [defaultGenre, setDefaultGenre] = useState("Hip Hop");
  const [defaultInstrument, setDefaultInstrument] = useState("Drums");
  const [extractingZip, setExtractingZip] = useState(false);

  const handleFilesSelect = (files: FileList | null) => {
    if (!files) return;
    
    const wavFiles = Array.from(files).filter(f => 
      f.name.toLowerCase().endsWith(".wav") && f.size <= 50 * 1024 * 1024
    );
    
    if (wavFiles.length === 0) {
      toast.error("No valid WAV files found (max 50MB each)");
      return;
    }
    
    const newSamples: SampleToUpload[] = wavFiles.map(file => {
      const parsed = parseFilename(file.name);
      return {
        id: Math.random().toString(36).slice(2),
        file,
        name: parsed.name,
        genre: defaultGenre,
        instrumentType: defaultInstrument,
        sampleType: "LOOP",
        key: parsed.key,
        bpm: parsed.bpm,
        creditPrice: "1",
        status: "pending",
      };
    });
    
    setSamples(prev => [...prev, ...newSamples]);
    toast.success(`Added ${wavFiles.length} samples`);
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
      const wavFiles: File[] = [];
      
      for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        if (!filename.toLowerCase().endsWith(".wav")) continue;
        
        const blob = await zipEntry.async("blob");
        if (blob.size > 50 * 1024 * 1024) continue; // Skip files > 50MB
        
        const baseName = filename.split("/").pop() || filename;
        const wavFile = new File([blob], baseName, { type: "audio/wav" });
        wavFiles.push(wavFile);
      }
      
      if (wavFiles.length === 0) {
        toast.error("No WAV files found in ZIP");
        return;
      }
      
      const newSamples: SampleToUpload[] = wavFiles.map(file => {
        const parsed = parseFilename(file.name);
        return {
          id: Math.random().toString(36).slice(2),
          file,
          name: parsed.name,
          genre: defaultGenre,
          instrumentType: defaultInstrument,
          sampleType: "LOOP",
          key: parsed.key,
          bpm: parsed.bpm,
          creditPrice: "1",
          status: "pending",
        };
      });
      
      setSamples(prev => [...prev, ...newSamples]);
      toast.success(`Extracted ${wavFiles.length} samples from ZIP`);
    } catch (error) {
      console.error("ZIP extraction error:", error);
      toast.error("Failed to extract ZIP file");
    } finally {
      setExtractingZip(false);
    }
  };

  const updateSample = (id: string, field: keyof SampleToUpload, value: string) => {
    setSamples(prev => prev.map(s => 
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const removeSample = (id: string) => {
    setSamples(prev => prev.filter(s => s.id !== id));
  };

  const applyDefaultsToAll = () => {
    setSamples(prev => prev.map(s => ({
      ...s,
      genre: defaultGenre,
      instrumentType: defaultInstrument,
    })));
    toast.success("Applied defaults to all samples");
  };

  const handleUploadAll = async () => {
    if (!user || samples.length === 0) return;
    
    setUploading(true);
    let successCount = 0;
    let errorCount = 0;
    
    for (const sample of samples) {
      if (sample.status === "done") continue;
      
      setSamples(prev => prev.map(s => 
        s.id === sample.id ? { ...s, status: "uploading" } : s
      ));
      
      try {
        // Upload audio file
        const audioPath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.wav`;
        const { error: uploadError } = await supabase.storage
          .from("samples")
          .upload(audioPath, sample.file, { cacheControl: "3600", upsert: false });
        
        if (uploadError) throw uploadError;
        
        const fileUrl = `samples/${audioPath}`;
        
        // Create sample via API
        const res = await fetch("/api/samples", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: sample.name,
            genre: sample.genre,
            instrumentType: sample.instrumentType,
            sampleType: sample.sampleType,
            key: sample.key || null,
            bpm: sample.bpm || null,
            creditPrice: sample.creditPrice,
            tags: "",
            fileUrl,
          }),
        });
        
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create sample");
        }
        
        setSamples(prev => prev.map(s => 
          s.id === sample.id ? { ...s, status: "done" } : s
        ));
        successCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed";
        setSamples(prev => prev.map(s => 
          s.id === sample.id ? { ...s, status: "error", error: message } : s
        ));
        errorCount++;
      }
    }
    
    setUploading(false);
    
    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} samples successfully!`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} samples failed to upload`);
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "CREATOR") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Creator Access Required</h2>
          <p className="text-[#a1a1a1] mb-4">You need a Creator account to upload samples.</p>
          <Button onClick={() => router.push("/marketplace")} className="bg-[#00FF88] text-black hover:bg-[#00cc6a]">
            Browse Marketplace
          </Button>
        </div>
      </div>
    );
  }

  const pendingCount = samples.filter(s => s.status === "pending").length;
  const doneCount = samples.filter(s => s.status === "done").length;

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
            <h1 className="text-2xl font-bold text-white">Batch Upload</h1>
            <p className="text-[#a1a1a1] text-sm">Upload multiple samples at once</p>
          </div>
        </div>

        {/* Naming Convention Info */}
        <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4 mb-6">
          <h3 className="text-white font-medium mb-2">📝 Naming Convention</h3>
          <p className="text-[#a1a1a1] text-sm mb-3">
            Name your files using this format to auto-extract metadata:
          </p>
          <code className="block bg-[#1a1a1a] rounded px-3 py-2 text-[#00FF88] text-sm mb-3">
            SampleName_Key_BPM.wav
          </code>
          <div className="text-xs text-[#666] space-y-1">
            <p><strong className="text-[#a1a1a1]">Examples:</strong></p>
            <p>• <code className="text-[#00FF88]">Dark_Trap_Loop_Am_140.wav</code> → Name: Dark Trap Loop, Key: A Minor, BPM: 140</p>
            <p>• <code className="text-[#00FF88]">Piano_Chords_Gmaj_90bpm.wav</code> → Name: Piano Chords, Key: G Major, BPM: 90</p>
            <p>• <code className="text-[#00FF88]">808_Bass_Cm_128.wav</code> → Name: 808 Bass, Key: C Minor, BPM: 128</p>
          </div>
        </div>

        {/* Upload Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Multiple WAV Files */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-8 text-center hover:border-[#00FF88]/50 transition cursor-pointer bg-[#1a1a1a]"
          >
            <Music className="w-10 h-10 text-[#00FF88] mx-auto mb-3" />
            <p className="text-white font-medium mb-1">Select WAV Files</p>
            <p className="text-[#a1a1a1] text-sm">Choose multiple .wav files</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".wav"
              multiple
              onChange={(e) => handleFilesSelect(e.target.files)}
              className="hidden"
            />
          </div>

          {/* ZIP File */}
          <div
            onClick={() => !extractingZip && zipInputRef.current?.click()}
            className={`border-2 border-dashed border-[#2a2a2a] rounded-lg p-8 text-center hover:border-[#00FF88]/50 transition cursor-pointer bg-[#1a1a1a] ${extractingZip ? "opacity-50" : ""}`}
          >
            {extractingZip ? (
              <Loader2 className="w-10 h-10 text-[#00FF88] mx-auto mb-3 animate-spin" />
            ) : (
              <Package className="w-10 h-10 text-[#00FF88] mx-auto mb-3" />
            )}
            <p className="text-white font-medium mb-1">
              {extractingZip ? "Extracting..." : "Upload Sample Pack (ZIP)"}
            </p>
            <p className="text-[#a1a1a1] text-sm">Extract WAV files from a ZIP</p>
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

        {/* Batch Settings */}
        {samples.length > 0 && (
          <div className="bg-[#00FF88]/5 border border-[#00FF88]/30 rounded-lg p-4 mb-6">
            <h3 className="text-[#00FF88] font-semibold mb-1">🎛️ Batch Settings — Apply to All Samples</h3>
            <p className="text-[#a1a1a1] text-xs mb-4">Set defaults and apply to all samples at once, or edit each sample individually below.</p>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs text-[#a1a1a1] mb-1">Genre</label>
                <select
                  value={defaultGenre}
                  onChange={(e) => setDefaultGenre(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm"
                >
                  {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#a1a1a1] mb-1">Instrument</label>
                <select
                  value={defaultInstrument}
                  onChange={(e) => setDefaultInstrument(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm"
                >
                  {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <Button
                onClick={applyDefaultsToAll}
                className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
              >
                Apply to All Samples
              </Button>
            </div>
          </div>
        )}

        {/* Samples List */}
        {samples.length > 0 && (
          <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden mb-6">
            <div className="p-4 border-b border-[#2a2a2a] flex justify-between items-center">
              <div>
                <h3 className="text-white font-medium">
                  ✏️ Edit Individual Samples — {samples.length} total ({doneCount} uploaded, {pendingCount} pending)
                </h3>
                <p className="text-[#666] text-xs">Click any field to edit that sample&apos;s metadata</p>
              </div>
              <Button
                onClick={() => setSamples([])}
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                Clear All
              </Button>
            </div>
            
            <div className="max-h-[500px] overflow-y-auto">
              {samples.map((sample) => (
                <div
                  key={sample.id}
                  className={`p-4 border-b border-[#2a2a2a] last:border-b-0 ${
                    sample.status === "done" ? "bg-[#00FF88]/5" : 
                    sample.status === "error" ? "bg-red-500/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Status Icon */}
                    <div className="w-8 flex-shrink-0">
                      {sample.status === "uploading" && <Loader2 className="w-5 h-5 text-[#00FF88] animate-spin" />}
                      {sample.status === "done" && <CheckCircle className="w-5 h-5 text-[#00FF88]" />}
                      {sample.status === "error" && <AlertCircle className="w-5 h-5 text-red-400" />}
                      {sample.status === "pending" && <Music className="w-5 h-5 text-[#a1a1a1]" />}
                    </div>
                    
                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <Input
                        value={sample.name}
                        onChange={(e) => updateSample(sample.id, "name", e.target.value)}
                        disabled={sample.status !== "pending"}
                        className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm h-8"
                      />
                    </div>
                    
                    {/* Genre */}
                    <select
                      value={sample.genre}
                      onChange={(e) => updateSample(sample.id, "genre", e.target.value)}
                      disabled={sample.status !== "pending"}
                      className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-white text-sm w-28"
                    >
                      {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    
                    {/* Instrument */}
                    <select
                      value={sample.instrumentType}
                      onChange={(e) => updateSample(sample.id, "instrumentType", e.target.value)}
                      disabled={sample.status !== "pending"}
                      className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-white text-sm w-24"
                    >
                      {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                    
                    {/* Key */}
                    <Input
                      value={sample.key}
                      onChange={(e) => updateSample(sample.id, "key", e.target.value)}
                      placeholder="Key"
                      disabled={sample.status !== "pending"}
                      className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm h-8 w-20"
                    />
                    
                    {/* BPM */}
                    <Input
                      value={sample.bpm}
                      onChange={(e) => updateSample(sample.id, "bpm", e.target.value)}
                      placeholder="BPM"
                      disabled={sample.status !== "pending"}
                      className="bg-[#0a0a0a] border-[#2a2a2a] text-white text-sm h-8 w-16"
                    />
                    
                    {/* Remove */}
                    {sample.status === "pending" && (
                      <button
                        onClick={() => removeSample(sample.id)}
                        className="text-[#a1a1a1] hover:text-red-400 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  {sample.error && (
                    <p className="text-red-400 text-xs mt-2 ml-12">{sample.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Button */}
        {samples.length > 0 && pendingCount > 0 && (
          <div className="flex justify-end">
            <Button
              onClick={handleUploadAll}
              disabled={uploading}
              className="bg-[#00FF88] text-black hover:bg-[#00cc6a] px-8"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload {pendingCount} Samples
                </>
              )}
            </Button>
          </div>
        )}

        {/* Empty State */}
        {samples.length === 0 && (
          <div className="text-center py-16">
            <Upload className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No samples selected</h3>
            <p className="text-[#a1a1a1]">
              Select WAV files or upload a ZIP to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
