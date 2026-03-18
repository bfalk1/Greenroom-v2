"use client";

import React from "react";
import { 
  Music, 
  Radio, 
  Mic2, 
  Piano, 
  Guitar, 
  Drum,
  Waves,
  Sparkles,
  Globe,
  Headphones,
  Volume2,
  Zap,
} from "lucide-react";

interface Category {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  gradient: string;
}

const GENRE_CATEGORIES: Category[] = [
  { id: "Electronic", name: "Electronic", icon: Zap, color: "#39b54a", gradient: "from-[#39b54a]/20 to-[#39b54a]/5" },
  { id: "Hip-Hop", name: "Hip-Hop", icon: Mic2, color: "#FF6B6B", gradient: "from-[#FF6B6B]/20 to-[#FF6B6B]/5" },
  { id: "Pop", name: "Pop", icon: Sparkles, color: "#FFD93D", gradient: "from-[#FFD93D]/20 to-[#FFD93D]/5" },
  { id: "House", name: "House", icon: Headphones, color: "#6BCB77", gradient: "from-[#6BCB77]/20 to-[#6BCB77]/5" },
  { id: "Techno", name: "Techno", icon: Radio, color: "#9B59B6", gradient: "from-[#9B59B6]/20 to-[#9B59B6]/5" },
  { id: "Trap", name: "Trap", icon: Volume2, color: "#E74C3C", gradient: "from-[#E74C3C]/20 to-[#E74C3C]/5" },
  { id: "R&B", name: "R&B", icon: Music, color: "#3498DB", gradient: "from-[#3498DB]/20 to-[#3498DB]/5" },
  { id: "Lo-Fi", name: "Lo-Fi", icon: Waves, color: "#95A5A6", gradient: "from-[#95A5A6]/20 to-[#95A5A6]/5" },
  { id: "Jazz", name: "Jazz", icon: Piano, color: "#F39C12", gradient: "from-[#F39C12]/20 to-[#F39C12]/5" },
  { id: "Rock", name: "Rock", icon: Guitar, color: "#E67E22", gradient: "from-[#E67E22]/20 to-[#E67E22]/5" },
  { id: "Drum & Bass", name: "Drum & Bass", icon: Drum, color: "#1ABC9C", gradient: "from-[#1ABC9C]/20 to-[#1ABC9C]/5" },
  { id: "World", name: "World", icon: Globe, color: "#9B59B6", gradient: "from-[#9B59B6]/20 to-[#9B59B6]/5" },
];

const INSTRUMENT_CATEGORIES: Category[] = [
  { id: "Drums", name: "Drums", icon: Drum, color: "#FF6B6B", gradient: "from-[#FF6B6B]/20 to-[#FF6B6B]/5" },
  { id: "Bass", name: "Bass", icon: Volume2, color: "#6BCB77", gradient: "from-[#6BCB77]/20 to-[#6BCB77]/5" },
  { id: "Synths", name: "Synths", icon: Zap, color: "#39b54a", gradient: "from-[#39b54a]/20 to-[#39b54a]/5" },
  { id: "Vocals", name: "Vocals", icon: Mic2, color: "#FFD93D", gradient: "from-[#FFD93D]/20 to-[#FFD93D]/5" },
  { id: "Guitars", name: "Guitars", icon: Guitar, color: "#E67E22", gradient: "from-[#E67E22]/20 to-[#E67E22]/5" },
  { id: "Keys", name: "Keys", icon: Piano, color: "#3498DB", gradient: "from-[#3498DB]/20 to-[#3498DB]/5" },
  { id: "FX", name: "FX", icon: Sparkles, color: "#9B59B6", gradient: "from-[#9B59B6]/20 to-[#9B59B6]/5" },
  { id: "Full Loops", name: "Full Loops", icon: Music, color: "#1ABC9C", gradient: "from-[#1ABC9C]/20 to-[#1ABC9C]/5" },
];

interface CategoryGridProps {
  type: "genre" | "instrument";
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
}

export function CategoryGrid({ 
  type, 
  selectedCategory, 
  onSelectCategory 
}: CategoryGridProps) {
  const categories = type === "genre" ? GENRE_CATEGORIES : INSTRUMENT_CATEGORIES;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">
          Browse by {type === "genre" ? "Genre" : "Instrument"}
        </h2>
        {selectedCategory && (
          <button
            onClick={() => onSelectCategory(null)}
            className="text-sm text-[#39b54a] hover:text-[#2e9140] transition"
          >
            Clear filter
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {categories.map((category) => {
          const Icon = category.icon;
          const isSelected = selectedCategory === category.id;
          
          return (
            <button
              key={category.id}
              onClick={() => onSelectCategory(isSelected ? null : category.id)}
              className={`
                flex flex-col items-center justify-center p-4 rounded-xl
                border transition-all duration-200
                ${isSelected 
                  ? `bg-gradient-to-b ${category.gradient} border-[${category.color}]/50` 
                  : "bg-[#1a1a1a] border-[#2a2a2a] hover:border-[#3a3a3a]"
                }
              `}
              style={{
                borderColor: isSelected ? category.color + "50" : undefined,
              }}
            >
              <div
                className={`
                  w-10 h-10 rounded-lg flex items-center justify-center mb-2
                  transition-colors duration-200
                `}
                style={{
                  backgroundColor: isSelected ? category.color + "30" : "#2a2a2a",
                }}
              >
                <Icon 
                  className="w-5 h-5" 
                  style={{ color: isSelected ? category.color : "#a1a1a1" }}
                />
              </div>
              <span 
                className={`text-xs font-medium text-center ${
                  isSelected ? "text-white" : "text-[#a1a1a1]"
                }`}
              >
                {category.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Compact horizontal version for mobile or sidebar
export function CategoryChips({
  type,
  selectedCategory,
  onSelectCategory,
}: CategoryGridProps) {
  const categories = type === "genre" ? GENRE_CATEGORIES : INSTRUMENT_CATEGORIES;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <button
        onClick={() => onSelectCategory(null)}
        className={`
          px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap
          transition-colors duration-200
          ${!selectedCategory 
            ? "bg-[#39b54a] text-black" 
            : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white border border-[#2a2a2a]"
          }
        `}
      >
        All
      </button>
      {categories.map((category) => {
        const isSelected = selectedCategory === category.id;
        
        return (
          <button
            key={category.id}
            onClick={() => onSelectCategory(isSelected ? null : category.id)}
            className={`
              px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap
              transition-colors duration-200
              ${isSelected 
                ? "bg-[#39b54a] text-black" 
                : "bg-[#1a1a1a] text-[#a1a1a1] hover:text-white border border-[#2a2a2a]"
              }
            `}
          >
            {category.name}
          </button>
        );
      })}
    </div>
  );
}
