# Money App

A Next.js 14+ Progressive Web App (PWA) for managing finances.

## Tech Stack

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **PWA**: next-pwa for offline support and installability
- **Charts**: ApexCharts & react-apexcharts for data visualization
- **Database**: Vercel Postgres
- **WebSocket**: ws for real-time communication

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- npm, yarn, or pnpm

### Installation

1. Install dependencies:

```bash
npm install
```

2. Run the development server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## PWA Features

- **Offline Support**: Service worker caches assets for offline access
- **Installable**: Can be installed as a standalone app on desktop and mobile
- **Background Sync**: Cached API responses with network-first strategy

## Project Structure

```
├── src/
│   ├── app/           # App Router pages and layouts
│   │   ├── api/       # API routes
│   │   ├── layout.tsx # Root layout with PWA meta tags
│   │   ├── page.tsx   # Home page
│   │   └── globals.css
│   └── components/    # React components
├── public/
│   ├── manifest.json  # PWA manifest
│   └── icons/         # App icons
├── next.config.js     # Next.js + PWA configuration
├── tailwind.config.js # Tailwind CSS configuration
└── tsconfig.json      # TypeScript configuration
```

## PWA Icon Generation

The manifest.json references icons at various sizes. You need to generate PNG icons from the SVG in `public/icons/icon.svg`:

- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

You can use tools like [Real Favicon Generator](https://realfavicongenerator.net/) or generate them programmatically.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Environment Variables

Create a `.env.local` file for local development:

```env
# Vercel Postgres
POSTGRES_URL=
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=
POSTGRES_USER=
POSTGRES_HOST=
POSTGRES_PASSWORD=
POSTGRES_DATABASE=

# WebSocket
WS_URL=
```

See `.env.example` for all available environment variables.

## Deployment

### Vercel Deployment (Recommended)

1. **Install Vercel CLI** (optional):

   ```bash
   npm i -g vercel
   ```

2. **Connect to Vercel**:

   - Go to [vercel.com](https://vercel.com) and import your repository
   - Or use CLI: `vercel link`

3. **Set up Vercel Postgres**:

   - In Vercel Dashboard, go to Storage > Create Database > Postgres
   - Connect the database to your project
   - Environment variables will be automatically added

4. **Configure Environment Variables**:

   In Vercel Dashboard > Settings > Environment Variables, add:

   | Variable | Description |
   |----------|-------------|
   | `NEXTAUTH_SECRET` | Auth secret (generate with `openssl rand -base64 32`) |
   | `NEXTAUTH_URL` | Your deployed URL (e.g., `https://your-app.vercel.app`) |
   | `AWS_VM_URL` | Your AWS VM endpoint |
   | `AWS_VM_WS_URL` | WebSocket URL for AWS VM |
   | `INTERNAL_API_KEY` | API key for internal communication |
   | `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins |
   | `ADMIN_USERNAME` | Admin login username |
   | `ADMIN_PASSWORD` | Admin login password |

5. **Deploy**:

   ```bash
   # Production deployment
   vercel --prod

   # Preview deployment
   vercel
   ```

### AWS VM Integration

The app connects to an AWS VM for trading model execution. Configure the connection:

1. **Set AWS VM Environment Variables**:

   ```env
   AWS_VM_URL=http://your-ec2-ip:8000
   AWS_VM_WS_URL=ws://your-ec2-ip:8000/ws
   AWS_VM_ORIGIN=http://your-ec2-ip:8000
   ```

2. **Configure CORS on AWS VM**:

   Allow requests from your Vercel deployment:

   ```python
   # FastAPI example
   from fastapi.middleware.cors import CORSMiddleware

   app.add_middleware(
       CORSMiddleware,
       allow_origins=["https://your-app.vercel.app"],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

3. **API Key Authentication**:

   The AWS VM should send requests with the `INTERNAL_API_KEY`:

   ```bash
   curl -X POST https://your-app.vercel.app/api/ws \
     -H "Content-Type: application/json" \
     -H "x-api-key: your-internal-api-key" \
     -d '{"message": {"type": "update", "data": {...}}}'
   ```

### Health Checks

The app exposes a health check endpoint:

- **URL**: `/api/health` or `/health`
- **Methods**: GET, HEAD
- **Response**:

  ```json
  {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "version": "0.1.0",
    "uptime": 3600,
    "checks": {
      "database": { "status": "pass", "message": "pass" },
      "environment": { "status": "pass", "message": "pass" }
    }
  }
  ```

For detailed health info, add `?detailed=true` with API key:

```bash
curl "https://your-app.vercel.app/api/health?detailed=true" \
  -H "x-api-key: your-internal-api-key"
```

### Database Migrations

After deploying, run database migrations:

```bash
# Connect to your Vercel Postgres and run migrations
# See db/migrations/README.md for details
```

## License

MIT
