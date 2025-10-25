# WoW Guild Progress Tracker

A full-stack web application for tracking World of Warcraft raid progression of multiple guilds. Monitor mythic and heroic raid progress, boss kills, pull attempts, and real-time raiding activity across different raid tiers.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=flat&logo=express&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat&logo=mongodb&logoColor=white)

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
  - [Non-Docker Development](#non-docker-development)
  - [Docker Development](#docker-development)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [License](#-license)

## ✨ Features

### Core Functionality

- **Multi-Guild Tracking**: Monitor multiple World of Warcraft raiding guilds simultaneously
- **Real-Time Updates**: Automatic background updates with different intervals for active raiders
- **Raid Tier Selection**: Dropdown selector to switch between different raid tiers (current and historical)
- **Detailed Progress Metrics**:
  - Mythic and Heroic boss kills
  - Pull count for current progression boss
  - Best pull percentage/phase reached
  - Total time spent per raid difficulty
  - First kill timestamps and ordering
- **Live Events Feed**: Real-time feed showing:
  - Boss kills (with kill ranking)
  - Best pull improvements
  - Milestone achievements
- **Rich Visualizations**:
  - Boss icons from Blizzard Game Data API
  - Guild faction (Alliance/Horde) badges
  - Raid tier icons
  - Color-coded difficulty indicators

### Technical Features

- **Intelligent Data Fetching**: Uses WarcraftLogs GraphQL API to fetch detailed combat logs
- **Smart Caching**: Boss and raid icons cached locally to reduce API calls
- **Rate Limit Handling**: Automatic rate limiting with exponential backoff for all external APIs
- **Background Scheduler**:
  - Updates normal guilds every 5 minutes
  - Updates actively raiding guilds every 1 minute
- **Multi-Phase Boss Support**: Tracks phase-specific progress for complex encounters
- **Historical Data**: Maintains reports and fights in database for detailed analysis

## 🛠 Tech Stack

### Backend

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **External APIs**:
  - WarcraftLogs API (GraphQL) - Combat log data
  - Blizzard Battle.net API - Boss/raid icons and achievements
  - Raider.IO API - Raid tier start/end dates
- **Scheduling**: node-cron for background updates
- **Development**: nodemon with ts-node for hot reloading

### Frontend

- **Framework**: Next.js 15 (App Router with React 19)
- **Styling**: Tailwind CSS 4
- **TypeScript**: Full type safety across the application
- **Build Tool**: Turbopack for faster builds
- **UI Components**: Custom components with responsive design

## 🏗 Architecture

### Data Flow

```
┌─────────────────┐
│   Frontend      │
│   (Next.js)     │
│   Port 3000     │
└────────┬────────┘
         │ HTTP/REST
         ▼
┌─────────────────┐
│   Backend       │
│   (Express)     │
│   Port 3001     │
└────────┬────────┘
         │
    ┌────┴─────────────┬───────────────┬────────────────┐
    ▼                  ▼               ▼                ▼
┌─────────┐    ┌──────────────┐  ┌─────────┐   ┌──────────┐
│ MongoDB │    │ WarcraftLogs │  │ Blizzard│   │ Raider.IO│
│  Local  │    │     API      │  │   API   │   │   API    │
└─────────┘    └──────────────┘  └─────────┘   └──────────┘
```

### Backend Architecture

The backend follows a service-oriented architecture:

1. **Services Layer**:

   - `guild.service.ts`: Core guild management and progress calculation
   - `warcraftlogs.service.ts`: WarcraftLogs API client with rate limiting
   - `blizzard.service.ts`: Blizzard API client for icons and achievements
   - `raiderio.service.ts`: Raider.IO API client for raid dates
   - `scheduler.service.ts`: Background update orchestration
   - `icon-cache.service.ts`: Local icon caching system

2. **Models Layer** (MongoDB/Mongoose):

   - `Guild`: Guild information and raid progress
   - `Event`: Timeline events (kills, best pulls, milestones)
   - `Raid`: Raid tier information with bosses and icons
   - `Report`: WarcraftLogs report metadata
   - `Fight`: Individual boss fight attempts
   - `Achievement`: Blizzard achievement database

3. **Routes Layer**:
   - `/api/guilds`: Guild CRUD operations
   - `/api/events`: Event feed queries
   - `/api/raids`: Raid tier information

### Data Update Process

1. **Initialization** (Server Start):

   - Connect to MongoDB
   - Fetch/cache raid data from WarcraftLogs
   - Fetch/cache boss icons from Blizzard
   - Initialize configured guilds
   - Start background scheduler

2. **Background Updates**:

   - Fetch latest reports from WarcraftLogs for each guild
   - Process fight data to calculate boss progress
   - Update best pulls, kill counts, phase progress
   - Generate events for kills and improvements
   - Mark actively raiding guilds for faster updates

3. **Real-Time Updates**:
   - Frontend polls backend every 30 seconds
   - Background scheduler updates data based on raiding status
   - Rate limiting ensures API quotas are respected

## 📦 Prerequisites

### For Non-Docker Development

- **Node.js**: v20.x or higher (v24 recommended)
- **MongoDB**: v7.0 or higher
- **npm**: v10.x or higher

### For Docker Development

- **Docker**: v20.x or higher
- **Docker Compose**: v2.x or higher

### API Keys Required

You'll need to obtain API credentials from the following services:

1. **WarcraftLogs**:

   - Create an account at [warcraftlogs.com](https://www.warcraftlogs.com)
   - Navigate to API Clients: https://www.warcraftlogs.com/api/clients/
   - Create a new client (any name, set public client)
   - Copy Client ID and Client Secret

2. **Blizzard Battle.net**:

   - Create an account at [develop.battle.net](https://develop.battle.net)
   - Create a new client application
   - Copy Client ID and Client Secret

3. **Raider.IO** (Optional but recommended):
   - Visit [raider.io](https://raider.io/api)
   - Request an API key for raid tier dates
   - If not provided, dates will not be fetched

## 🚀 Installation

### Non-Docker Development

#### 1. Clone the Repository

```powershell
git clone https://github.com/Koodattu/wow-guild-progress-tracker.git
cd wow-guild-progress-tracker
```

#### 2. Set Up MongoDB

**Option A: Install MongoDB locally**

- Download MongoDB Community Server from [mongodb.com](https://www.mongodb.com/try/download/community)
- Install and start MongoDB service
- MongoDB will run on default port 27017

**Option B: Use MongoDB Cloud (Atlas)**

- Create a free cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
- Get your connection string
- Use this connection string in backend `.env`

#### 3. Configure Backend

```powershell
cd backend
cp .env.example .env
```

Edit `backend\.env` with your configuration:

```env
PORT=3001
MONGODB_URI=mongodb://localhost:27017/wow_guild_tracker

# WarcraftLogs API Credentials
WCL_CLIENT_ID=your_wcl_client_id_here
WCL_CLIENT_SECRET=your_wcl_client_secret_here
WCL_API_BASE=https://www.warcraftlogs.com

# Blizzard Battle.net API Credentials
BLIZZARD_CLIENT_ID=your_blizzard_client_id_here
BLIZZARD_CLIENT_SECRET=your_blizzard_client_secret_here

# Raider.IO API Key (optional)
RAIDER_IO_API_KEY=your_raider_io_api_key_here
```

#### 4. Configure Guilds to Track

Edit `backend\src\config\guilds.ts`:

```typescript
export const GUILDS: TrackedGuild[] = [
  { name: "Guild Name", realm: "Server-Name", region: "EU" },
  { name: "Another Guild", realm: "Another-Server", region: "US" },
  // Add more guilds here
];
```

**Important Notes**:

- Realm names with spaces use hyphens (e.g., "Tarren Mill" → "Tarren-Mill")
- Region must be "EU", "US", "KR", "TW", or "CN"
- Guild names are case-sensitive

#### 5. Install Backend Dependencies

```powershell
# Still in backend directory
npm install
```

#### 6. Start Backend Development Server

```powershell
npm run dev
```

The backend will start on `http://localhost:3001`. You should see:

- "MongoDB connected successfully"
- "Syncing raid data from WarcraftLogs..."
- "Starting background update scheduler..."
- "Server running on port 3001"

#### 7. Configure Frontend

Open a new terminal:

```powershell
cd frontend
```

Create `.env.local` (optional, uses defaults if not created):

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

#### 8. Install Frontend Dependencies

```powershell
# In frontend directory
npm install
```

#### 9. Start Frontend Development Server

```powershell
npm run dev
```

The frontend will start on `http://localhost:3000`.

#### 10. Access the Application

Open your browser and navigate to:

```
http://localhost:3000
```

You should see the guild progress tracker with your configured guilds!

---

### Docker Development

Docker Compose will set up everything (MongoDB, backend, frontend) with a single command.

#### 1. Clone the Repository

```powershell
git clone https://github.com/Koodattu/wow-guild-progress-tracker.git
cd wow-guild-progress-tracker
```

#### 2. Configure Backend

```powershell
cd backend
cp .env.example .env
```

Edit `backend\.env` with your API credentials (see Non-Docker step 3 above).

**Important**: Keep `MONGODB_URI` as shown below for Docker networking:

```env
MONGODB_URI=mongodb://mongodb:27017/wow_guild_tracker
```

#### 3. Configure Guilds

Edit `backend\src\config\guilds.ts` to add your guilds (see Non-Docker step 4 above).

#### 4. Return to Root Directory

```powershell
cd ..
```

#### 5. Build and Start All Services

```powershell
docker-compose up --build
```

This will:

- Build the backend Docker image
- Build the frontend Docker image
- Pull MongoDB 7.0 image
- Start all three services
- Create a persistent volume for MongoDB data

#### 6. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **MongoDB**: localhost:27017

#### 7. View Logs

```powershell
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mongodb
```

#### 8. Stop Services

```powershell
# Stop and remove containers
docker-compose down

# Stop, remove containers, and delete volumes (WARNING: deletes database)
docker-compose down -v
```

#### 9. Restart Services

```powershell
# Restart without rebuilding
docker-compose up

# Restart with rebuild
docker-compose up --build
```

## ⚙ Configuration

### Backend Configuration

#### Environment Variables (`backend/.env`)

| Variable                 | Required | Description                           |
| ------------------------ | -------- | ------------------------------------- |
| `PORT`                   | No       | Backend server port (default: 3001)   |
| `MONGODB_URI`            | Yes      | MongoDB connection string             |
| `WCL_CLIENT_ID`          | Yes      | WarcraftLogs API client ID            |
| `WCL_CLIENT_SECRET`      | Yes      | WarcraftLogs API client secret        |
| `BLIZZARD_CLIENT_ID`     | Yes      | Blizzard Battle.net API client ID     |
| `BLIZZARD_CLIENT_SECRET` | Yes      | Blizzard Battle.net API client secret |
| `RAIDER_IO_API_KEY`      | No       | Raider.IO API key for raid dates      |

#### Tracked Guilds (`backend/src/config/guilds.ts`)

```typescript
export interface TrackedGuild {
  name: string; // Guild name (case-sensitive)
  realm: string; // Server name (use hyphens for spaces)
  region: string; // "EU", "US", "KR", "TW", or "CN"
}

export const GUILDS: TrackedGuild[] = [{ name: "Example Guild", realm: "Silvermoon", region: "EU" }];
```

#### Tracked Raids (`backend/src/config/guilds.ts`)

The `TRACKED_RAIDS` array contains WarcraftLogs zone IDs for raids to track:

```typescript
export const TRACKED_RAIDS = [
  44, // Manaforge Omega
  42, // Liberation of Undermine
  38, // Nerubar Palace
  // ... more raids
];
```

The first raid in the array is considered the "current" tier and is shown by default.

### Frontend Configuration

#### Environment Variables (`frontend/.env.local`)

| Variable              | Required | Description                                      |
| --------------------- | -------- | ------------------------------------------------ |
| `NEXT_PUBLIC_API_URL` | No       | Backend API URL (default: http://localhost:3001) |

## 📖 Usage

### Main Interface

1. **Guild Table**: Shows all tracked guilds sorted by Mythic progress

   - Click any guild row to see detailed progress
   - Columns: Rank, Guild Name, Realm, Mythic Progress, Heroic Progress, Pull Count, Best Pull %, Time Spent

2. **Raid Selector**: Dropdown in the header to switch between raid tiers

   - Shows current and historical raids
   - Auto-selects the most recent raid on load

3. **Events Feed**: Right sidebar showing recent activity

   - Boss kills with kill rank
   - Best pull improvements
   - Milestone achievements

4. **Guild Detail Modal**: Click a guild to see:
   - Detailed boss-by-boss breakdown
   - Kill timestamps
   - Phase progression
   - Pull counts per boss

### Automatic Updates

- Frontend refreshes data every 30 seconds
- Backend updates guilds automatically:
  - Normal guilds: Every 5 minutes
  - Actively raiding guilds: Every 1 minute
- Icon cache persists between restarts

## 📚 API Documentation

### Base URL

```
http://localhost:3001/api
```

### Endpoints

#### Guilds

**GET** `/guilds`

- Returns all tracked guilds with progress data
- Response: `Guild[]`

**GET** `/guilds/:id`

- Returns a specific guild by ID
- Response: `Guild`

#### Events

**GET** `/events?limit=50`

- Returns recent events (kills, best pulls, milestones)
- Query params:
  - `limit` (optional): Number of events to return (default: 50)
- Response: `Event[]`

**GET** `/events/guild/:guildId?limit=50`

- Returns events for a specific guild
- Response: `Event[]`

#### Raids

**GET** `/raids`

- Returns all raid tiers with boss information
- Response: `Raid[]`

**GET** `/raids/:id`

- Returns a specific raid tier by ID
- Response: `Raid`

#### Health Check

**GET** `/health`

- Returns server health status
- Response: `{ status: "ok", timestamp: Date }`

### Response Types

```typescript
interface Guild {
  _id: string;
  name: string;
  realm: string;
  region: string;
  faction?: string;
  iconUrl?: string;
  progress: RaidProgress[];
  isCurrentlyRaiding: boolean;
  lastFetched?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface RaidProgress {
  raidId: number;
  raidName: string;
  difficulty: "mythic" | "heroic";
  bossesDefeated: number;
  totalBosses: number;
  totalTimeSpent: number;
  bosses: BossProgress[];
  lastUpdated: Date;
}

interface BossProgress {
  bossId: number;
  bossName: string;
  kills: number;
  bestPercent: number;
  pullCount: number;
  timeSpent: number;
  firstKillTime?: Date;
  killOrder?: number;
  bestPullPhase?: {
    phaseId: number;
    phaseName: string;
    displayString: string;
  };
}

interface Event {
  type: "boss_kill" | "best_pull" | "milestone";
  guildName: string;
  raidName: string;
  bossName: string;
  difficulty: "mythic" | "heroic";
  data: {
    killRank?: number;
    pullCount?: number;
    bestPercent?: number;
    progressDisplay?: string;
  };
  timestamp: Date;
}

interface Raid {
  id: number;
  name: string;
  slug: string;
  expansion: string;
  iconUrl?: string;
  bosses: Array<{
    id: number;
    name: string;
    slug: string;
    iconUrl?: string;
  }>;
  starts?: {
    us?: Date;
    eu?: Date;
    tw?: Date;
    kr?: Date;
    cn?: Date;
  };
  ends?: {
    us?: Date;
    eu?: Date;
    tw?: Date;
    kr?: Date;
    cn?: Date;
  };
}
```

## 📁 Project Structure

```
wow-guild-progress-tracker/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.ts          # MongoDB connection
│   │   │   └── guilds.ts            # Guild and raid configuration
│   │   ├── models/
│   │   │   ├── Achievement.ts       # Blizzard achievements
│   │   │   ├── Event.ts             # Timeline events
│   │   │   ├── Fight.ts             # Individual fight attempts
│   │   │   ├── Guild.ts             # Guild and progress data
│   │   │   ├── Raid.ts              # Raid tier information
│   │   │   └── Report.ts            # WarcraftLogs reports
│   │   ├── routes/
│   │   │   ├── events.ts            # Event API routes
│   │   │   ├── guilds.ts            # Guild API routes
│   │   │   └── raids.ts             # Raid API routes
│   │   ├── services/
│   │   │   ├── blizzard.service.ts  # Blizzard API client
│   │   │   ├── guild.service.ts     # Guild management logic
│   │   │   ├── icon-cache.service.ts# Icon caching system
│   │   │   ├── raiderio.service.ts  # Raider.IO API client
│   │   │   ├── scheduler.service.ts # Background updates
│   │   │   └── warcraftlogs.service.ts # WarcraftLogs API client
│   │   └── index.ts                 # Express app entry point
│   ├── public/
│   │   └── icons/                   # Cached boss/raid icons
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css          # Global styles
│   │   │   ├── layout.tsx           # Root layout
│   │   │   └── page.tsx             # Main page
│   │   ├── components/
│   │   │   ├── EventsFeed.tsx       # Events timeline
│   │   │   ├── GuildDetail.tsx      # Guild detail modal
│   │   │   ├── GuildTable.tsx       # Guild list table
│   │   │   └── RaidSelector.tsx     # Raid tier dropdown
│   │   ├── lib/
│   │   │   ├── api.ts               # API client functions
│   │   │   └── utils.ts             # Utility functions
│   │   └── types/
│   │       └── index.ts             # TypeScript types
│   ├── public/                      # Static assets
│   ├── Dockerfile
│   ├── next.config.ts
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── docker-compose.yml               # Docker Compose configuration
└── README.md
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
