"use client";

import { useEffect, useRef, useState } from "react";
import { GuildCrest as GuildCrestType } from "@/types";

// Layer positioning and scaling configuration
// Adjust these values to fine-tune the positioning of each layer
const LAYER_CONFIG = {
  factionCircle: { scale: 0.95, offsetX: 0, offsetY: 0 },
  circleBorder: { scale: 1.0, offsetX: 0, offsetY: 0 },
  banner: { scale: 0.95, offsetX: 0, offsetY: 7 },
  border: { scale: 0.7, offsetX: -0.5, offsetY: -6 },
  emblem: { scale: 0.55, offsetX: -4.5, offsetY: -7 },
  rings: { scale: 0.85, offsetX: 0, offsetY: 0 },
};

interface GuildCrestProps {
  crest: GuildCrestType | undefined;
  faction?: string; // "Alliance" or "Horde"
  size?: number; // Size in pixels (width and height will be the same)
  className?: string;
  drawFactionCircle?: boolean;
}

/**
 * Component that renders a guild crest using canvas with the following layers:
 * 1. Faction circle base (alliance_circle or horde_circle)
 * 2. Circle border
 * 3. Banner (colored with background color using multiply blend)
 * 4. Border image from API (colored with border color using multiply blend)
 * 5. Emblem image from API (colored with emblem color using multiply blend)
 * 6. Rings (top layer)
 */
export default function GuildCrest({ crest, faction, size = 48, className = "", drawFactionCircle = false }: GuildCrestProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  useEffect(() => {
    if (!crest || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) return;

    // Set canvas size (use 2x for better quality on high DPI displays)
    const scale = 1;
    canvas.width = size * scale;
    canvas.height = size * scale;
    ctx.scale(scale, scale);

    let isMounted = true;

    // Helper function to load an image with fallback
    const loadImage = (imageName: string, isApiImage: boolean): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";

        const tryLoad = (src: string, isFallback: boolean = false) => {
          img.src = src;
          img.onload = () => resolve(img);
          img.onerror = () => {
            if (!isFallback && isApiImage) {
              // Try backend as fallback
              tryLoad(`${apiUrl}/icons/${imageName}`, true);
            } else {
              reject(new Error(`Failed to load image: ${src}`));
            }
          };
        };

        if (isApiImage) {
          tryLoad(`/components/${imageName}`);
        } else {
          tryLoad(imageName);
        }
      });
    };

    // Apply multiply blend mode color to an image
    const applyMultiplyBlend = (
      ctx: CanvasRenderingContext2D,
      image: HTMLImageElement,
      x: number,
      y: number,
      width: number,
      height: number,
      color: { r: number; g: number; b: number; a: number }
    ) => {
      // Create a temporary canvas to draw and color the image
      const tempCanvas = document.createElement("canvas");
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;
      const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });

      if (!tempCtx) return;

      // Draw the image to the temporary canvas
      tempCtx.drawImage(image, 0, 0, scaledWidth, scaledHeight);

      // Get the image data from the temporary canvas
      const imageData = tempCtx.getImageData(0, 0, scaledWidth, scaledHeight);
      const data = imageData.data;

      // Apply multiply blend mode
      // Multiply formula: result = (base * blend) / 255
      // Only apply to non-transparent pixels
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];

        // Only apply color multiplication if pixel has opacity
        if (alpha > 0) {
          data[i] = (data[i] * color.r) / 255; // Red
          data[i + 1] = (data[i + 1] * color.g) / 255; // Green
          data[i + 2] = (data[i + 2] * color.b) / 255; // Blue
          // Alpha stays the same (data[i + 3])
        }
      }

      // Put the colored image data back to the temporary canvas
      tempCtx.putImageData(imageData, 0, 0);

      // Draw the colored image from the temporary canvas to the main canvas
      ctx.drawImage(tempCanvas, x * scale, y * scale);
    };

    // Render the crest
    const renderCrest = async () => {
      try {
        // Determine faction circle
        const factionCirclePath = faction?.toLowerCase() === "horde" ? "/custom_components/horde_circle.png" : "/custom_components/alliance_circle.png";

        // Load all images
        const [factionCircle, circleBorder, banner, borderImg, emblemImg, rings] = await Promise.allSettled([
          loadImage(factionCirclePath, false),
          loadImage("/custom_components/circle_border.png", false),
          loadImage("/custom_components/banner.png", false),
          loadImage(crest.border.imageName, true),
          loadImage(crest.emblem.imageName, true),
          loadImage("/custom_components/rings.png", false),
        ]);

        if (!isMounted) return;

        // Clear canvas
        ctx.clearRect(0, 0, size, size);

        // Helper function to calculate layer dimensions and position
        const getLayerDimensions = (config: { scale: number; offsetX: number; offsetY: number }) => {
          const layerSize = size * config.scale;
          const x = (size - layerSize) / 2 + config.offsetX;
          const y = (size - layerSize) / 2 + config.offsetY;
          return { x, y, width: layerSize, height: layerSize };
        };

        if (drawFactionCircle) {
          // Layer 1: Faction circle base
          if (factionCircle.status === "fulfilled") {
            const dims = getLayerDimensions(LAYER_CONFIG.factionCircle);
            ctx.drawImage(factionCircle.value, dims.x, dims.y, dims.width, dims.height);
          }

          // Layer 2: Circle border
          if (circleBorder.status === "fulfilled") {
            const dims = getLayerDimensions(LAYER_CONFIG.circleBorder);
            ctx.drawImage(circleBorder.value, dims.x, dims.y, dims.width, dims.height);
          }
        }

        // Layer 3: Banner with background color (multiply blend)
        if (banner.status === "fulfilled") {
          const dims = getLayerDimensions(LAYER_CONFIG.banner);
          applyMultiplyBlend(ctx, banner.value, dims.x, dims.y, dims.width, dims.height, crest.background.color);
        }

        // Layer 4: Border image with border color (multiply blend)
        if (borderImg.status === "fulfilled") {
          const dims = getLayerDimensions(LAYER_CONFIG.border);
          applyMultiplyBlend(ctx, borderImg.value, dims.x, dims.y, dims.width, dims.height, crest.border.color);
        }

        // Layer 5: Emblem image with emblem color (multiply blend)
        if (emblemImg.status === "fulfilled") {
          const dims = getLayerDimensions(LAYER_CONFIG.emblem);
          applyMultiplyBlend(ctx, emblemImg.value, dims.x, dims.y, dims.width, dims.height, crest.emblem.color);
        }

        if (drawFactionCircle) {
          // Layer 6: Rings (top layer)
          if (rings.status === "fulfilled") {
            const dims = getLayerDimensions(LAYER_CONFIG.rings);
            ctx.drawImage(rings.value, dims.x, dims.y, dims.width, dims.height);
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Error rendering guild crest:", error);
        setIsLoading(false);
      }
    };

    renderCrest();

    return () => {
      isMounted = false;
    };
  }, [crest, faction, size, apiUrl]);

  // If no crest data, show placeholder
  if (!crest) {
    return <div className={`bg-gray-700 rounded ${className}`} style={{ width: size, height: size }} />;
  }

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <canvas ref={canvasRef} style={{ width: size, height: size }} className={`${isLoading ? "opacity-0" : "opacity-100"} transition-opacity duration-200`} />
      {isLoading && <div className="absolute inset-0 bg-gray-700 rounded animate-pulse" />}
    </div>
  );
}
