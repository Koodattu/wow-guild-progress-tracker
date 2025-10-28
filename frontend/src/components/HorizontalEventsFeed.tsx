"use client";

import { Event } from "@/types";
import { useEffect, useState } from "react";
import EventCard from "./EventCard";

interface HorizontalEventsFeedProps {
  events: Event[];
}

export default function HorizontalEventsFeed({ events }: HorizontalEventsFeedProps) {
  const [visibleCount, setVisibleCount] = useState(5);

  // Adjust visible count based on screen width - more aggressive breakpoints
  useEffect(() => {
    const updateVisibleCount = () => {
      if (window.innerWidth < 768) {
        setVisibleCount(1); // mobile
      } else if (window.innerWidth < 1024) {
        setVisibleCount(2); // tablet
      } else if (window.innerWidth < 1280) {
        setVisibleCount(3); // small desktop
      } else if (window.innerWidth < 1536) {
        setVisibleCount(4); // medium desktop
      } else {
        setVisibleCount(5); // large desktop
      }
    };

    updateVisibleCount();
    window.addEventListener("resize", updateVisibleCount);
    return () => window.removeEventListener("resize", updateVisibleCount);
  }, []);

  const displayEvents = events.slice(0, visibleCount);

  if (events.length === 0) {
    return <div className="text-center text-gray-500 py-6">No events yet. Events will appear as guilds make progress!</div>;
  }

  return (
    <div className="flex gap-3">
      {displayEvents.map((event) => (
        <EventCard key={event._id} event={event} className="flex-1 min-w-0" />
      ))}
    </div>
  );
}
