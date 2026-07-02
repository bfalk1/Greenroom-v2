"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Loader2,
  User,
  Music,
  Download,
  ArrowLeft,
  Upload,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface CreatorRow {
  id: string;
  email: string;
  username: string | null;
  artistName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  totalUploads: number;
  totalDownloads: number;
  lastUploadAt: string | null;
  publishedCount: number;
  reviewCount: number;
  draftCount: number;
}

interface UploadSample {
  id: string;
  name: string;
  slug: string;
  genre: string;
  instrumentType: string;
  sampleType: "LOOP" | "ONE_SHOT";
  key: string | null;
  bpm: number | null;
  creditPrice: number;
  durationMs: number | null;
  fileSizeBytes: number | null;
  downloadCount: number;
  ratingAvg: number;
  ratingCount: number;
  status: "DRAFT" | "PUBLISHED" | "REVIEW" | "REMOVED";
  isActive: boolean;
  createdAt: string;
}

interface CreatorDetail {
  creator: {
    id: string;
    email: string;
    username: string | null;
    artistName: string | null;
    fullName: string | null;
    avatarUrl: string | null;
    role: string;
    createdAt: string;
  };
  samples: UploadSample[];
  summary: {
    total: number;
    published: number;
    review: number;
    draft: number;
    totalDownloads: number;
  };
}

const displayName = (c: {
  artistName: string | null;
  fullName: string | null;
  username: string | null;
}) => c.artistName || c.fullName || c.username || "Unknown";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

