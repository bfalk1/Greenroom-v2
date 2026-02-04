"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Music, Upload, CheckCircle2, Clock } from "lucide-react";

export default function CreatorApplicationPage() {
  const [application, setApplication] = useState<{
    status: string;
    review_notes?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    artist_name: "",
    bio: "",
    soundcloud_url: "",
    spotify_url: "",
    instagram_url: "",
    zip_file_url: "",
    terms_accepted: false,
  });
  const [fileUploadProgress, setFileUploadProgress] = useState(0);
  const router = useRouter();

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".zip")) {
      alert("Please upload a ZIP file");
      return;
    }

    const maxSizeMB = 50;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert(
        `File is too large (${(file.size / 1024 / 1024).toFixed(
          1
        )}MB). Maximum size is ${maxSizeMB}MB.`
      );
      return;
    }

    try {
      setFileUploadProgress(50);
      // TODO: Replace with Supabase storage upload
      setFileUploadProgress(100);
      setFormData((prev) => ({
        ...prev,
        zip_file_url: "uploaded-file-url",
      }));
      setTimeout(() => setFileUploadProgress(0), 1000);
    } catch (error) {
      console.error("File upload error:", error);
      alert("File upload failed");
      setFileUploadProgress(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.artist_name ||
      !formData.bio ||
      !formData.zip_file_url ||
      !formData.terms_accepted
    ) {
      alert("Please fill in all required fields and accept the terms");
      return;
    }

    setSubmitting(true);
    try {
      // TODO: Replace with Supabase/Prisma call
      setApplication({ status: "pending" });
      alert("Application submitted successfully! We'll review it shortly.");
    } catch (error) {
      alert("Failed to submit application");
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  // Show application status if already applied
  if (application) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            {application.status === "pending" && (
              <>
                <Clock className="w-16 h-16 text-[#00FF88] mx-auto mb-4" />
                <h1 className="text-3xl font-bold text-white mb-2">
                  Application Under Review
                </h1>
                <p className="text-[#a1a1a1] mb-6">
                  We&apos;re reviewing your creator application. This usually
                  takes 1-2 business days.
                </p>
              </>
            )}
            {application.status === "approved" && (
              <>
                <CheckCircle2 className="w-16 h-16 text-[#00FF88] mx-auto mb-4" />
                <h1 className="text-3xl font-bold text-white mb-2">
                  Welcome to GREENROOM Creator!
                </h1>
                <p className="text-[#a1a1a1] mb-6">
                  Your application has been approved. You can now upload and sell
                  samples.
                </p>
                <Button
                  onClick={() => router.push("/creator/dashboard")}
                  className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                >
                  Go to Dashboard
                </Button>
              </>
            )}
            {application.status === "rejected" && (
              <>
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <Music className="w-8 h-8 text-red-500" />
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Application Not Approved
                </h1>
                {application.review_notes && (
                  <p className="text-[#a1a1a1] mb-6">
                    {application.review_notes}
                  </p>
                )}
                <p className="text-[#a1a1a1] mb-6">
                  Please contact support for more information.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Become a GREENROOM Creator
          </h1>
          <p className="text-[#a1a1a1]">
            Share your samples and earn credits from every purchase
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Artist Name */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Artist Name <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="Your public artist name"
              value={formData.artist_name}
              onChange={(e) =>
                handleInputChange("artist_name", e.target.value)
              }
              className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
              required
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Bio <span className="text-red-500">*</span>
            </label>
            <textarea
              placeholder="Tell us about your music style and experience"
              value={formData.bio}
              onChange={(e) => handleInputChange("bio", e.target.value)}
              rows={4}
              className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2 text-white placeholder-[#666] focus:outline-none focus:border-[#00FF88]"
              required
            />
          </div>

          {/* Social Links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                SoundCloud URL
              </label>
              <Input
                type="url"
                placeholder="soundcloud.com/..."
                value={formData.soundcloud_url}
                onChange={(e) =>
                  handleInputChange("soundcloud_url", e.target.value)
                }
                className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Spotify URL
              </label>
              <Input
                type="url"
                placeholder="open.spotify.com/..."
                value={formData.spotify_url}
                onChange={(e) =>
                  handleInputChange("spotify_url", e.target.value)
                }
                className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Instagram URL
              </label>
              <Input
                type="url"
                placeholder="instagram.com/..."
                value={formData.instagram_url}
                onChange={(e) =>
                  handleInputChange("instagram_url", e.target.value)
                }
                className="bg-[#1a1a1a] border-[#2a2a2a] text-white placeholder-[#666]"
              />
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Sample Collection (ZIP) <span className="text-red-500">*</span>
            </label>
            <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg p-8 text-center hover:border-[#00FF88]/50 transition">
              {formData.zip_file_url ? (
                <div className="space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-[#00FF88] mx-auto" />
                  <p className="text-white font-medium">File uploaded</p>
                </div>
              ) : fileUploadProgress > 0 ? (
                <div className="space-y-2">
                  <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                    <div
                      className="bg-[#00FF88] h-2 rounded-full transition-all"
                      style={{ width: `${fileUploadProgress}%` }}
                    />
                  </div>
                  <p className="text-[#a1a1a1] text-sm">
                    {fileUploadProgress}%
                  </p>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Upload className="w-8 h-8 text-[#a1a1a1] mx-auto mb-2" />
                  <p className="text-white font-medium">Upload ZIP file</p>
                  <p className="text-xs text-[#a1a1a1]">
                    Must contain 40+ WAV samples (Max 50MB)
                  </p>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Terms */}
          <div className="flex items-start gap-3">
            <Checkbox
              checked={formData.terms_accepted}
              onCheckedChange={(checked) =>
                handleInputChange("terms_accepted", checked as boolean)
              }
              className="mt-1"
            />
            <label className="text-sm text-[#a1a1a1]">
              I agree to GREENROOM Creator Terms of Service and understand that
              my samples must be original or properly licensed.
              <span className="text-red-500"> *</span>
            </label>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitting || !formData.zip_file_url}
            className="w-full bg-[#00FF88] text-black hover:bg-[#00cc6a] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Application"}
          </Button>
        </form>
      </div>
    </div>
  );
}
