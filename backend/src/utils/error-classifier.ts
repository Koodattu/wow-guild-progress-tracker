/**
 * Error classification utility for the WoW guild progress tracker.
 * Categorizes errors from various sources (WCL API, database, network) into
 * standardized types for consistent error handling and user feedback.
 */

/**
 * Enumeration of possible error types that can occur during guild processing.
 */
export enum ErrorType {
  GUILD_NOT_FOUND = "guild_not_found",
  RATE_LIMITED = "rate_limited",
  NETWORK_ERROR = "network_error",
  API_ERROR = "api_error",
  DATABASE_ERROR = "database_error",
  UNKNOWN = "unknown",
}

/**
 * Represents a classified error with metadata for handling and display.
 */
export interface ClassifiedError {
  /** The categorized error type */
  type: ErrorType;
  /** If true, this error should not be retried (permanent failure) */
  isPermanent: boolean;
  /** Human-readable message suitable for display in admin panel */
  userMessage: string;
  /** The original error message for debugging purposes */
  originalMessage: string;
}

/**
 * Detection patterns for each error type.
 * Each pattern is matched case-insensitively against the error message.
 */
const ERROR_PATTERNS: Record<ErrorType, RegExp[]> = {
  [ErrorType.GUILD_NOT_FOUND]: [/no guild exists for this name\/server\/region/i, /guild has not yet been claimed/i, /cannot return null for non-nullable field guild/i],
  [ErrorType.RATE_LIMITED]: [/rate limit/i, /\b429\b/, /too many requests/i],
  [ErrorType.NETWORK_ERROR]: [/gateway time-out/i, /\b504\b/, /econnrefused/i, /etimedout/i, /\bnetwork\b/i],
  [ErrorType.DATABASE_ERROR]: [/mongoerror/i, /mongodb/i, /e11000/i],
  [ErrorType.API_ERROR]: [],
  [ErrorType.UNKNOWN]: [],
};

/**
 * User-friendly messages for each error type.
 */
const USER_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.GUILD_NOT_FOUND]: "Guild not found or not claimed on Warcraft Logs",
  [ErrorType.RATE_LIMITED]: "API rate limit exceeded - will retry later",
  [ErrorType.NETWORK_ERROR]: "Network connectivity issue - will retry later",
  [ErrorType.API_ERROR]: "API returned an error",
  [ErrorType.DATABASE_ERROR]: "Database error occurred",
  [ErrorType.UNKNOWN]: "An unexpected error occurred",
};

/**
 * Whether each error type represents a permanent failure (should not retry).
 */
const IS_PERMANENT: Record<ErrorType, boolean> = {
  [ErrorType.GUILD_NOT_FOUND]: true,
  [ErrorType.RATE_LIMITED]: false,
  [ErrorType.NETWORK_ERROR]: false,
  [ErrorType.API_ERROR]: false,
  [ErrorType.DATABASE_ERROR]: false,
  [ErrorType.UNKNOWN]: false,
};

/**
 * Classifies an error message into a standardized error type with metadata.
 *
 * @param errorMessage - The raw error message string to classify
 * @returns A ClassifiedError object with type, permanence, and messages
 *
 * @example
 * const result = classifyError("No guild exists for this name/server/region");
 * // Returns: {
 * //   type: ErrorType.GUILD_NOT_FOUND,
 * //   isPermanent: true,
 * //   userMessage: "Guild not found or not claimed on Warcraft Logs",
 * //   originalMessage: "No guild exists for this name/server/region"
 * // }
 */
export function classifyError(errorMessage: string): ClassifiedError {
  const message = errorMessage || "";

  // Check each error type's patterns in order of specificity
  const errorTypesToCheck: ErrorType[] = [ErrorType.GUILD_NOT_FOUND, ErrorType.RATE_LIMITED, ErrorType.NETWORK_ERROR, ErrorType.DATABASE_ERROR];

  for (const errorType of errorTypesToCheck) {
    const patterns = ERROR_PATTERNS[errorType];
    const matchesPattern = patterns.some((pattern) => pattern.test(message));

    if (matchesPattern) {
      return {
        type: errorType,
        isPermanent: IS_PERMANENT[errorType],
        userMessage: USER_MESSAGES[errorType],
        originalMessage: message,
      };
    }
  }

  // Default to unknown error type
  return {
    type: ErrorType.UNKNOWN,
    isPermanent: IS_PERMANENT[ErrorType.UNKNOWN],
    userMessage: USER_MESSAGES[ErrorType.UNKNOWN],
    originalMessage: message,
  };
}
