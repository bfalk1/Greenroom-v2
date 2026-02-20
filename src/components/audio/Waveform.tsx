"use client";

import React, { useEffect, useRef, useMemo } from "react";

interface WaveformProps {
  /** Array of amplitude values (0-1) */
  data?: number[];
  /** Current playback progress (0-1) */
  progress?: number;
  /** Height of the waveform in pixels */
  height?: number;
  /** Color of the played portion */
  playedColor?: string;
  /** Color of the unplayed portion */
  unplayedColor?: string;
  /** Whether the waveform is currently playing */
  isPlaying?: boolean;
  /** Click handler for seeking */
  onSeek?: (progress: number) => void;
  /** Number of bars to display */
  barCount?: number;
  /** Gap between bars */
  barGap?: number;
  /** Border radius of bars */
  barRadius?: number;
}

// Generate fake waveform data for samples without stored waveform
function generateFakeWaveform(barCount: number, seed: number = 0): number[] {
  const result: number[] = [];
  let value = 0.5;
  
  for (let i = 0; i < barCount; i++) {
    // Use a simple pseudo-random algorithm seeded by position and seed
    const noise = Math.sin(i * 0.3 + seed) * 0.3 + 
                  Math.sin(i * 0.7 + seed * 2) * 0.2 +
                  Math.sin(i * 1.1 + seed * 3) * 0.1;
    
    // Smoothly vary the amplitude
    value = Math.max(0.15, Math.min(1, value + noise * 0.3));
    
    // Add some structure - slightly lower at edges
    const edgeFactor = 1 - Math.pow((i - barCount / 2) / (barCount / 2), 4) * 0.3;
    
    result.push(value * edgeFactor);
  }
  
  return result;
}

// Downsample waveform data to target number of bars
function downsample(data: number[], targetCount: number): number[] {
  if (data.length <= targetCount) {
    // Upsample if needed
    const result: number[] = [];
    const ratio = data.length / targetCount;
    for (let i = 0; i < targetCount; i++) {
      const index = Math.floor(i * ratio);
      result.push(data[Math.min(index, data.length - 1)]);
    }
    return result;
  }
  
  // Downsample by taking max in each bucket
  const result: number[] = [];
  const bucketSize = data.length / targetCount;
  
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    let max = 0;
    for (let j = start; j < end && j < data.length; j++) {
      max = Math.max(max, data[j]);
    }
    result.push(max);
  }
  
  return result;
}

export function Waveform({
  data,
  progress = 0,
  height = 40,
  playedColor = "#00FF88",
  unplayedColor = "#2a2a2a",
  isPlaying = false,
  onSeek,
  barCount = 50,
  barGap = 2,
  barRadius = 1,
}: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate or process waveform data
  const bars = useMemo(() => {
    if (data && data.length > 0) {
      return downsample(data, barCount);
    }
    // Generate fake waveform based on current timestamp for variety
    return generateFakeWaveform(barCount, Date.now() % 1000);
  }, [data, barCount]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newProgress = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(newProgress);
  };

  const playedIndex = Math.floor(progress * barCount);

  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-[${barGap}px] ${onSeek ? "cursor-pointer" : ""}`}
      style={{ height, gap: `${barGap}px` }}
      onClick={handleClick}
    >
      {bars.map((amplitude, index) => {
        const isPlayed = index <= playedIndex;
        const barHeight = Math.max(4, amplitude * height);
        
        return (
          <div
            key={index}
            className="flex-1 transition-colors duration-75"
            style={{
              height: barHeight,
              backgroundColor: isPlayed ? playedColor : unplayedColor,
              borderRadius: barRadius,
              minWidth: 2,
              opacity: isPlaying && isPlayed ? 1 : (isPlayed ? 0.9 : 0.6),
            }}
          />
        );
      })}
    </div>
  );
}

// Compact version for sample cards
export function WaveformMini({
  data,
  progress = 0,
  isPlaying = false,
}: {
  data?: number[];
  progress?: number;
  isPlaying?: boolean;
}) {
  return (
    <Waveform
      data={data}
      progress={progress}
      height={24}
      barCount={30}
      barGap={1}
      barRadius={1}
      isPlaying={isPlaying}
      playedColor="#00FF88"
      unplayedColor="#3a3a3a"
    />
  );
}
