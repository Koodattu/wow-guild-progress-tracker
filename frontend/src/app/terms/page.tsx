export default function TermsOfService() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>

      <div className="space-y-6 text-gray-300">
        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">1. What This Is</h2>
          <p>
            WoW Guild Progress Tracker is a fan-made hobby project built for the Finnish World of Warcraft community. It exists purely for fun — to track guild progress, raid
            performance, and related stats. This project is <strong>not affiliated with, endorsed by, or connected to Blizzard Entertainment</strong> in any way.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">2. As-Is Disclaimer</h2>
          <p>
            This service is provided <strong>&quot;AS IS&quot;</strong> with absolutely no warranty of any kind, express or implied. We make no guarantees about accuracy,
            reliability, uptime, or availability. The service may be modified, suspended, or shut down at any time, for any reason, without notice. This is a hobby project
            maintained in spare time — not a commercial product. The creators and contributors are not liable for any damages, losses, or issues arising from your use of, or
            inability to use, this service. There is no monetization and no ads.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">3. User Accounts</h2>
          <p className="mb-3">
            You can log in using your Discord account. Optionally, you may also connect your Battle.net and Twitch accounts. When you log in or connect accounts, we store the
            following:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Discord username and profile picture</li>
            <li>Email address (provided by Discord OAuth)</li>
            <li>Your World of Warcraft characters (if you grant Battle.net permission)</li>
          </ul>
          <p className="mt-3">We also collect anonymous usage and performance statistics to help improve the site. The Pickems feature has its own separate rules and policies.</p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">4. Third-Party Data</h2>
          <p>
            All guild, raid, and character data displayed on this site comes from public third-party APIs: Blizzard API, Warcraft Logs, and Raider.IO. We do not generate or verify
            this data. We have no control over its accuracy, completeness, or availability, and we are not responsible for it.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">5. Intellectual Property</h2>
          <p>
            World of Warcraft, Warcraft, and all related names, logos, and assets are trademarks and copyrights of Blizzard Entertainment, Inc. No claim is made to any Blizzard
            intellectual property. This project itself is open-source and available under the license specified in its GitHub repository.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">6. User Conduct</h2>
          <p>
            Use this service responsibly. Do not abuse, overload, scrape, or attempt to exploit the service. We reserve the right to block or restrict access for any user who
            misuses the service, at our sole discretion.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">7. Changes</h2>
          <p>
            We reserve the right to modify these terms, the service, or any feature at any time without prior notice. Continued use of the service after changes constitutes
            acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-3 text-white">8. Contact</h2>
          <p>Questions or concerns? Reach out via our Discord server or the GitHub repository.</p>
        </section>

        <div className="mt-8 pt-6 border-t border-gray-700 text-sm text-gray-400">
          <p>Last updated: March 21, 2026</p>
        </div>
      </div>
    </div>
  );
}
