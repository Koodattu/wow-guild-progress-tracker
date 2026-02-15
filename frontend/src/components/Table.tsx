"use client";

import { Fragment, type ReactNode, useState } from "react";
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
    totalRankedItems?: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  };
  onPageChange?: (page: number) => void;
  /** Extract the server-provided rank from a row. When provided, used for rank coloring instead of positional index. */
  getRank?: (row: T, index: number) => number;
  /** Index of the row to highlight (e.g. after a jump-to-character search). -1 or undefined means no highlight. */
  highlightIndex?: number;
  /** When provided, rows become expandable on mobile. A chevron column is added (visible only below md). */
  expandedContent?: (row: T, index: number) => ReactNode;
}

function mobileClass(column: { mobileHidden?: boolean }) {
  return column.mobileHidden ? "hidden md:table-cell" : "";
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}>
      <path
        fillRule="evenodd"
        d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Table<T>({ columns, data, loading = false, skeletonRowCount, pagination, onPageChange, getRank, highlightIndex, expandedContent }: TableProps<T>) {
  const t = useTranslations("table");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const currentPage = pagination?.currentPage ?? 1;
  const totalPages = pagination?.totalPages ?? 1;
  const totalItems = pagination?.totalItems ?? data.length;
  const rowsToRender = skeletonRowCount ?? Math.min(10, pagination?.pageSize ?? 10);

  const hasMobileHidden = columns.some((c) => c.mobileHidden);
  const showExpandColumn = !!expandedContent && hasMobileHidden;
  const visibleColumnCount = columns.length + (showExpandColumn ? 1 : 0);

  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="overflow-x-auto border border-gray-700">
          <table className="w-full text-xs md:text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-900">
                {columns.map((column, colIndex) => (
                  <th
                    key={column.id}
                    className={`py-2 px-2 md:py-3 md:px-4 text-center font-semibold text-gray-200 ${mobileClass(column)} ${colIndex !== columns.length - 1 ? "border-r border-gray-700" : ""} ${column.width || ""}`}
                    style={column.shrink ? { width: "1%", whiteSpace: "nowrap" } : undefined}
                  >
                    {column.header}
                  </th>
                ))}
                {showExpandColumn ? <th className="w-8 md:hidden bg-gray-900" /> : null}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowsToRender }).map((_, rowIndex) => (
                <tr key={`skeleton-row-${rowIndex}`} className={`border-b border-gray-700 ${rowIndex % 2 === 0 ? "bg-gray-950" : "bg-gray-900"}`}>
                  {columns.map((column, colIndex) => (
                    <td
                      key={`skeleton-cell-${column.id}-${rowIndex}`}
                      className={`py-2 px-2 md:py-3 md:px-4 ${mobileClass(column)} ${colIndex !== columns.length - 1 ? "border-r border-gray-700" : ""} ${column.width || ""}`}
                      style={column.shrink ? { width: "1%", whiteSpace: "nowrap" } : undefined}
                    >
                      <div className="h-4 w-full max-w-[140px] animate-pulse rounded bg-gray-800" />
                    </td>
                  ))}
                  {showExpandColumn ? <td className="md:hidden" /> : null}
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
        <table className="w-full text-xs md:text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-900">
              {columns.map((column, colIndex) => (
                <th
                  key={column.id}
                  className={`py-2 px-2 md:py-3 md:px-4 text-center font-semibold text-gray-200 ${mobileClass(column)} ${colIndex !== columns.length - 1 ? "border-r border-gray-700" : ""} ${column.width || ""}`}
                  style={column.shrink ? { width: "1%", whiteSpace: "nowrap" } : undefined}
                >
                  {column.header}
                </th>
              ))}
              {showExpandColumn ? <th className="w-8 md:hidden bg-gray-900" /> : null}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="py-6 px-2 md:py-8 md:px-4 text-center text-gray-400 font-bold">
                  {t("noData")}
                </td>
              </tr>
            ) : (
              data.map((row, index) => {
                const actualRank = getRank ? getRank(row, index) : (currentPage - 1) * (pagination?.pageSize ?? 50) + index + 1;
                const rankColorTotal = pagination?.totalRankedItems ?? totalItems;
                const isExpanded = expandedRows.has(index);
                const isHighlighted = highlightIndex !== undefined && highlightIndex >= 0 && index === highlightIndex;
                const rowBg = isHighlighted ? "bg-yellow-900/40 ring-1 ring-inset ring-yellow-500/50" : index % 2 === 0 ? "bg-gray-950" : "bg-gray-900";

                return (
                  <Fragment key={index}>
                    <tr
                      className={`border-b border-gray-700 transition-colors hover:bg-gray-800 ${rowBg} ${showExpandColumn ? "cursor-pointer md:cursor-default" : ""}`}
                      onClick={showExpandColumn ? () => toggleRow(index) : undefined}
                    >
                      {columns.map((column, colIndex) => {
                        const isRankColumn = column.id === "rank";
                        const rankStyle = isRankColumn ? getRankColor(actualRank, rankColorTotal) : {};
                        const alignClass = column.align === "right" ? "text-right" : column.align === "left" ? "text-left" : "text-center";

                        return (
                          <td
                            key={column.id}
                            className={`py-2 px-2 md:py-3 md:px-4 font-bold ${alignClass} ${mobileClass(column)} ${colIndex !== columns.length - 1 ? "border-r border-gray-700" : ""} ${column.width || ""}`}
                            style={column.shrink ? { ...rankStyle, width: "1%", whiteSpace: "nowrap" } : rankStyle}
                          >
                            {column.accessor ? column.accessor(row, index) : null}
                          </td>
                        );
                      })}
                      {showExpandColumn ? (
                        <td className="py-2 px-1 text-center md:hidden" style={{ width: "1%" }}>
                          <ChevronIcon open={isExpanded} />
                        </td>
                      ) : null}
                    </tr>
                    {showExpandColumn && isExpanded ? (
                      <tr className={`border-b border-gray-700 md:hidden ${rowBg}`}>
                        <td colSpan={visibleColumnCount} className="px-3 py-3">
                          {expandedContent(row, index)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && onPageChange && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4 px-2 sm:px-4 py-3 sm:py-4">
          <div className="text-xs sm:text-sm text-gray-400">
            {t("page")} {currentPage} {t("of")} {totalPages} ({pagination.totalItems} {t("total")})
          </div>

          <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
            <button
              onClick={() => onPageChange(1)}
              disabled={currentPage <= 1}
              className="hidden sm:inline-flex px-3 py-2 rounded-md bg-gray-800 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-700 transition-colors"
            >
              {t("first")}
            </button>
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md bg-gray-800 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-700 transition-colors"
            >
              {t("previous")}
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md bg-gray-800 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-700 transition-colors"
            >
              {t("next")}
            </button>
            <button
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage >= totalPages}
              className="hidden sm:inline-flex px-3 py-2 rounded-md bg-gray-800 text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-gray-700 transition-colors"
            >
              {t("last")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
