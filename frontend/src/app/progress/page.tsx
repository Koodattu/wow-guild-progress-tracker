"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function ProgressRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Preserve any query params (e.g. ?raidid=123) when redirecting
    const params = searchParams.toString();
    const target = params ? `/?${params}` : "/";
    router.replace(target);
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4">⚔️</div>
        <div className="text-white text-xl">Loading guild data...</div>
      </div>
    </div>
  );
}

export default function Progress() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4">⚔️</div>
            <div className="text-white text-xl">Loading guild data...</div>
          </div>
        </div>
      }
    >
      <ProgressRedirect />
    </Suspense>
  );
}
