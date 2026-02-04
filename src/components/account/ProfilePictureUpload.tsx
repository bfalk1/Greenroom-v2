"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, X } from "lucide-react";

interface ProfilePictureUploadProps {
  user: { creator_avatar_url?: string | null };
  onUploadSuccess: (url?: string) => void;
}

export function ProfilePictureUpload({
  user,
  onUploadSuccess,
}: ProfilePictureUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(
    user?.creator_avatar_url || null
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be smaller than 5MB");
      return;
    }

    setUploading(true);
    try {
      // TODO: Replace with Supabase storage upload
      const url = URL.createObjectURL(file);
      setPreview(url);
      onUploadSuccess?.(url);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload image");
    } finally {
      setUploading(false);
    }
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
            onClick={() => setPreview(null)}
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
