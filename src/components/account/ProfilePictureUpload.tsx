"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface ProfilePictureUploadProps {
  userId: string;
  currentUrl?: string | null;
  onUploadSuccess: (url: string) => void;
}

export function ProfilePictureUpload({
  userId,
  currentUrl,
  onUploadSuccess,
}: ProfilePictureUploadProps) {
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

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }

    setUploading(true);
    try {
      // Generate unique filename
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filename = `${userId}-${Date.now()}.${ext}`;
      const path = filename;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      setPreview(publicUrl);
      onUploadSuccess(publicUrl);
      toast.success("Profile picture updated!");
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUploadSuccess("");
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Current Avatar Preview */}
      <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[#00FF88] to-[#00cc6a] overflow-hidden border-2 border-[#2a2a2a]">
        {preview ? (
          <img
            src={preview}
            alt="Profile"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-black">
            <Upload className="w-8 h-8" />
          </div>
        )}
      </div>

      {/* Upload Button */}
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="profile-picture-input"
        />
        <label htmlFor="profile-picture-input">
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
                  Change Picture
                </>
              )}
            </span>
          </Button>
        </label>

        {preview && (
          <Button
            variant="outline"
            size="icon"
            onClick={handleRemove}
            className="border-[#2a2a2a] hover:bg-[#1a1a1a]"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <p className="text-xs text-[#a1a1a1] text-center">
        JPG, PNG or GIF. Max 5MB.
      </p>
    </div>
  );
}
