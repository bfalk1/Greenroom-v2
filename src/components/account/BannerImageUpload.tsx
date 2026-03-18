"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface BannerImageUploadProps {
  userId: string;
  currentUrl?: string | null;
  onUploadSuccess: (url?: string) => void;
}

export function BannerImageUpload({
  userId,
  currentUrl,
  onUploadSuccess,
}: BannerImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be smaller than 10MB");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload/banner", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();
      setPreview(url);
      onUploadSuccess?.(url);
      toast.success("Banner uploaded!");
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload banner");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full h-32 rounded-lg bg-gradient-to-r from-[#1a1a1a] to-[#2a2a2a] overflow-hidden border-2 border-[#2a2a2a]">
        {preview ? (
          <img
            src={preview}
            alt="Banner"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#a1a1a1]">
            <Upload className="w-8 h-8" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="banner-upload-input"
        />
        <label htmlFor="banner-upload-input">
          <Button
            asChild
            disabled={uploading}
            className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
          >
            <span className="cursor-pointer">
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  {preview ? "Change Banner" : "Upload Banner"}
                </>
              )}
            </span>
          </Button>
        </label>

        {preview && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPreview(null)}
            className="border-[#2a2a2a] hover:bg-[#1a1a1a]"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <p className="text-xs text-[#a1a1a1]">
        JPG, PNG or GIF. Max 10MB. Recommended: 1500x400px
      </p>
    </div>
  );
}
