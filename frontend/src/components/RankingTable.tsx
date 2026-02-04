"use client";

import type { Boss, CharacterRankingRow } from "@/types";
import type { ColumnDef } from "@/types/index";
import { BossSelector } from "./BossSelector";

interface RankingTableProps {
  columns: ColumnDef<CharacterRankingRow>[];
  data: CharacterRankingRow[];
  bosses: Boss[];
  selectedBoss: Boss | null;
  onBossChange: (boss: Boss | null) => void;
  title: string;
  loading?: boolean;
  error?: string | null;
  pagination?: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
  onPageChange?: (page: number) => void;
}

export function RankingTable({
  columns,
  data,
  bosses,
  selectedBoss,
  onBossChange,
  title,
  loading = false,
  error = null,
  pagination,
  onPageChange,
}: RankingTableProps) {
  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-300">{error}</div>;

  const currentPage = pagination?.currentPage ?? 1;
  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <BossSelector
          bosses={bosses}
          selectedBoss={selectedBoss}
          onChange={onBossChange}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900">
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={`py-3 px-4 text-left font-semibold text-gray-200 ${
                    column.width || ""
                  }`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-8 px-4 text-center text-gray-400"
                >
                  No data available
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr
                  key={`${row.character.wclCanonicalCharacterId}-${index}`}
                  className="border-b border-gray-700 transition-colors hover:bg-gray-800"
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={`py-3 px-4 ${column.width || ""}`}
                    >
                      {column.accessor ? column.accessor(row, index) : null}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && onPageChange && (
        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <div className="text-sm text-gray-400">
            Page {currentPage} of {totalPages} ({pagination.totalItems} total)
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-700 transition-colors"
            >
              ← Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(
                Math.max(0, currentPage - 2),
                Math.min(totalPages, currentPage + 1),
              )
              .map((page) => (
                <button
                  key={page}
                  onClick={() => onPageChange(page)}
                  className={`px-3 py-2 rounded-md transition-colors ${
                    currentPage === page
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-200 hover:bg-gray-700"
                  }`}
                >
                  {page}
                </button>
              ))}

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-700 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
