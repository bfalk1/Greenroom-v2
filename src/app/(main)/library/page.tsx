"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Search, Music, Download, Loader2, CheckSquare, Square, Package, Play, Pause } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/hooks/useUser";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { toast } from "sonner";
import JSZip from "jszip";

interface LibrarySample {
  id: string;
  name: string;
  slug: string;
  creator_id: string;
  artist_name: string;
  genre: string;
  instrument_type: string;
  sample_type: string;
  key: string | null;
  bpm: number | null;
  credit_price: number;
  tags: string[];
  file_url: string;
  signed_url: string | null;
  filename: string;
  download_path: string;
  preview_url: string | null;
  cover_image_url: string | null;
  average_rating: number;
  total_ratings: number;
  purchased_at: string;
}

export default function LibraryPage() {
  const { user, loading: userLoading } = useUser();
  const [samples, setSamples] = useState<LibrarySample[]>([]);
  const [filtered, setFiltered] = useState<LibrarySample[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element
  useEffect(() => {
    if (typeof window !== "undefined") {
      audioRef.current = new Audio();
      audioRef.current.addEventListener("ended", () => setPlayingId(null));
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Toggle play for a sample
  const togglePlay = useCallback(async (sample: LibrarySample) => {
    const audio = audioRef.current;
    if (!audio) return;

    // If this sample is playing, pause it
    if (playingId === sample.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }

    // Stop any currently playing audio
    audio.pause();

    // Play the new sample
    setIsLoadingAudio(true);
    try {
      const res = await fetch(`/api/samples/${sample.id}/preview`);
      const data = await res.json();
      if (res.ok && data.url) {
        audio.src = data.url;
        audio.currentTime = 0;
        await audio.play();
        setPlayingId(sample.id);
      }
    } catch (err) {
      console.error("Play error:", err);
    } finally {
      setIsLoadingAudio(false);
    }
  }, [playingId]);

  // Stop playback
  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
  }, []);

  // Keyboard navigation
  const handleKeyboardPlay = useCallback((index: number) => {
    const sample = filtered[index];
    if (sample) {
      togglePlay(sample);
    }
  }, [filtered, togglePlay]);

  const { selectedIndex, isSelected: isKeyboardSelected } = useKeyboardNavigation(filtered, {
    enabled: filtered.length > 0 && !loading,
    onPlay: handleKeyboardPlay,
  });

  // Handle Escape to stop playback
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "ArrowLeft") {
        stopPlayback();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [stopPlayback]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(s => s.id)));
    }
  };

  const handleBulkDownload = async () => {
    if (selectedIds.size === 0) return;
    
    setBulkDownloading(true);
    try {
      const selectedSamples = filtered.filter(s => selectedIds.has(s.id));
      const zip = new JSZip();
      
      for (const sample of selectedSamples) {
        toast.loading(`Fetching ${sample.name}...`, { id: `dl-${sample.id}` });
        const res = await fetch(`/api/downloads/${sample.id}`);
        if (res.ok) {
          const blob = await res.blob();
          zip.file(sample.download_path, blob);
          toast.success(`Added ${sample.name}`, { id: `dl-${sample.id}` });
        } else {
          toast.error(`Failed: ${sample.name}`, { id: `dl-${sample.id}` });
        }
      }
      
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Greenroom_${selectedSamples.length}_samples.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Downloaded ${selectedSamples.length} samples!`);
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Bulk download error:", error);
      toast.error("Bulk download failed");
    } finally {
      setBulkDownloading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    fetch("/api/library")
      .then((res) => res.json())
      .then((data) => {
        if (data.samples) {
          setSamples(data.samples);
          setFiltered(data.samples);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      setFiltered(
        samples.filter(
          (s) =>
            s.name.toLowerCase().includes(query.toLowerCase()) ||
            s.artist_name?.toLowerCase().includes(query.toLowerCase()) ||
            s.genre?.toLowerCase().includes(query.toLowerCase()) ||
            s.tags?.some((t) => t.toLowerCase().includes(query.toLowerCase()))
        )
      );
    } else {
      setFiltered(samples);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">My Library</h1>
          <p className="text-[#a1a1a1]">
            {samples.length} sample{samples.length !== 1 ? "s" : ""} purchased
          </p>
          {samples.length > 0 && (
            <p className="text-xs text-[#666] mt-1">
              💡 Drag samples directly into your DAW or click Download. Files save as: <code className="bg-[#2a2a2a] px-1 rounded">Greenroom/Artist/Sample_Key_BPM.wav</code>
            </p>
          )}
        </div>

        {samples.length > 0 && (
          <div className="mb-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 w-5 h-5 text-[#a1a1a1]" />
              <Input
                type="text"
                placeholder="Search your library..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-12 py-3 bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666] rounded-lg"
              />
            </div>
            
            {/* Selection Controls */}
            <div className="flex items-center justify-between">
              <button
                onClick={selectAll}
                className="flex items-center gap-2 text-sm text-[#a1a1a1] hover:text-white transition"
              >
                {selectedIds.size === filtered.length && filtered.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-[#00FF88]" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                {selectedIds.size === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
              </button>
              
              {selectedIds.size > 0 && (
                <Button
                  onClick={handleBulkDownload}
                  disabled={bulkDownloading}
                  className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                >
                  {bulkDownloading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Package className="w-4 h-4 mr-2" />
                  )}
                  Download {selectedIds.size} Selected
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Keyboard Navigation Hint */}
        {filtered.length > 0 && !loading && (
          <div className="mb-4 text-xs text-[#666] flex items-center gap-2">
            <span className="bg-[#2a2a2a] px-2 py-0.5 rounded">↑↓</span> navigate
            <span className="bg-[#2a2a2a] px-2 py-0.5 rounded">Space</span> play/pause
            <span className="bg-[#2a2a2a] px-2 py-0.5 rounded">Esc</span> stop
          </div>
        )}

        {filtered.length > 0 ? (
          <div className="space-y-2">
            {filtered.map((sample, index) => (
              <div
                key={sample.id}
                draggable={!!sample.signed_url}
                onDragStart={(e) => {
                  if (sample.signed_url) {
                    // Chrome DownloadURL format for drag-to-desktop/DAW
                    e.dataTransfer.setData(
                      "DownloadURL",
                      `audio/wav:${sample.filename}:${sample.signed_url}`
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }
                }}
                className={`rounded-lg bg-[#1a1a1a] border transition-all p-4 flex items-center gap-4 ${
                  isKeyboardSelected(index)
                    ? "border-[#00FF88] ring-1 ring-[#00FF88]/50 bg-[#1a1a1a]/80"
                    : playingId === sample.id
                    ? "border-[#00FF88]/40"
                    : selectedIds.has(sample.id)
                    ? "border-[#00FF88]"
                    : "border-[#2a2a2a] hover:border-[#00FF88]/50"
                } ${sample.signed_url ? "cursor-grab active:cursor-grabbing" : ""}`}
                title={sample.signed_url ? "Drag to your DAW or desktop" : ""}
              >
                {/* Play Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay(sample);
                  }}
                  disabled={isLoadingAudio}
                  className="flex-shrink-0 w-10 h-10 rounded-full bg-[#00FF88] text-black hover:bg-[#00cc6a] flex items-center justify-center transition"
                >
                  {isLoadingAudio && playingId === null ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : playingId === sample.id ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>

                {/* Checkbox */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(sample.id);
                  }}
                  className="flex-shrink-0"
                >
                  {selectedIds.has(sample.id) ? (
                    <CheckSquare className="w-5 h-5 text-[#00FF88]" />
                  ) : (
                    <Square className="w-5 h-5 text-[#a1a1a1] hover:text-white" />
                  )}
                </button>

                {/* Cover */}
                <div className="w-14 h-14 flex-shrink-0 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] rounded overflow-hidden">
                  <img
                    src={
                      sample.cover_image_url ||
                      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop"
                    }
                    alt={sample.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate text-sm">
                    {sample.name}
                  </h3>
                  <p className="text-xs text-[#a1a1a1]">
                    {sample.artist_name}
                  </p>
                </div>

                {/* Metadata */}
                <div className="hidden md:flex items-center gap-4 text-xs text-[#a1a1a1]">
                  <span>{sample.genre}</span>
                  {sample.key && <span>{sample.key}</span>}
                  {sample.bpm && <span>{sample.bpm} BPM</span>}
                </div>

                {/* Purchased date */}
                <div className="hidden lg:block text-xs text-[#666]">
                  {new Date(sample.purchased_at).toLocaleDateString()}
                </div>

                {/* Download */}
                <DownloadButton 
                  sampleId={sample.id} 
                  filename={sample.filename}
                  downloadPath={sample.download_path}
                />
              </div>
            ))}
          </div>
        ) : samples.length > 0 ? (
          <div className="text-center py-16">
            <Music className="w-12 h-12 text-[#2a2a2a] mx-auto mb-4" />
            <p className="text-[#a1a1a1]">No samples match your search.</p>
          </div>
        ) : (
          <div className="text-center py-16">
            <Music className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              Your library is empty
            </h3>
            <p className="text-[#a1a1a1] mb-6">
              Purchase samples from the marketplace to add them here.
            </p>
            <Link href="/marketplace">
              <Button className="bg-[#00FF88] text-black hover:bg-[#00cc6a]">
                Browse Marketplace
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

// Store the directory handle globally so it persists across downloads
let greenroomDirHandle: FileSystemDirectoryHandle | null = null;

async function getOrPickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  // Return cached handle if we have one
  if (greenroomDirHandle) {
    // Verify we still have permission
    // @ts-expect-error - File System Access API not fully typed
    const permission = await greenroomDirHandle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") {
      return greenroomDirHandle;
    }
  }
  
  // Ask user to pick a directory
  try {
    // @ts-expect-error - File System Access API
    greenroomDirHandle = await window.showDirectoryPicker({
      mode: "readwrite",
      startIn: "downloads",
    });
    return greenroomDirHandle;
  } catch {
    return null; // User cancelled or API not supported
  }
}

function DownloadButton({ sampleId, filename, downloadPath }: { 
  sampleId: string; 
  filename: string;
  downloadPath: string; // e.g., "Greenroom/ArtistName/Sample.wav"
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      // Fetch the file through our API
      const res = await fetch(`/api/downloads/${sampleId}`);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Download failed");
      }

      const blob = await res.blob();
      
      // Try File System Access API first (Chrome/Edge)
      // @ts-expect-error - Check if API is available
      if (typeof window.showDirectoryPicker === "function") {
        const dirHandle = await getOrPickDirectory();
        
        if (dirHandle) {
          // Parse the path: Greenroom/ArtistName/file.wav
          const pathParts = downloadPath.split("/");
          let currentDir = dirHandle;
          
          // Create nested directories (Greenroom/ArtistName)
          for (let i = 0; i < pathParts.length - 1; i++) {
            currentDir = await currentDir.getDirectoryHandle(pathParts[i], { create: true });
          }
          
          // Write the file
          const fileName = pathParts[pathParts.length - 1];
          const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          
          toast.success(`Saved: ${downloadPath}`);
          setDownloading(false);
          return;
        }
      }
      
      // Fallback: ZIP download for Safari/Firefox or if user cancelled picker
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file(downloadPath, blob);
      const zipBlob = await zip.generateAsync({ type: "blob" });
      
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.replace(".wav", ".zip");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Downloaded: ${filename.replace(".wav", ".zip")}`);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download sample.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      size="sm"
      className="bg-[#00FF88] text-black hover:bg-[#00cc6a] font-medium h-8 px-4"
      onClick={handleDownload}
      disabled={downloading}
    >
      {downloading ? (
        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5 mr-1" />
      )}
      Download
    </Button>
  );
}
