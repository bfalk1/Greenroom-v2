"use client";

import React, { useEffect, useRef, useState } from "react";

interface WaveformProps {
  audioUrl?: string;
  data?: number[]; // Pre-computed waveform data (0-1 normalized values)
  isPlaying?: boolean;
  progress?: number; // 0-100
  height?: number;
  barWidth?: number;
  barGap?: number;
  barColor?: string;
  progressColor?: string;
  backgroundColor?: string;
}

export function Waveform({
  audioUrl,
  data,
  isPlaying = false,
  progress = 0,
  height = 40,
  barWidth = 2,
  barGap = 1,
  barColor = "#3a3a3a",
  progressColor = "#39b54a",
  backgroundColor = "transparent",
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  // Use pre-computed data if available
  useEffect(() => {
    if (data && data.length > 0) {
      setWaveformData(data);
      setIsLoading(false);
      return;
    }
  }, [data]);

  // Fetch and analyze audio to generate waveform data (fallback if no pre-computed data)
  useEffect(() => {
    if (data && data.length > 0) return; // Skip if we have pre-computed data
    if (!audioUrl) return;

    const generateWaveform = async () => {
      setIsLoading(true);
      setError(false);

      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Get the audio data from the first channel
        const rawData = audioBuffer.getChannelData(0);
        
        // Calculate how many bars we want
        const samples = 80;
        const blockSize = Math.floor(rawData.length / samples);
        const filteredData: number[] = [];

        // Use peak detection instead of average for better visual representation
        for (let i = 0; i < samples; i++) {
          const blockStart = blockSize * i;
          let peak = 0;
          for (let j = 0; j < blockSize; j++) {
            const abs = Math.abs(rawData[blockStart + j] || 0);
            if (abs > peak) peak = abs;
          }
          filteredData.push(peak);
        }

        // Normalize the data
        const maxValue = Math.max(...filteredData);
        const normalizedData = maxValue > 0 
          ? filteredData.map((n) => n / maxValue)
          : filteredData.map(() => 0.3);

        setWaveformData(normalizedData);
        audioContext.close();
      } catch (err) {
        console.error("Failed to generate waveform:", err);
        setError(true);
        // Generate placeholder waveform as fallback
        const fakeData = Array(80)
          .fill(0)
          .map((_, i) => 0.3 + 0.4 * Math.sin(i * 0.2) * Math.random());
        setWaveformData(fakeData);
      } finally {
        setIsLoading(false);
      }
    };

    generateWaveform();
  }, [audioUrl, data]);

  // Draw the waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const canvasHeight = rect.height;

    // Clear canvas
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, canvasHeight);

    const barCount = waveformData.length;
    const totalBarWidth = barWidth + barGap;
    const startX = (width - barCount * totalBarWidth) / 2;

    // Calculate which bar the progress is at
    const progressBar = Math.floor((progress / 100) * barCount);

    waveformData.forEach((value, index) => {
      const x = startX + index * totalBarWidth;
      const barHeight = Math.max(2, value * (canvasHeight - 4));
      const y = (canvasHeight - barHeight) / 2;

      // Color based on progress
      ctx.fillStyle = index < progressBar ? progressColor : barColor;
      
      // Draw rounded bar
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1);
      ctx.fill();
    });
  }, [waveformData, progress, height, barWidth, barGap, barColor, progressColor, backgroundColor]);

  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center bg-[#1a1a1a] rounded"
        style={{ height }}
      >
        <div className="flex gap-1">
          {Array(20).fill(0).map((_, i) => (
            <div
              key={i}
              className="w-0.5 bg-[#2a2a2a] rounded animate-pulse"
              style={{ 
                height: `${10 + Math.random() * 20}px`,
                animationDelay: `${i * 50}ms`
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded"
      style={{ height }}
    />
  );
}
