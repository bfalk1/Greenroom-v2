"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Music, Upload, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/lib/hooks/useUser";
import { createClient } from "@/lib/supabase/client";

interface Application {
  id: string;
  status: string;
  reviewNote?: string;
  artistName: string;
  createdAt: string;
}

export default function CreatorApplicationPage() {
  const { user, loading: userLoading } = useUser();
  const [application, setApplication] = useState<Application | null>(null);
  const [loadingApp, setLoadingApp] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    artist_name: "",
    bio: "",
    soundcloud_url: "",
    spotify_url: "",
    instagram_url: "",
    zip_file_path: "",
    zip_file_name: "",
    terms_accepted: false,
  });
  const [fileUploadProgress, setFileUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Fetch existing application on mount
  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setLoadingApp(false);
      return;
    }

    async function fetchApplication() {
      try {
        const res = await fetch("/api/creator/apply");
        if (res.ok) {
          const data = await res.json();
          if (data.application) {
            setApplication(data.application);
          }
        }
      } catch (error) {
        console.error("Failed to fetch application:", error);
      } finally {
        setLoadingApp(false);
      }
    }

    fetchApplication();
  }, [user, userLoading]);

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
      toast.error("Please upload a ZIP file");
      return;
    }

    const maxSizeMB = 50;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast.error(
        `File is too large (${(file.size / 1024 / 1024).toFixed(
          1
        )}MB). Maximum size is ${maxSizeMB}MB.`
      );
      return;
    }

    setUploading(true);
    setFileUploadProgress(10);

    try {
      const supabase = createClient();

      // Generate a unique path for the file
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${user?.id}/${timestamp}_${safeName}`;

      setFileUploadProgress(30);

      const { error } = await supabase.storage
        .from("applications")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        throw error;
      }

      setFileUploadProgress(100);
      setFormData((prev) => ({
        ...prev,
        zip_file_path: filePath,
        zip_file_name: file.name,
      }));
      toast.success("File uploaded successfully");
      setTimeout(() => setFileUploadProgress(0), 1000);
    } catch (error) {
      console.error("File upload error:", error);
      toast.error("File upload failed. Please try again.");
      setFileUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.artist_name ||
      !formData.bio ||
      !formData.zip_file_path ||
      !formData.terms_accepted
    ) {
      toast.error("Please fill in all required fields and accept the terms");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/creator/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistName: formData.artist_name,
          bio: formData.bio,
          socialLinks: {
            soundcloud: formData.soundcloud_url || undefined,
            spotify: formData.spotify_url || undefined,
            instagram: formData.instagram_url || undefined,
          },
          sampleZipUrl: formData.zip_file_path,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit application");
      }

      const data = await res.json();
      setApplication(data.application);
      toast.success(
        "Application submitted successfully! We'll review it shortly."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit application"
      );
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (userLoading || loadingApp) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#00FF88] animate-spin" />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <h1 className="text-3xl font-bold text-white mb-4">
            Sign in to Apply
          </h1>
          <p className="text-[#a1a1a1] mb-6">
            You need to be signed in to submit a creator application.
          </p>
          <Button
            onClick={() => router.push("/auth/login")}
            className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
          >
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  // Show application status if already applied
  if (application) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            {application.status === "PENDING" && (
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
            {application.status === "APPROVED" && (
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
            {application.status === "DENIED" && (
              <>
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <Music className="w-8 h-8 text-red-500" />
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Application Not Approved
                </h1>
                {application.reviewNote && (
                  <p className="text-[#a1a1a1] mb-4">
                    <span className="font-medium text-white">Reason: </span>
                    {application.reviewNote}
                  </p>
                )}
                <p className="text-[#a1a1a1] mb-6">
                  You can resubmit your application with updated information.
                </p>
                <Button
                  onClick={() => setApplication(null)}
                  className="bg-[#00FF88] text-black hover:bg-[#00cc6a]"
                >
                  Resubmit Application
                </Button>
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
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
            <div
              onClick={() => {
                if (!uploading && !formData.zip_file_path) {
                  fileInputRef.current?.click();
                }
              }}
              className={`border-2 border-dashed border-[#2a2a2a] rounded-lg p-8 text-center hover:border-[#00FF88]/50 transition ${
                !uploading && !formData.zip_file_path ? "cursor-pointer" : ""
              }`}
            >
              {formData.zip_file_path ? (
                <div className="space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-[#00FF88] mx-auto" />
                  <p className="text-white font-medium">File uploaded</p>
                  <p className="text-[#a1a1a1] text-sm">
                    {formData.zip_file_name}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFormData((prev) => ({ ...prev, zip_file_path: "", zip_file_name: "" }));
                    }}
                    className="text-xs text-red-400 hover:text-red-300 underline mt-2"
                  >
                    Remove and upload different file
                  </button>
                </div>
              ) : fileUploadProgress > 0 ? (
                <div className="space-y-2">
                  <Loader2 className="w-8 h-8 text-[#00FF88] mx-auto animate-spin" />
                  <div className="w-full bg-[#1a1a1a] rounded-full h-2">
                    <div
                      className="bg-[#00FF88] h-2 rounded-full transition-all"
                      style={{ width: `${fileUploadProgress}%` }}
                    />
                  </div>
                  <p className="text-[#a1a1a1] text-sm">
                    Uploading... {fileUploadProgress}%
                  </p>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-[#a1a1a1] mx-auto mb-2" />
                  <p className="text-white font-medium">Click to upload ZIP file</p>
                  <p className="text-xs text-[#a1a1a1] mt-1">
                    Zip your WAV samples into a single .zip file before uploading
                  </p>
                  <p className="text-xs text-[#a1a1a1]">
                    Must contain 40+ WAV samples (Max 50MB)
                  </p>
                </>
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
            disabled={submitting || uploading || !formData.zip_file_path}
            className="w-full bg-[#00FF88] text-black hover:bg-[#00cc6a] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Application"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
