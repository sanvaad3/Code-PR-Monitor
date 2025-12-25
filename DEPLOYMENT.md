# Deployment Guide

This guide will help you deploy the AI PR Review app so anyone can use it.

## Architecture

The app consists of two main components:
1. **Next.js Web App** - Handles webhooks, serves UI (deployed on Vercel)
2. **Background Worker** - Processes AI reviews (deployed on Railway)

## Prerequisites

- GitHub account
- Vercel account (free)
- Railway account (free tier available)
- Neon PostgreSQL database (already configured)
- Upstash Redis (already configured)
- OpenAI API key

## Step 1: Deploy to Vercel

### 1.1 Push to GitHub

```bash
# Initialize git repo if not already done
git init
git add .
git commit -m "Initial commit"

# Create a new GitHub repo and push
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

### 1.2 Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Import Project"
3. Import your GitHub repository
4. Configure environment variables (copy from `.env`):
   - `DATABASE_URL`
   - `REDIS_URL`
   - `GITHUB_APP_ID`
   - `GITHUB_WEBHOOK_SECRET`
   - `GITHUB_APP_PRIVATE_KEY`
   - `OPENAI_API_KEY`
   - `NEXT_PUBLIC_APP_URL` (use your Vercel URL, e.g., `https://your-app.vercel.app`)
5. Click "Deploy"

### 1.3 Update Environment Variable

After deployment, update `NEXT_PUBLIC_APP_URL` in Vercel dashboard with your actual deployment URL.

## Step 2: Deploy Worker to Railway

### 2.1 Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository

### 2.2 Configure Worker Service

1. Add the same environment variables as Vercel
2. Set the **Start Command**: `npm run worker`
3. Set the **Build Command**: `npm install`

## Step 3: Update GitHub Webhook

1. Go to your GitHub App settings
2. Update the **Webhook URL** to: `https://your-app.vercel.app/api/webhooks/github`
3. Ensure webhook secret matches your `GITHUB_WEBHOOK_SECRET`

## Step 4: Initialize Database

Run the database migrations:

```bash
npm run db:push
```

Or manually run `schema.sql` in your Neon console.

## Step 5: Test the Deployment

1. Create a new PR in any repository where your GitHub App is installed
2. Check your Vercel deployment logs
3. Check Railway worker logs
4. Visit `https://your-app.vercel.app/dashboard` to see the review

## Making It Public

### Allow Anyone to Install Your GitHub App

1. Go to GitHub App settings
2. Under "Public page", make the app public
3. Share the installation URL: `https://github.com/apps/YOUR_APP_NAME/installations/new`

### Share Your App

Users can now:
1. Install your GitHub App on their repositories
2. Open PRs and get automatic AI reviews
3. View reviews at `https://your-app.vercel.app/dashboard`

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `REDIS_URL` | Redis connection string | `redis://...` |
| `GITHUB_APP_ID` | GitHub App ID | `123456` |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret | `your_secret` |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key | `-----BEGIN...` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` |
| `NEXT_PUBLIC_APP_URL` | Public app URL | `https://your-app.vercel.app` |

## Monitoring

- **Vercel Logs**: Monitor webhook requests and API calls
- **Railway Logs**: Monitor worker processing and AI reviews
- **Database**: Check review status and metrics

## Cost Estimate

- Vercel: Free tier (sufficient for moderate usage)
- Railway: ~$5/month for worker (or free tier with limits)
- Neon: Free tier (sufficient for moderate usage)
- Redis: Starting at $0/month
- OpenAI: ~$0.03 per review (varies by PR size)

## Troubleshooting

### Webhook Timeout
- Check Railway worker is running
- Ensure Redis connection is working
- Review Vercel function logs

### Reviews Not Posting
- Check OpenAI API key is valid
- Check GitHub App permissions
- Review Railway worker logs

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check Neon database is running
- Ensure SSL mode is enabled
