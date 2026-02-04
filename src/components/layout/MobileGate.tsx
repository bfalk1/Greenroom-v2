"use client";

import { Music } from "lucide-react";

export function MobileGate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <Music className="mb-6 h-16 w-16 text-emerald-500" />
      <h1 className="text-3xl font-bold text-white">
        GREEN<span className="text-emerald-500">ROOM</span>
      </h1>
      <p className="mt-4 max-w-sm text-muted-foreground">
        GREENROOM is designed for desktop. We&apos;re working on a mobile
        experience — check back soon.
      </p>
    </div>
  );
}
