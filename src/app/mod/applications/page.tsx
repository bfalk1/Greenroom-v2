"use client";

import React, { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { CreatorReviewPanel } from "@/components/admin/CreatorReviewPanel";

interface Application {
  id: string;
  user_id: string;
  artist_name: string;
  bio: string;
  soundcloud_url?: string;
  spotify_url?: string;
  instagram_url?: string;
  zip_file_url: string;
  status: string;
}

const MOCK_APPLICATIONS: Application[] = [
  {
    id: "a1",
    user_id: "u1",
    artist_name: "DJ Phoenix",
    bio: "Electronic music producer with 5 years of experience specializing in deep house and techno.",
    soundcloud_url: "https://soundcloud.com/djphoenix",
    spotify_url: "",
    instagram_url: "https://instagram.com/djphoenix",
    zip_file_url: "https://example.com/samples.zip",
    status: "pending",
  },
];

export default function ModApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>(MOCK_APPLICATIONS);

  const handleApplicationReviewed = () => {
    // TODO: Replace with Supabase/Prisma call - refresh pending applications
    setApplications([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] via-[#141414] to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Creator Applications
          </h1>
          <p className="text-[#a1a1a1]">
            Review and approve creator applications
          </p>
        </div>

        {applications.length > 0 ? (
          <div className="space-y-6">
            {applications.map((app) => (
              <CreatorReviewPanel
                key={app.id}
                application={app}
                onReview={handleApplicationReviewed}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <CheckCircle2 className="w-16 h-16 text-[#2a2a2a] mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">
              All caught up!
            </h3>
            <p className="text-[#a1a1a1]">
              No pending creator applications to review.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
