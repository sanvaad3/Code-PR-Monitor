# BroCode

AI code reviewer for GitHub pull requests. Basically your robot buddy that actually reads your PRs and tells you when you're about to push garbage to production.

## What does this thing do?

So you know how code reviews take forever and sometimes people miss obvious stuff? This automatically reviews your PRs using GPT-4 and actually does a pretty decent job at catching:

- Architecture issues (like when you're mixing concerns or making spaghetti code)
- Security vulnerabilities (SQL injection, XSS, all that fun stuff)
- Code maintainability problems (unclear variable names, missing error handling, etc)

It runs in the background, validates everything to avoid AI hallucinations (yes, that's a real problem), and posts the review as a comment on your PR.

## How it works

```
GitHub PR opened
    ↓
Webhook hits your server
    ↓
Job goes into Redis queue
    ↓
Worker picks it up and analyzes the code
    ↓
AI reviews in 3 categories (parallel)
    ↓
Validates all comments (anti-hallucination)
    ↓
Posts review to GitHub
    ↓
You fix your bugs before prod 🎉
```

## Tech Stack

- **Frontend**: Next.js 14, React, TailwindCSS
- **Backend**: Next.js API routes
- **Database**: PostgreSQL (I'm using Neon but any Postgres works)
- **Queue**: Redis + BullMQ for background jobs
- **AI**: OpenAI GPT-4 (costs like $0.30-0.90 per review)
- **GitHub**: Octokit + GitHub App

## Setup

### Prerequisites

You'll need:
- Node.js 18+
- A Postgres database (Neon has a free tier)
- Redis instance (Upstash free tier works)
- GitHub App credentials
- OpenAI API key (with credits)

### Installation

**1. Clone and install**

```bash
git clone https://github.com/yourusername/bro-code.git
cd bro-code
npm install
```

**2. Environment variables**

Copy `.env.example` to `.env` and fill it out:

```bash
cp .env.example .env
```

You need these:

```env
# Your Postgres database
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require

# Redis for the job queue
REDIS_URL=redis://default:password@host:port

# GitHub App stuff (see below for how to get these)
GITHUB_APP_ID=your_app_id
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
your_private_key_here
-----END RSA PRIVATE KEY-----"

# OpenAI key
OPENAI_API_KEY=sk-proj-your_key_here

# Your app URL (change after deploying)
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

**3. Database setup**

Run the schema file to create all the tables:

```bash
npm run db:push
```

This creates:
- users
- repositories
- pull_requests
- reviews
- review_comments

**4. GitHub App setup**

This part is a bit annoying but necessary:

1. Go to GitHub Settings → Developer settings → GitHub Apps → New GitHub App
2. Fill out the form:
   - **Name**: Whatever you want (BroCode Reviewer or something)
   - **Homepage**: Your app URL
   - **Webhook URL**: `https://your-app.com/api/webhooks/github`
   - **Webhook secret**: Make up a random string and save it to your `.env`
3. Permissions you need:
   - Pull requests: Read & write
   - Contents: Read-only
   - Metadata: Read-only
4. Subscribe to events:
   - Pull request (just this one)
5. Generate a private key (download it and add to `.env`)
6. Copy the App ID to `.env`

Then install the app on your repos.

## Running it

You need to run **two separate processes**:

**Terminal 1 - Web server:**
```bash
npm run dev
```

**Terminal 2 - Background worker:**
```bash
npm run worker
```

The web server handles webhooks and shows the dashboard. The worker actually processes reviews in the background.

Go to `http://localhost:3000` to see the dashboard.

### For production

Build and run:
```bash
npm run build
npm start
```

And run the worker separately (like in a Docker container or another Render/Railway service).

## How the review process works

1. **Someone opens a PR** → GitHub fires a webhook to your app
2. **Webhook handler** validates it's legit and stores PR info in the database
3. **Job gets queued** in Redis (so the webhook responds quickly)
4. **Worker picks up the job** and:
   - Fetches the PR files from GitHub
   - Grabs relevant context files (imports, related code, etc)
   - Sends everything to GPT-4 for review in 3 parallel requests:
     - Architecture review
     - Security review
     - Maintainability review
   - Validates all the AI comments (makes sure line numbers are real, files exist, etc)
   - Stores everything in the database
   - Posts the review to GitHub as a comment
5. **Done!** Check the PR for the review comment

The validation step is important - GPT sometimes hallucinates line numbers or references files that don't exist. This filters that stuff out.

## Project structure

```
app/
├── (dashboard)/
│   └── page.tsx              # Main dashboard
├── api/
│   ├── reviews/route.ts      # API for fetching reviews
│   └── webhooks/github/route.ts  # GitHub webhook handler
├── components/
│   └── Sidebar.tsx
├── reviews/
│   ├── [id]/page.tsx         # Individual review page
│   └── page.tsx              # All reviews list
├── workers/
│   └── review-worker.ts      # The background job processor
└── layout.tsx

lib/
├── ai-reviewer.ts            # GPT-4 review logic
├── db.ts                     # Database helper functions
├── enhanced-pr-context.ts    # Builds context for AI
├── github.ts                 # GitHub API wrapper
├── queue.ts                  # BullMQ setup
├── review-publisher.ts       # Posts reviews to GitHub
└── validator.ts              # Anti-hallucination validation

schema.sql                    # Database schema
```

## Database

Pretty straightforward schema:

- `repositories` - stores repos with GitHub App installations
- `pull_requests` - PR metadata
- `reviews` - each review run with status/results
- `review_comments` - individual findings from the AI

The relationships are:
```
repositories → pull_requests → reviews → review_comments
```

## Features

### Dashboard
Visit `/` to see:
- Total reviews run
- Success rate
- Average review time and cost
- Issues found by severity
- Recent reviews

### Review details
Each review at `/reviews/:id` shows:
- The full AI analysis
- All comments organized by category
- Token usage and cost
- Processing time

### The actual reviews

The AI checks three things:

**Architecture** - Is the code well organized?
- Design patterns
- Separation of concerns
- Code coupling
- That kind of thing

**Security** - Are there vulnerabilities?
- SQL injection
- XSS
- Exposed secrets
- Input validation issues

**Maintainability** - Can someone else read this?
- Variable naming
- Code complexity
- Missing error handling
- Documentation

## Troubleshooting

**Webhooks not working?**
- Double check the webhook URL in your GitHub App settings
- Make sure the webhook secret matches your `.env`
- Check the GitHub App is actually installed on the repo

**Worker not processing anything?**
- Is Redis running?
- Did you actually start the worker? (`npm run worker`)
- Check the logs for errors

**Reviews failing?**
- Check your OpenAI API key is valid and has credits
- Look at the worker logs for specific errors
- Make sure the database is accessible

**Status stuck on "pending" after PR merged?**
- Just fixed this actually! The webhook now updates both tables
- If you have old data stuck, you'll need to manually update it

## Testing

There's a test file with intentional bugs in `examples/test-pr-code.js`.

To test:
```bash
cp examples/test-pr-code.js src/test.js
git checkout -b test-review
git add src/test.js
git commit -m "test AI review"
git push origin test-review
```

Open a PR and watch the magic happen (takes 1-2 minutes usually).

The test file has:
- SQL injection vulnerability
- O(n²) performance issue
- Terrible variable names
- Null reference bug
- Mixed concerns (does DB, email, and logging in one function)

The AI should catch most of these.

## Costs

Real talk - using GPT-4 isn't free:
- Each review uses 10k-30k tokens on average
- That's roughly $0.30-$0.90 per review
- If you do 100 PRs/month, expect ~$30-90

Ways to save money:
- Use GPT-3.5-turbo instead (way cheaper, still pretty good)
- Limit the context files included
- Only review files that changed (not the whole codebase)

## Deployment

I'm using:
- **Vercel** for the Next.js app (free tier works)
- **Neon** for Postgres (free tier)
- **Upstash** for Redis (free tier)
- **Railway** for the worker (free trial, then ~$5/month)

But you can use whatever. Just make sure the worker runs separately from the web app.

Steps:
1. Deploy the Next.js app
2. Set all the env vars
3. Run the database migration
4. Deploy the worker as a separate service
5. Update your GitHub App webhook URL
6. Test with a real PR

## TODO / Future ideas

- [ ] Support more languages (currently works best with JS/TS)
- [ ] Custom rules per repo
- [ ] Slack/Discord notifications
- [ ] Better analytics and trends
- [ ] AI-suggested fixes (not just comments)
- [ ] Support multiple AI models
- [ ] Team features

## Contributing

PRs welcome! Just:
1. Fork it
2. Make your changes
3. Open a PR
4. Hope the AI reviewer likes your code 😅

## Issues?

Open an issue on GitHub or check if someone already reported it.

## Built with

Next.js, OpenAI GPT-4, GitHub Octokit, BullMQ, PostgreSQL, Redis, TailwindCSS

## License

MIT - do whatever you want with it

---

**Note**: The AI is pretty good but not perfect. Sometimes it misses stuff, sometimes it's overly picky. Use your brain too.
