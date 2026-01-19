import TrackedCharacter from "../models/TrackedCharacter";

async function getEligibleTrackedCharacters(): Promise<void> {
  const eligibleChars = await TrackedCharacter.find({
    lastMythicSeenAt: { $gte: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) },
    rankingsAvailable: { $ne: "false" },
    nextEligibleRefreshAt: { $lte: new Date() },
  }).limit(200);
}
