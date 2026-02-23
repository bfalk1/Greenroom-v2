"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import {
  Instagram,
  Youtube,
} from "lucide-react";

// Custom icons for platforms that don't have lucide icons
const TikTokIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const XIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const SpotifyIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const SoundCloudIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
    <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.084-.1zm-.899.828c-.051 0-.091.04-.099.098l-.179 1.326.179 1.291c.008.054.048.098.099.098.05 0 .09-.044.098-.098l.205-1.291-.205-1.326c-.008-.054-.048-.098-.098-.098zm1.83-.747c-.058 0-.102.046-.109.104l-.209 2.073.209 2.026c.007.058.051.098.109.098.056 0 .1-.04.107-.098l.235-2.026-.235-2.073c-.007-.058-.051-.104-.107-.104zm.898-.191c-.065 0-.111.046-.119.104l-.195 2.264.195 2.204c.008.058.054.104.119.104.064 0 .11-.046.119-.104l.22-2.204-.22-2.264c-.009-.058-.055-.104-.119-.104zm.931-.39c-.072 0-.118.054-.127.11l-.181 2.654.181 2.577c.009.064.055.11.127.11.071 0 .117-.046.127-.11l.204-2.577-.204-2.654c-.01-.056-.056-.11-.127-.11zm.913-.285c-.078 0-.125.054-.134.116l-.167 2.939.167 2.862c.009.064.056.116.134.116.077 0 .124-.052.133-.116l.188-2.862-.188-2.939c-.009-.062-.056-.116-.133-.116zm.914-.161c-.086 0-.131.054-.14.122l-.153 3.1.153 3.004c.009.068.054.122.14.122.085 0 .13-.054.14-.122l.172-3.004-.172-3.1c-.01-.068-.055-.122-.14-.122zm.912-.143c-.093 0-.139.062-.148.128l-.139 3.243.139 3.143c.009.074.055.128.148.128.092 0 .138-.054.148-.128l.156-3.143-.156-3.243c-.01-.066-.056-.128-.148-.128zm.928-.08c-.1 0-.148.062-.156.134l-.125 3.323.125 3.215c.008.074.056.134.156.134.1 0 .147-.06.156-.134l.14-3.215-.14-3.323c-.009-.072-.056-.134-.156-.134zm.911-.061c-.107 0-.155.062-.164.14l-.111 3.384.111 3.277c.009.08.057.14.164.14.106 0 .154-.06.164-.14l.124-3.277-.124-3.384c-.01-.078-.058-.14-.164-.14zm.944-.001c-.115 0-.163.068-.171.146l-.098 3.386.098 3.277c.008.086.056.146.171.146.114 0 .162-.06.171-.146l.11-3.277-.11-3.386c-.009-.078-.057-.146-.171-.146zm.912.034c-.122 0-.169.068-.179.152l-.084 3.352.084 3.244c.01.084.057.152.179.152.121 0 .168-.068.178-.152l.094-3.244-.094-3.352c-.01-.084-.057-.152-.178-.152zm.938.09c-.13 0-.177.076-.187.158l-.07 3.262.07 3.153c.01.09.057.158.187.158.129 0 .176-.068.186-.158l.078-3.153-.078-3.262c-.01-.082-.057-.158-.186-.158zm7.921 1.077c-.383 0-.749.074-1.084.206-.226-2.525-2.341-4.504-4.927-4.504-.616 0-1.21.124-1.751.345-.208.086-.263.172-.27.342v8.884c.006.176.098.327.266.349l7.766.002c1.353 0 2.451-1.098 2.451-2.451 0-1.354-1.098-2.449-2.451-2.449v-.724z"/>
  </svg>
);

const AppleMusicIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.99c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.364-1.29.443-2.25 1.25-2.864 2.503a6.238 6.238 0 00-.477 2.06 9.37 9.37 0 00-.006.9v10.16c.01.15.017.3.026.45a10.092 10.092 0 00.346 2.12c.44 1.327 1.265 2.313 2.54 2.932a5.574 5.574 0 001.97.58c.375.047.752.072 1.13.08.21.005.42.01.63.01h10.45c.15-.008.3-.015.45-.026a10.36 10.36 0 002.12-.36c1.3-.424 2.273-1.22 2.895-2.47.38-.76.58-1.573.64-2.42.01-.15.02-.3.02-.45V6.42c-.005-.1-.008-.2-.016-.296zM11.97 14.89c0 1.166-.002 2.333.002 3.5 0 .13-.014.26-.032.39-.057.41-.267.68-.628.85-.28.13-.587.18-.893.1-.326-.09-.565-.305-.687-.62-.063-.16-.1-.337-.1-.51-.005-.792-.002-1.584-.002-2.376v-.31h-.005c0-.46-.005-.92.002-1.38.01-.63.49-1.14 1.14-1.22.54-.066 1.037.21 1.256.7.084.19.12.385.12.585-.005.49-.002.98-.002 1.47l-.002-.003zm0-5.27c.002.86-.675 1.58-1.55 1.59-.855.01-1.563-.71-1.573-1.55-.01-.87.68-1.59 1.55-1.6.86-.01 1.57.68 1.58 1.56h-.007z"/>
  </svg>
);

interface SocialLinks {
  instagram?: string;
  tiktok?: string;
  twitter?: string;
  x?: string;
  spotify?: string;
  soundcloud?: string;
  apple_music?: string;
  youtube?: string;
}

interface SocialLinksEditorProps {
  socialLinks: SocialLinks;
  onChange: (links: SocialLinks) => void;
}

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "https://instagram.com/username" },
  { key: "tiktok", label: "TikTok", icon: TikTokIcon, placeholder: "https://tiktok.com/@username" },
  { key: "x", label: "X (Twitter)", icon: XIcon, placeholder: "https://x.com/username" },
  { key: "spotify", label: "Spotify", icon: SpotifyIcon, placeholder: "https://open.spotify.com/artist/..." },
  { key: "soundcloud", label: "SoundCloud", icon: SoundCloudIcon, placeholder: "https://soundcloud.com/username" },
  { key: "apple_music", label: "Apple Music", icon: AppleMusicIcon, placeholder: "https://music.apple.com/artist/..." },
  { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "https://youtube.com/@channel" },
] as const;

export function SocialLinksEditor({ socialLinks, onChange }: SocialLinksEditorProps) {
  const handleChange = (key: string, value: string) => {
    onChange({
      ...socialLinks,
      [key]: value || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-white mb-4">Social Links</h3>
      {SOCIAL_PLATFORMS.map(({ key, label, icon: Icon, placeholder }) => (
        <div key={key} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#2a2a2a] flex items-center justify-center text-[#a1a1a1]">
            <Icon />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-[#a1a1a1] mb-1">{label}</label>
            <Input
              type="url"
              placeholder={placeholder}
              value={(socialLinks as Record<string, string | undefined>)[key] || ""}
              onChange={(e) => handleChange(key, e.target.value)}
              className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-[#666] text-sm"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
