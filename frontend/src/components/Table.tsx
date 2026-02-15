"use client";

import type { ColumnDef } from "@/types/index";
import { getRankColor } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface TableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  loading?: boolean;
  skeletonRowCount?: number;
  pagination?: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
  onPageChange?: (page: number) => void;
}

export function Table<T>({ columns, data, loading = false, skeletonRowCount, pagination, onPageChange }: TableProps<T>) {
  const t = useTranslations("table");
  const currentPage = pagination?.currentPage ?? 1;
  const totalPages = pagination?.totalPages ?? 1;
  const totalItems = pagination?.totalItems ?? data.length;
  const rowsToRender = skeletonRowCount ?? Math.min(10, pagination?.pageSize ?? 10);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="overflow-x-auto border border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-900">
                {columns.map((column, colIndex) => (
                  <th
                    key={column.id}
                    className={`py-3 px-4 text-left font-semibold text-gray-200 ${colIndex !== columns.length - 1 ? "border-r border-gray-700" : ""} ${column.width || ""}`}
                    style={column.shrink ? { width: "1%", whiteSpace: "nowrap" } : undefined}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowsToRender }).map((_, rowIndex) => (
                <tr key={`skeleton-row-${rowIndex}`} className={`border-b border-gray-700 ${rowIndex % 2 === 0 ? "bg-gray-950" : "bg-gray-900"}`}>
                  {columns.map((column, colIndex) => (
                    <td
                      key={`skeleton-cell-${column.id}-${rowIndex}`}
                      className={`py-3 px-4 ${colIndex !== columns.length - 1 ? "border-r border-gray-700" : ""} ${column.width || ""}`}
                      style={column.shrink ? { width: "1%", whiteSpace: "nowrap" } : undefined}
                    >
                      <div className="h-4 w-full max-w-[140px] animate-pulse rounded bg-gray-800" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-4">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-800" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`skeleton-page-${index}`} className="h-9 w-16 animate-pulse rounded-md bg-gray-800" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900">
              {columns.map((column, colIndex) => (
                <th
                  key={column.id}
                  className={`py-3 px-4 text-left font-semibold text-gray-200 ${colIndex !== columns.length - 1 ? "border-r border-gray-700" : ""} ${column.width || ""}`}
                  style={column.shrink ? { width: "1%", whiteSpace: "nowrap" } : undefined}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-8 px-4 text-center text-gray-400 font-bold">
                  {t("noData")}
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const actualRank = (currentPage - 1) * (pagination?.pageSize ?? 50) + index + 1;
                return (
                  <tr key={index} className={`border-b border-gray-700 transition-colors hover:bg-gray-800 ${index % 2 === 0 ? "bg-gray-950" : "bg-gray-900"}`}>
                    {columns.map((column, colIndex) => {
                      const isRankColumn = column.id === "rank";
                      const isMetricColumn = column.id === "metric";
                      const rankStyle = isRankColumn ? getRankColor(actualRank, totalItems) : {};

                      return (
                        <td
                          key={column.id}
                          className={`py-3 px-4 font-bold ${colIndex !== columns.length - 1 ? "border-r border-gray-700" : ""} ${column.width || ""} ${
                            isRankColumn ? "font-bold text-right" : ""
                          } ${isMetricColumn ? "font-bold" : ""}`}
                          style={column.shrink ? { ...rankStyle, width: "1%", whiteSpace: "nowrap" } : rankStyle}
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
            {t("page")} {currentPage} {t("of")} {totalPages} ({pagination.totalItems} {t("total")})
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(1)}
              disabled={currentPage <= 1}
              className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-700 transition-colors"
            >
              {t("first")}
            </button>
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-700 transition-colors"
            >
              {t("previous")}
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-700 transition-colors"
            >
              {t("next")}
            </button>
            <button
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage >= totalPages}
              className="px-3 py-2 rounded-md bg-gray-800 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-700 transition-colors"
            >
              {t("last")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
