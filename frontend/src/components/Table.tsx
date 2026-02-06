"use client";

import type { ColumnDef } from "@/types/index";
import { getRankColor } from "@/lib/utils";

interface TableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  pagination?: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
  onPageChange?: (page: number) => void;
}

export function Table<T>({
  columns,
  data,
  pagination,
  onPageChange,
}: TableProps<T>) {
  const currentPage = pagination?.currentPage ?? 1;
  const totalPages = pagination?.totalPages ?? 1;
  const totalItems = pagination?.totalItems ?? data.length;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900">
              {columns.map((column, colIndex) => (
                <th
                  key={column.id}
                  className={`py-3 px-4 text-left font-semibold text-gray-200 ${
                    colIndex !== columns.length - 1
                      ? "border-r border-gray-700"
                      : ""
                  } ${column.width || ""}`}
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
              data.map((row, index) => {
                const actualRank =
                  (currentPage - 1) * (pagination?.pageSize ?? 50) + index + 1;
                return (
                  <tr
                    key={index}
                    className={`border-b border-gray-700 transition-colors hover:bg-gray-800 ${
                      index % 2 === 0 ? "bg-gray-950" : "bg-gray-900"
                    }`}
                  >
                    {columns.map((column, colIndex) => {
                      const isRankColumn = column.id === "rank";
                      const rankStyle = isRankColumn
                        ? getRankColor(actualRank, totalItems)
                        : {};

                      return (
                        <td
                          key={column.id}
                          className={`py-3 px-4 ${
                            colIndex !== columns.length - 1
                              ? "border-r border-gray-700"
                              : ""
                          } ${column.width || ""} ${
                            isRankColumn ? "font-bold text-right" : ""
                          }`}
                          style={rankStyle}
                        >
                          {column.accessor ? column.accessor(row, index) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
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
