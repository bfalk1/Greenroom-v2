"use client";

import { useState } from "react";

// The confirm button on /unsubscribe. The page resolves the link server-side
// and hands over only the token (POSTed back to confirm) and a masked address;
// the full address never reaches the browser.
export function UnsubscribeForm({
  token,
  maskedEmail,
}: {
  token: string;
  maskedEmail: string;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleUnsubscribe = async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <>
        <div className="text-green-500 text-5xl mb-4">✓</div>
        <p className="text-white mb-2">You&apos;ve been unsubscribed</p>
        <p className="text-zinc-400 text-sm">
          {maskedEmail} will no longer receive promotional emails from GREENROOM.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-zinc-400 mb-6">
        Unsubscribe <span className="text-white">{maskedEmail}</span> from GREENROOM emails?
      </p>

      <button
        onClick={handleUnsubscribe}
        disabled={status === "loading"}
        className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white py-3 px-6 rounded-lg font-medium transition-colors"
      >
        {status === "loading" ? "Processing..." : "Unsubscribe"}
      </button>

      {status === "error" && (
        <p className="text-red-400 mt-4 text-sm">
          Something went wrong. Please try again or contact support.
        </p>
      )}

      <p className="text-zinc-500 text-xs mt-6">
        You&apos;ll still receive important account-related emails.
      </p>
    </>
  );
}
