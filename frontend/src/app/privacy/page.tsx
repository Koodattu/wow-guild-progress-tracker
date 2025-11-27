export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>

      <div className="space-y-6 text-gray-300">
        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">1. Introduction</h2>
          <p>This Privacy Policy explains how WoW Guild Progress Tracker handles information. We are committed to transparency and protecting user privacy.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">2. Information We Do NOT Collect</h2>
          <p className="mb-2">This is a simple information aggregator service. We do not collect, store, or track:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Personal information (names, email addresses, etc.)</li>
            <li>User accounts or login credentials</li>
            <li>Cookies for tracking purposes</li>
            <li>Analytics or behavioral data</li>
            <li>IP addresses or device information</li>
            <li>Any form of personally identifiable information (PII)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">3. Public Data Display</h2>
          <p>This service displays publicly available information about World of Warcraft guilds sourced from third-party APIs including:</p>
          <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
            <li>Blizzard Entertainment&apos;s official World of Warcraft API</li>
            <li>Warcraft Logs</li>
            <li>Raider.IO</li>
            <li>Other publicly accessible gaming data sources</li>
          </ul>
          <p className="mt-2">All displayed information is already publicly available through these services.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">4. Third-Party Services</h2>
          <p>
            This website may contain links to external services (Discord, GitHub, Twitch, etc.). These third-party services have their own privacy policies, and we are not
            responsible for their practices. We encourage you to review their privacy policies.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">5. Server Logs</h2>
          <p>
            Like most web services, our server may automatically log basic technical information such as request timestamps and API calls for debugging and operational purposes
            only. This data is not used for tracking individual users and is not shared with third parties.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">6. Data Security</h2>
          <p>
            Since we do not collect personal information, there is minimal risk to user privacy. However, we take reasonable measures to secure our infrastructure and prevent
            unauthorized access.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">7. Children&apos;s Privacy</h2>
          <p>
            This service does not knowingly collect any information from anyone, including children under the age of 13. The service simply displays publicly available gaming data.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">8. Your Rights</h2>
          <p>
            Since we do not collect or store personal information, there is no user data to access, modify, or delete. If you have concerns about data displayed from third-party
            sources, please contact those services directly (Blizzard, Warcraft Logs, Raider.IO, etc.).
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">9. International Users</h2>
          <p>
            This service is available globally. By using this service, you acknowledge that the publicly available data displayed may be processed on servers in various locations.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">10. Changes to Privacy Policy</h2>
          <p>
            This Privacy Policy may be updated from time to time. Any changes will be posted on this page. Continued use of the service after changes constitutes acceptance of the
            updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">11. Open Source</h2>
          <p>This project is open-source. You can review the code on GitHub to verify our privacy practices and see exactly what data is processed.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">12. Contact</h2>
          <p>If you have any questions about this Privacy Policy, please contact us via our Discord server or GitHub repository.</p>
        </section>

        <div className="mt-8 pt-6 border-t border-gray-700 text-sm text-gray-400">
          <p>Last updated: November 27, 2025</p>
        </div>
      </div>
    </div>
  );
}
