"use client";

import { useState } from "react";
import Image from "next/image";
import { GuildCrest as GuildCrestType } from "@/types";

interface GuildCrestProps {
  crest: GuildCrestType | undefined;
  faction?: string; // "Alliance" or "Horde"
  size?: number; // Size in pixels (width and height will be the same)
  className?: string;
}

/**
 * Component that renders a guild crest using custom components with the following layers:
 * 1. Faction circle base (alliance_circle or horde_circle)
 * 2. Circle border
 * 3. Banner (colored with background color)
 * 4. Border image from API (colored with border color)
 * 5. Emblem image from API (colored with emblem color)
 * 6. Rings (top layer)
 */
export default function GuildCrest({ crest, faction, size = 48, className = "" }: GuildCrestProps) {
  const [emblemImageState, setEmblemImageState] = useState<"local" | "backend" | "placeholder">("local");
  const [borderImageState, setBorderImageState] = useState<"local" | "backend" | "placeholder">("local");
  const [emblemBackendFailed, setEmblemBackendFailed] = useState(false);
  const [borderBackendFailed, setBorderBackendFailed] = useState(false);

  // If no crest data, show placeholder
  if (!crest) {
    return <div className={`bg-gray-700 rounded ${className}`} style={{ width: size, height: size }} />;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // Helper function to get image source for API-provided images
  const getImageSrc = (imageName: string, imageState: "local" | "backend" | "placeholder"): string => {
    if (imageState === "local") {
      return `/icons/${imageName}`;
    } else {
      return `${apiUrl}/icons/${imageName}`;
    }
  };

  // Convert RGBA color to CSS rgba string
  const rgbaToString = (color: { r: number; g: number; b: number; a: number }) => {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
  };

  const backgroundColor = rgbaToString(crest.background.color);
  const emblemColor = rgbaToString(crest.emblem.color);
  const borderColor = rgbaToString(crest.border.color);

  // Determine which faction circle to use (default to alliance if not specified)
  const factionCircle = faction?.toLowerCase() === "horde" ? "/custom_components/horde_circle.png" : "/custom_components/alliance_circle.png";

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {/* Layer 1: Faction circle base (alliance or horde) */}
      <div className="absolute inset-0">
        <Image src={factionCircle} alt="Faction base" width={size} height={size} className="object-contain" />
      </div>

      {/* Layer 2: Circle border */}
      <div className="absolute inset-0">
        <Image src="/custom_components/circle_border.png" alt="Circle border" width={size} height={size} className="object-contain" />
      </div>

      {/* Layer 3: Banner (colored with background color using multiply blend) */}
      <div className="absolute inset-0">
        <div className="relative w-full h-full">
          <Image src="/custom_components/banner.png" alt="Banner" width={size} height={size} className="object-contain" />
          {/* Color overlay for banner - preserves texture and shading */}
          <div className="absolute inset-0 mix-blend-multiply pointer-events-none" style={{ backgroundColor }} />
        </div>
      </div>

      {/* Layer 4: Border image from API (colored with border color) */}
      {!borderBackendFailed && borderImageState !== "placeholder" && (
        <div className="absolute inset-0">
          <div className="relative w-full h-full">
            <Image
              src={getImageSrc(crest.border.imageName, borderImageState)}
              alt="Guild border"
              width={size}
              height={size}
              className="object-contain"
              onError={() => {
                if (borderImageState === "local") {
                  setBorderImageState("backend");
                } else if (borderImageState === "backend") {
                  setBorderBackendFailed(true);
                  setBorderImageState("placeholder");
                }
              }}
            />
            {/* Color overlay for border - preserves texture */}
            <div className="absolute inset-0 mix-blend-multiply pointer-events-none" style={{ backgroundColor: borderColor }} />
          </div>
        </div>
      )}

      {/* Layer 5: Emblem image from API (colored with emblem color) */}
      {!emblemBackendFailed && emblemImageState !== "placeholder" && (
        <div className="absolute inset-0">
          <div className="relative w-full h-full">
            <Image
              src={getImageSrc(crest.emblem.imageName, emblemImageState)}
              alt="Guild emblem"
              width={size}
              height={size}
              className="object-contain"
              onError={() => {
                if (emblemImageState === "local") {
                  setEmblemImageState("backend");
                } else if (emblemImageState === "backend") {
                  setEmblemBackendFailed(true);
                  setEmblemImageState("placeholder");
                }
              }}
            />
            {/* Color overlay for emblem - preserves texture */}
            <div className="absolute inset-0 mix-blend-multiply pointer-events-none" style={{ backgroundColor: emblemColor }} />
          </div>
        </div>
      )}

      {/* Layer 6: Rings (top layer) */}
      <div className="absolute inset-0">
        <Image src="/custom_components/rings.png" alt="Rings" width={size} height={size} className="object-contain" />
      </div>
    </div>
  );
}