function StatusBadge({ status }: { status: UploadSample["status"] }) {
  const styles: Record<UploadSample["status"], string> = {
    PUBLISHED: "bg-[#39b54a]/15 text-[#39b54a]",
    REVIEW: "bg-yellow-500/15 text-yellow-400",
    DRAFT: "bg-[#2a2a2a] text-[#a1a1a1]",
    REMOVED: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

export function CreatorUploadsPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [detail, setDetail] = useState<CreatorDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchCreators = useCallback(async (search: string) => {
    try {
      setLoadingList(true);
      const res = await fetch(
        `/api/admin/creator-uploads?search=${encodeURIComponent(search)}`
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load creators");
      }
      const data = await res.json();
      setCreators(data.creators);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load creators");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchCreators("");
  }, [fetchCreators]);

  const handleSelectCreator = async (id: string) => {
    try {
      setLoadingDetail(true);
      const res = await fetch(`/api/admin/creator-uploads?creatorId=${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load upload history");
      }
      const data = await res.json();
      setDetail(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load upload history");
    } finally {
      setLoadingDetail(false);
    }
  };

  // ── Detail view ──────────────────────────────────────────────────
  if (detail) {
    const { creator, samples, summary } = detail;
    return (
      <div className="space-y-6">
        <button
          onClick={() => setDetail(null)}
          className="flex items-center gap-2 text-sm text-[#a1a1a1] hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to all creators
        </button>

        {/* Creator header */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
          <div className="flex items-center gap-4">
            {creator.avatarUrl ? (
              <img
                src={creator.avatarUrl}
                alt=""
                className="w-14 h-14 rounded-full object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                <User className="w-7 h-7 text-[#a1a1a1]" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-xl font-semibold text-white truncate">
                {displayName(creator)}
              </h3>
              <p className="text-sm text-[#a1a1a1] truncate">{creator.email}</p>
              {creator.username && (
                <p className="text-xs text-[#666]">@{creator.username}</p>
              )}
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
            <SummaryStat label="Total uploads" value={summary.total} accent />
            <SummaryStat label="Published" value={summary.published} />
            <SummaryStat label="In review" value={summary.review} />
            <SummaryStat label="Draft" value={summary.draft} />
            <SummaryStat label="Downloads" value={summary.totalDownloads} />
          </div>
        </div>

        {/* Upload history */}
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="w-5 h-5 text-[#39b54a]" />
            <h4 className="text-lg font-semibold text-white">Upload History</h4>
            <span className="text-sm text-[#666]">({samples.length})</span>
          </div>

          {samples.length === 0 ? (
            <p className="text-sm text-[#a1a1a1] py-8 text-center">
              This creator hasn&apos;t uploaded any samples yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#666] border-b border-[#2a2a2a]">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Genre</th>
                    <th className="py-2 pr-4 font-medium">Key / BPM</th>
                    <th className="py-2 pr-4 font-medium">Price</th>
                    <th className="py-2 pr-4 font-medium">Downloads</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-[#2a2a2a]/60 hover:bg-[#0a0a0a] transition"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2 text-white font-medium">
                          <Music className="w-3.5 h-3.5 text-[#39b54a] shrink-0" />
                          <span className="truncate max-w-[200px]">{s.name}</span>
                          {!s.isActive && (
                            <span className="text-xs text-red-400">(inactive)</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-[#a1a1a1]">
                        {s.sampleType === "ONE_SHOT" ? "One-shot" : "Loop"}
                        <span className="text-[#666]"> · {s.instrumentType}</span>
                      </td>
                      <td className="py-3 pr-4 text-[#a1a1a1]">{s.genre}</td>
                      <td className="py-3 pr-4 text-[#a1a1a1]">
                        {s.key || "—"}
                        {s.bpm ? ` · ${s.bpm} BPM` : ""}
                      </td>
                      <td className="py-3 pr-4 text-[#a1a1a1]">
                        {s.creditPrice} cr
                      </td>
                      <td className="py-3 pr-4 text-[#a1a1a1]">
                        <span className="inline-flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          {s.downloadCount}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="py-3 pr-4 text-[#a1a1a1] whitespace-nowrap">
                        {formatDate(s.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List view ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-5 h-5 text-[#39b54a]" />
          <h3 className="text-lg font-semibold text-white">Creator Uploads</h3>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search creators by name, email, or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchCreators(searchQuery)}
            className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666]"
          />
          <Button
            onClick={() => fetchCreators(searchQuery)}
            disabled={loadingList}
            className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
          >
            {loadingList ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6">
        {loadingList ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#39b54a] animate-spin" />
          </div>
        ) : creators.length === 0 ? (
          <p className="text-sm text-[#a1a1a1] py-8 text-center">
            No creators found.
          </p>
        ) : (
          <>
            <p className="text-sm text-[#666] mb-3">
              {creators.length} creator{creators.length === 1 ? "" : "s"} · sorted by upload count
            </p>
            <div className="space-y-2">
              {creators.map((c) => (
                <div
                  key={c.id}
                  onClick={() => handleSelectCreator(c.id)}
                  className="p-4 rounded-lg cursor-pointer transition bg-[#0a0a0a] border border-[#2a2a2a] hover:bg-[#141414] hover:border-[#39b54a]/40"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {c.avatarUrl ? (
                        <img
                          src={c.avatarUrl}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-[#a1a1a1]" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">
                          {displayName(c)}
                        </p>
                        <p className="text-sm text-[#a1a1a1] truncate">{c.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                      {/* Status breakdown — hidden on small screens */}
                      <div className="hidden sm:flex items-center gap-3 text-xs">
                        <span className="text-[#39b54a]">{c.publishedCount} pub</span>
                        <span className="text-yellow-400">{c.reviewCount} rev</span>
                        <span className="text-[#a1a1a1]">{c.draftCount} draft</span>
                      </div>
                      <div className="hidden md:block text-right">
                        <p className="text-xs text-[#666]">Downloads</p>
                        <p className="text-sm text-white font-medium">
                          {c.totalDownloads}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[#666]">Uploads</p>
                        <p className="text-xl text-[#39b54a] font-bold leading-none">
                          {c.totalUploads}
                        </p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-[#666] shrink-0" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {loadingDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <Loader2 className="w-10 h-10 text-[#39b54a] animate-spin" />
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg p-4 text-center">
      <p
        className={`text-2xl font-bold leading-none ${
          accent ? "text-[#39b54a]" : "text-white"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-[#a1a1a1] mt-1.5">{label}</p>
    </div>
  );
}
