"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function AnalyticsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (user?.isAdmin) {
      // Redirect admins to the admin analytics page
      router.replace("/admin/analytics");
    } else {
      // Redirect non-admins to home
      router.replace("/");
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-amber-400 text-xl mb-4">Redirecting...</div>
        <div className="text-slate-400">{isLoading ? "Checking authentication..." : "Please wait..."}</div>
      </div>
    </div>
  );
}
