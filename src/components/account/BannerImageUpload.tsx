"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
  const supabase = createClient();

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
      // Upload to Supabase storage
      const fileExt = file.name.split(".").pop();
      const filePath = `${userId}/banner-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("banners")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("banners")
        .getPublicUrl(filePath);

      // Update user profile with banner URL
      const res = await fetch("/api/user/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banner_url: publicUrl }),
      });

      if (!res.ok) {
        throw new Error("Failed to update profile");
      }

      setPreview(publicUrl);
      onUploadSuccess?.(publicUrl);
      toast.success("Banner uploaded!");
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Failed to upload banner");
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
            className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
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
