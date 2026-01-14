import { Suspense } from "react";
import ProgressContent from "./ProgressContent";

function LoadingFallback() {
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
    <Suspense fallback={<LoadingFallback />}>
      <ProgressContent />
    </Suspense>
  );
}
