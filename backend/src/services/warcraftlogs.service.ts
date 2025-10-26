import fetch from "node-fetch";

interface WCLAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

class WarcraftLogsService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private requestCount: number = 0;
  private requestWindow: number = Date.now();
  private readonly MAX_REQUESTS_PER_HOUR = 3600;
  private zonesCache: any = null;
  private zonesCacheTime: number = 0;
  private readonly ZONES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  private async authenticate(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const clientId = process.env.WCL_CLIENT_ID;
    const clientSecret = process.env.WCL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("WCL credentials not configured");
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await fetch("https://www.warcraftlogs.com/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      throw new Error(`WCL authentication failed: ${response.statusText}`);
    }

    const data = (await response.json()) as WCLAuthResponse;
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000 - 60000; // Refresh 1 min early

    console.log("WCL authenticated successfully");
    return this.accessToken;
  }

  private async rateLimitCheck(): Promise<void> {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Reset counter if we've passed the hour window
    if (now - this.requestWindow > oneHour) {
      this.requestCount = 0;
      this.requestWindow = now;
    }

    // If we're approaching the limit, wait
    if (this.requestCount >= this.MAX_REQUESTS_PER_HOUR - 10) {
      const waitTime = oneHour - (now - this.requestWindow);
      console.log(`Rate limit approaching, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.requestWindow = Date.now();
    }

    this.requestCount++;

    // Add a small delay between requests to avoid bursting
    // This helps stay under the rate limit more smoothly
    await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay = max 600 requests/minute
  }

  async query<T>(query: string, variables?: any): Promise<T> {
    await this.rateLimitCheck();
    const token = await this.authenticate();

    const response = await fetch("https://www.warcraftlogs.com/api/v2/client", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    // Handle rate limiting with retry
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // Default to 60s if not specified
      console.warn(`⚠️  Rate limited by WCL API! Waiting ${Math.floor(waitTime / 1000)}s before retry...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return this.query<T>(query, variables); // Retry the request
    }

    if (!response.ok) {
      throw new Error(`WCL API request failed: ${response.statusText}`);
    }

    const result = (await response.json()) as any;

    if (result.errors) {
      throw new Error(`WCL GraphQL error: ${JSON.stringify(result.errors)}`);
    }

    // Log rate limit info if available
    if (result.data?.rateLimitData) {
      const rateLimit = result.data.rateLimitData;
      const percentUsed = ((rateLimit.pointsSpentThisHour / rateLimit.limitPerHour) * 100).toFixed(1);
      console.log(
        `[WCL Rate Limit] ${rateLimit.pointsSpentThisHour.toFixed(0)}/${rateLimit.limitPerHour} points used (${percentUsed}%), resets in ${Math.floor(
          rateLimit.pointsResetIn / 60
        )}m ${rateLimit.pointsResetIn % 60}s`
      );

      // Warn if we're getting close to the limit
      if (rateLimit.pointsSpentThisHour / rateLimit.limitPerHour > 0.8) {
        console.warn(`⚠️  WARNING: Approaching rate limit! Consider slowing down requests.`);
      }
    }

    return result.data as T;
  }

  // Get guild reports without zone filter to see all available reports
  async getGuildReportsAll(guildName: string, serverSlug: string, serverRegion: string, limit: number = 10) {
    const query = `
      query($guildName: String!, $serverSlug: String!, $serverRegion: String!, $limit: Int!) {
        reportData {
          reports(guildName: $guildName, guildServerSlug: $serverSlug, guildServerRegion: $serverRegion, limit: $limit) {
            data {
              code
              title
              startTime
              endTime
              zone {
                id
                name
              }
            }
          }
        }
      }
    `;

    const variables = {
      guildName,
      serverSlug,
      serverRegion,
      limit,
    };

    return this.query<any>(query, variables);
  }

  // Get guild reports with full fight data - NO zone filter (for initial fetch)
  // This fetches all reports across all content (raids, dungeons, etc.)
  async getGuildReportsWithFights(guildName: string, serverSlug: string, serverRegion: string, limit: number = 10, page: number = 1) {
    const query = `
      query($guildName: String!, $serverSlug: String!, $serverRegion: String!, $limit: Int!, $page: Int!) {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
        guildData {
          guild(name: $guildName, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            faction {
              name
            }
          }
        }
        reportData {
          reports(guildName: $guildName, guildServerSlug: $serverSlug, guildServerRegion: $serverRegion, limit: $limit, page: $page) {
            data {
              code
              startTime
              endTime
              zone {
                id
                name
              }
              phases {
                encounterID
                separatesWipes
                phases {
                  id
                  name
                  isIntermission
                }
              }
              fights(killType: Encounters) {
                id
                encounterID
                name
                difficulty
                kill
                bossPercentage
                fightPercentage
                startTime
                endTime
                phaseTransitions {
                  id
                  startTime
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      guildName,
      serverSlug,
      serverRegion,
      limit,
      page,
    };

    return this.query<any>(query, variables);
  }

  // Lightweight check for new reports - only fetches codes and timestamps, no fights data
  // This is much cheaper (uses fewer points) than fetching full report data
  async checkForNewReports(guildName: string, serverSlug: string, serverRegion: string, zoneId: number, limit: number = 5) {
    const query = `
      query($guildName: String!, $serverSlug: String!, $serverRegion: String!, $zoneId: Int!, $limit: Int!) {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
        reportData {
          reports(guildName: $guildName, guildServerSlug: $serverSlug, guildServerRegion: $serverRegion, zoneID: $zoneId, limit: $limit) {
            data {
              code
              startTime
              endTime
            }
          }
        }
      }
    `;

    const variables = {
      guildName,
      serverSlug,
      serverRegion,
      zoneId,
      limit,
    };

    return this.query<any>(query, variables);
  }

  // Get a single report by code with all fight details
  async getReportByCode(reportCode: string, difficultyId: number) {
    const query = `
      query($reportCode: String!, $difficulty: Int!) {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
        reportData {
          report(code: $reportCode) {
            code
            startTime
            endTime
            fights(difficulty: $difficulty, killType: Encounters) {
              id
              encounterID
              name
              kill
              bossPercentage
              fightPercentage
              startTime
              endTime
            }
          }
        }
      }
    `;

    const variables = {
      reportCode,
      difficulty: difficultyId,
    };

    return this.query<any>(query, variables);
  }

  // Get a single report by code with fights - ALL difficulties (not filtered)
  async getReportByCodeAllDifficulties(reportCode: string) {
    const query = `
      query($reportCode: String!) {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
        reportData {
          report(code: $reportCode) {
            code
            startTime
            endTime
            phases {
              encounterID
              separatesWipes
              phases {
                id
                name
                isIntermission
              }
            }
            fights(killType: Encounters) {
              id
              encounterID
              name
              difficulty
              kill
              bossPercentage
              fightPercentage
              startTime
              endTime
              phaseTransitions {
                id
                startTime
              }
            }
          }
        }
      }
    `;

    const variables = {
      reportCode,
    };

    return this.query<any>(query, variables);
  }

  // Get guild info and recent reports for a specific raid - ALL difficulties (not filtered)
  // Note: Limit kept low (10) to avoid WCL query complexity limits when fetching phase data
  async getGuildReportsAllDifficulties(guildName: string, serverSlug: string, serverRegion: string, zoneId: number, limit: number = 10, page: number = 1) {
    const query = `
      query($guildName: String!, $serverSlug: String!, $serverRegion: String!, $zoneId: Int!, $limit: Int!, $page: Int!) {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
        guildData {
          guild(name: $guildName, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            faction {
              name
            }
          }
        }
        reportData {
          reports(guildName: $guildName, guildServerSlug: $serverSlug, guildServerRegion: $serverRegion, zoneID: $zoneId, limit: $limit, page: $page) {
            data {
              code
              startTime
              endTime
              phases {
                encounterID
                separatesWipes
                phases {
                  id
                  name
                  isIntermission
                }
              }
              fights(killType: Encounters) {
                id
                encounterID
                name
                difficulty
                kill
                bossPercentage
                fightPercentage
                startTime
                endTime
                phaseTransitions {
                  id
                  startTime
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      guildName,
      serverSlug,
      serverRegion,
      zoneId,
      limit,
      page,
    };

    return this.query<any>(query, variables);
  }

  // Get zone (raid) information - with caching
  async getGuildReports(guildName: string, serverSlug: string, serverRegion: string, zoneId: number, difficultyId: number, limit: number = 50, page: number = 1) {
    const query = `
      query($guildName: String!, $serverSlug: String!, $serverRegion: String!, $zoneId: Int!, $limit: Int!, $difficulty: Int!, $page: Int!) {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
        guildData {
          guild(name: $guildName, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            faction {
              name
            }
          }
        }
        reportData {
          reports(guildName: $guildName, guildServerSlug: $serverSlug, guildServerRegion: $serverRegion, zoneID: $zoneId, limit: $limit, page: $page) {
            data {
              code
              startTime
              endTime
              fights(difficulty: $difficulty, killType: Encounters) {
                id
                encounterID
                name
                kill
                bossPercentage
                fightPercentage
                startTime
                endTime
              }
            }
          }
        }
      }
    `;

    const variables = {
      guildName,
      serverSlug,
      serverRegion,
      zoneId,
      limit,
      difficulty: difficultyId,
      page,
    };

    return this.query<any>(query, variables);
  }

  // Get zone (raid) information with encounters - NOT using cache since encounters needed
  async getZone(zoneId: number) {
    // Don't use cache here because we need detailed encounter data
    // The getZones() cache only has id and name, not encounters

    // Fetch fresh data with encounters
    const query = `
      query($zoneId: Int!) {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
        worldData {
          zone(id: $zoneId) {
            id
            name
            expansion {
              id
              name
            }
            encounters {
              id
              name
            }
          }
        }
      }
    `;

    return this.query<any>(query, { zoneId });
  }

  // Get all available zones - with caching
  async getZones() {
    // Check cache first
    const now = Date.now();
    if (this.zonesCache && now - this.zonesCacheTime < this.ZONES_CACHE_TTL) {
      console.log("Using cached zones data");
      return { worldData: { zones: this.zonesCache } };
    }

    console.log("Fetching fresh zones data...");
    const query = `
      query {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
        worldData {
          zones {
            id
            name
          }
        }
      }
    `;

    const result = await this.query<any>(query);

    // Cache the zones data
    if (result.worldData?.zones) {
      this.zonesCache = result.worldData.zones;
      this.zonesCacheTime = now;
      console.log(`Cached ${this.zonesCache.length} zones`);
    }

    return result;
  }

  /**
   * Determines which phase a fight ended in and creates display string
   */
  determinePhaseInfo(
    fight: any,
    encounterPhases: any[]
  ): {
    lastPhase?: { phaseId: number; phaseName: string; isIntermission: boolean };
    allPhases: Array<{ phaseId: number; phaseName: string; isIntermission: boolean }>;
    progressDisplay: string;
  } {
    const result: {
      lastPhase?: { phaseId: number; phaseName: string; isIntermission: boolean };
      allPhases: Array<{ phaseId: number; phaseName: string; isIntermission: boolean }>;
      progressDisplay: string;
    } = {
      allPhases: [],
      progressDisplay: "",
    };

    // Find phase metadata for this encounter
    const encounterMeta = encounterPhases?.find((ep: any) => ep.encounterID === fight.encounterID);

    if (!encounterMeta?.phases || encounterMeta.phases.length === 0) {
      // No phase data available, use simple display
      if (fight.bossPercentage !== undefined && fight.bossPercentage !== null) {
        result.progressDisplay = `${fight.bossPercentage.toFixed(1)}%`;
      } else if (fight.fightPercentage !== undefined) {
        result.progressDisplay = `${fight.fightPercentage.toFixed(1)}% overall`;
      }
      return result;
    }

    // Build phase map for lookup
    const phaseMap = new Map<number, { phaseId: number; phaseName: string; isIntermission: boolean }>();
    encounterMeta.phases.forEach((p: any) => {
      phaseMap.set(p.id, {
        phaseId: p.id,
        phaseName: p.name,
        isIntermission: p.isIntermission || false,
      });
    });

    // Determine which phases occurred
    if (fight.phaseTransitions && fight.phaseTransitions.length > 0) {
      // Sort transitions by time
      const transitions = [...fight.phaseTransitions].sort((a: any, b: any) => a.startTime - b.startTime);

      // Build all phases that occurred
      transitions.forEach((trans: any) => {
        const phaseInfo = phaseMap.get(trans.id);
        if (phaseInfo) {
          result.allPhases.push(phaseInfo);
        }
      });

      // Last phase is the one active at fight end
      const lastTransition = transitions[transitions.length - 1];
      result.lastPhase = phaseMap.get(lastTransition.id);
    } else {
      // No transitions recorded, assume Phase 1
      result.lastPhase = phaseMap.get(1) || {
        phaseId: 1,
        phaseName: "Phase 1",
        isIntermission: false,
      };
      result.allPhases.push(result.lastPhase);
    }

    // Create display string
    const bossHealth = fight.bossPercentage?.toFixed(1) || "?";
    const phaseName = result.lastPhase?.phaseName || "Unknown";

    // Format phase name for display (shorten if needed)
    let phaseDisplay = phaseName;
    if (phaseName.toLowerCase().includes("phase")) {
      // "Phase 3" -> "P3"
      phaseDisplay = phaseName.replace(/phase\s*/i, "P");
    } else if (phaseName.toLowerCase().includes("intermission")) {
      // "Intermission 1" -> "I1"
      phaseDisplay = phaseName.replace(/intermission\s*/i, "I");
    }

    result.progressDisplay = `${bossHealth}% ${phaseDisplay}`;

    return result;
  }

  /**
   * Fetch guild zone rankings for a specific zone
   * Returns world progress ranking (always uses highest difficulty - Mythic)
   */
  async getGuildZoneRanking(guildName: string, serverSlug: string, serverRegion: string, zoneId: number) {
    const query = `
      query($guildName: String!, $serverSlug: String!, $serverRegion: String!, $zoneId: Int!) {
        rateLimitData {
          limitPerHour
          pointsSpentThisHour
          pointsResetIn
        }
        guildData {
          guild(name: $guildName, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            name
            id
            zoneRanking(zoneId: $zoneId) {
              progress {
                worldRank {
                  number
                  color
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      guildName,
      serverSlug,
      serverRegion,
      zoneId,
    };

    return this.query<any>(query, variables);
  }
}

export default new WarcraftLogsService();
