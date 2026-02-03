# Quick Deployment Guide - Railway (Recommended)

Railway is the easiest option that supports file uploads without code changes.

## Step 1: Push to GitHub

```bash
cd /Users/chrisfahey/image-classifier-app

# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/image-classifier-app.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy on Railway

1. Go to https://railway.app
2. Sign up/login (can use GitHub)
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your repository
6. Railway will auto-detect Next.js and start deploying

## Step 3: Add Environment Variable

1. In Railway dashboard, go to your project
2. Click on your service
3. Go to "Variables" tab
4. Add: `OPENAI_API_KEY` = `your_openai_api_key_here`
5. Railway will automatically redeploy

## Step 4: Get Your URL

Railway will provide a URL like: `https://your-app-name.up.railway.app`

That's it! Your app is live.

## Alternative: Render (Similar process)

1. Go to https://render.com
2. Sign up/login
3. New → Web Service
4. Connect GitHub repo
5. Add environment variable: `OPENAI_API_KEY`
6. Deploy
