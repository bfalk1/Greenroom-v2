"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleUnsubscribe = async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-zinc-900 rounded-xl p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">GREENROOM</h1>
        
        {status === "success" ? (
          <>
            <div className="text-green-500 text-5xl mb-4">✓</div>
            <p className="text-white mb-2">You've been unsubscribed</p>
            <p className="text-zinc-400 text-sm">
              {email} will no longer receive promotional emails from GREENROOM.
            </p>
          </>
        ) : (
          <>
            <p className="text-zinc-400 mb-6">
              Unsubscribe <span className="text-white">{email}</span> from GREENROOM emails?
            </p>
            
            <button
              onClick={handleUnsubscribe}
              disabled={status === "loading" || !email}
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
              You'll still receive important account-related emails.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}
