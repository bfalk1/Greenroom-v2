"use client";

import { useState } from "react";
import Link from "next/link";
import { useUser } from "@/lib/hooks/useUser";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TERMS_EFFECTIVE_DATE, TERMS_EFFECTIVE_DATE_LABEL } from "@/lib/legal";

const POLICIES = [
  { href: "/creator-terms", label: "Creator Terms of Use" },
  { href: "/license", label: "Sample License Agreement" },
  { href: "/terms", label: "User Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
];

export function TermsReacceptanceGate() {
  const { user, loading, refreshUser, logout } = useUser();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptedAt = user?.terms_accepted_at
    ? new Date(user.terms_accepted_at)
    : null;
  const needsReaccept =
    !loading &&
    user?.role === "CREATOR" &&
    (!acceptedAt || acceptedAt < new Date(TERMS_EFFECTIVE_DATE));

  if (!needsReaccept) return null;

  const handleAccept = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/user/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms_accepted_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("Failed to record your acceptance.");
      await refreshUser();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Please try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="bg-[#1a1a1a] border-[#2a2a2a] text-white"
      >
        <DialogHeader>
          <DialogTitle className="text-white">We&apos;ve updated our terms</DialogTitle>
          <DialogDescription className="text-[#a1a1a1]">
            Our creator policies changed, effective {TERMS_EFFECTIVE_DATE_LABEL}.
            Please review and accept to keep using Greenroom.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1 text-sm">
          {POLICIES.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#39b54a] hover:underline"
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => logout()}
            disabled={submitting}
            className="border-[#2a2a2a] text-white"
          >
            Log Out
          </Button>
          <Button
            onClick={handleAccept}
            disabled={submitting}
            className="bg-[#39b54a] text-black hover:bg-[#2e9140]"
          >
            {submitting ? "Saving..." : "Accept & Continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
