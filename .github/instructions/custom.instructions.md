---
applyTo: "**/backend/**"
---

## 🏗️ Core Architectural Principles

- **SOLID Principles:** Adhere strictly to Single Responsibility, Open/Closed, Lisked Substitution, Interface Segregation, and Dependency Inversion.
- **DRY & KISS:** Do not repeat logic; keep implementations simple and avoid over-engineering.
- **YAGNI:** Do not implement features or "future-proof" code until explicitly requested.
- **Separation of Concerns:** Maintain a clear distinction between the **Controller** (entry points), **Service** (business logic), and **Repository** (data access) layers.

## 🔐 Security-First Mindset

- **Zero Trust:** Validate and sanitize all incoming data. Use parameterized queries or ORMs to prevent **SQL Injection**.
- **Principle of Least Privilege:** Ensure database users and API keys have only the minimum permissions necessary.
- **Sensitive Data:** Never log PII (Personally Identifiable Information), passwords, or secrets. Use environment variables for configuration.
- **OWASP Top 10:** Always cross-check implementations against common vulnerabilities like XSS, CSRF, and Broken Access Control.

## 📉 Data Efficiency & Optimization

- **Minimal Payloads:** Only return the specific fields requested or necessary for the client. Use Data Transfer Objects (DTOs) to filter model data.
- **Pagination & Filtering:** Never return large arrays of data. Implement server-side pagination (limit/offset or cursor-based).
- **Lazy vs. Eager Loading:** Avoid the "N+1 query problem" by using eager loading for required relationships, but use lazy loading to avoid fetching unnecessary nested objects.
- **Compression:** Ensure responses are compressed (e.g., Gzip/Brotli) where appropriate.

## ✨ Clean Code & Documentation

- **Self-Documenting Code:** Use descriptive variable and function names (e.g., `calculateMonthlyRevenue` instead of `calcRev`).
- **Error Handling:** Use a global error-handling middleware. Return meaningful HTTP status codes (e.g., 400 for bad input, 401 for unauthorized) and consistent JSON error shapes.
- **Idempotency:** Ensure that `PUT` and `DELETE` requests can be repeated without side effects.
- **Comments:** Comment on the "Why," not the "What." The "What" should be clear from the code itself.
