"use client";

import { Play, Heart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SampleCardProps {
  id: string;
  name: string;
  creatorName: string;
  genre: string;
  bpm?: number | null;
  musicalKey?: string | null;
  creditPrice: number;
  coverImageUrl?: string | null;
}

export function SampleCard({
  name,
  creatorName,
  genre,
  bpm,
  musicalKey,
  creditPrice,
}: SampleCardProps) {
  return (
    <Card className="group overflow-hidden transition-colors hover:border-emerald-500/50">
      <CardContent className="p-4">
        <div className="mb-3 flex aspect-square items-center justify-center rounded-md bg-muted">
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Play className="h-6 w-6" />
          </Button>
        </div>
        <h3 className="truncate font-semibold text-foreground">{name}</h3>
        <p className="truncate text-sm text-muted-foreground">{creatorName}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Badge variant="secondary" className="text-xs">
            {genre}
          </Badge>
          {bpm && (
            <Badge variant="secondary" className="text-xs">
              {bpm} BPM
            </Badge>
          )}
          {musicalKey && (
            <Badge variant="secondary" className="text-xs">
              {musicalKey}
            </Badge>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-medium text-emerald-500">
            {creditPrice} {creditPrice === 1 ? "credit" : "credits"}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Heart className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
