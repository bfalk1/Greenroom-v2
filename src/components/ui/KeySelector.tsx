"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface KeySelectorProps {
  value: string; // e.g., "C", "C# Minor", "D Major", ""
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const NATURAL_NOTES = ["C", "D", "E", "F", "G", "A", "B"];
const SHARP_NOTES = ["C#", "D#", null, "F#", "G#", "A#", null]; // null = no sharp for E and B
const FLAT_NOTES = ["Db", "Eb", null, "Gb", "Ab", "Bb", null];

export function KeySelector({ value, onChange, placeholder = "Key", className }: KeySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [useFlats, setUseFlats] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string>("");
  const [selectedScale, setSelectedScale] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial value
  useEffect(() => {
    if (value) {
      const parts = value.split(" ");
      if (parts.length >= 1) {
        setSelectedNote(parts[0]);
        setSelectedScale(parts[1] || "");
      }
    } else {
      setSelectedNote("");
      setSelectedScale("");
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNoteClick = (note: string) => {
    setSelectedNote(note);
    // Build the full key value
    const newValue = selectedScale ? `${note} ${selectedScale}` : note;
    onChange(newValue);
  };

  const handleScaleClick = (scale: string) => {
    if (selectedScale === scale) {
      // Toggle off
      setSelectedScale("");
      onChange(selectedNote);
    } else {
      setSelectedScale(scale);
      if (selectedNote) {
        onChange(`${selectedNote} ${scale}`);
      }
    }
  };

  const handleClear = () => {
    setSelectedNote("");
    setSelectedScale("");
    onChange("");
  };

  const accidentalNotes = useFlats ? FLAT_NOTES : SHARP_NOTES;
  const displayValue = value || placeholder;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full h-10 px-3 bg-[#0a0a0a] border border-[#2a2a2a] rounded-md text-sm hover:border-[#3a3a3a] transition"
      >
        <span className={value ? "text-white" : "text-[#666]"}>
          {displayValue}
        </span>
        <ChevronDown className="w-4 h-4 text-[#a1a1a1]" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl p-4">
          {/* Flat/Sharp Toggle */}
          <div className="flex border-b border-[#2a2a2a] mb-4">
            <button
              type="button"
              onClick={() => setUseFlats(true)}
              className={`flex-1 pb-2 text-sm font-medium transition ${
                useFlats
                  ? "text-white border-b-2 border-[#00FF88]"
                  : "text-[#666] hover:text-white"
              }`}
            >
              Flat keys
            </button>
            <button
              type="button"
              onClick={() => setUseFlats(false)}
              className={`flex-1 pb-2 text-sm font-medium transition ${
                !useFlats
                  ? "text-white border-b-2 border-[#00FF88]"
                  : "text-[#666] hover:text-white"
              }`}
            >
              Sharp keys
            </button>
          </div>

          {/* Accidental Notes Row (sharps/flats) */}
          <div className="flex justify-center gap-1 mb-1">
            {accidentalNotes.map((note, i) => (
              note ? (
                <button
                  key={note}
                  type="button"
                  onClick={() => handleNoteClick(note)}
                  className={`w-8 h-8 rounded text-xs font-medium transition ${
                    selectedNote === note || selectedNote === SHARP_NOTES[i] || selectedNote === FLAT_NOTES[i]
                      ? "bg-[#00FF88] text-black"
                      : "bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"
                  }`}
                >
                  {note}
                </button>
              ) : (
                <div key={`empty-${i}`} className="w-8 h-8" />
              )
            ))}
          </div>

          {/* Natural Notes Row */}
          <div className="flex justify-center gap-1 mb-4">
            {NATURAL_NOTES.map((note) => (
              <button
                key={note}
                type="button"
                onClick={() => handleNoteClick(note)}
                className={`w-8 h-8 rounded text-xs font-medium transition ${
                  selectedNote === note
                    ? "bg-[#00FF88] text-black"
                    : "bg-[#3a3a3a] text-white hover:bg-[#4a4a4a]"
                }`}
              >
                {note}
              </button>
            ))}
          </div>

          {/* Major/Minor Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => handleScaleClick("Major")}
              className={`flex-1 py-2 rounded text-sm font-medium transition ${
                selectedScale === "Major"
                  ? "bg-[#00FF88] text-black"
                  : "bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"
              }`}
            >
              Major
            </button>
            <button
              type="button"
              onClick={() => handleScaleClick("Minor")}
              className={`flex-1 py-2 rounded text-sm font-medium transition ${
                selectedScale === "Minor"
                  ? "bg-[#00FF88] text-black"
                  : "bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"
              }`}
            >
              Minor
            </button>
          </div>

          {/* Clear & Close */}
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={handleClear}
              className="text-sm text-[#666] hover:text-white transition"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-1.5 bg-[#00FF88] text-black rounded text-sm font-medium hover:bg-[#00cc6a] transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
