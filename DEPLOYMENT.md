# Deployment Guide

This app can be deployed to various platforms. Here are the recommended options:

## Option 1: Vercel (Easiest, but with limitations)

**Pros:**
- Made by Next.js creators, easiest deployment
- Free tier available
- Automatic deployments from Git

**Cons:**
- Serverless functions have ephemeral storage
- File uploads won't persist between requests
- Need to modify to use external storage (S3, etc.)

**Steps:**
1. Push code to GitHub
2. Go to https://vercel.com
3. Import your repository
4. Add environment variable: `OPENAI_API_KEY`
5. Deploy

**Note:** You'll need to modify the app to use cloud storage (S3, Cloudinary, etc.) instead of local file system.

## Option 2: Railway (Recommended for file uploads)

**Pros:**
- Supports persistent file storage
- Easy deployment
- Free tier available
- Works with current code structure

**Steps:**
1. Push code to GitHub
2. Go to https://railway.app
3. Create new project from GitHub repo
4. Add environment variable: `OPENAI_API_KEY`
5. Deploy

## Option 3: Render

**Pros:**
- Supports persistent storage
- Free tier available
- Easy setup

**Steps:**
1. Push code to GitHub
2. Go to https://render.com
3. Create new Web Service
4. Connect GitHub repo
5. Add environment variable: `OPENAI_API_KEY`
6. Deploy

## Option 4: Fly.io

**Pros:**
- Supports persistent volumes
- Good for file storage
- Global deployment

**Steps:**
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Run `fly launch` in project directory
3. Add environment variable: `fly secrets set OPENAI_API_KEY=your_key`
4. Deploy: `fly deploy`

## Environment Variables

All platforms require:
- `OPENAI_API_KEY` - Your OpenAI API key

## Important Notes

1. **File Storage**: The current app stores files locally. For production, consider:
   - Using cloud storage (AWS S3, Cloudinary, etc.)
   - Or use a platform that supports persistent storage (Railway, Render, Fly.io)

2. **File Size Limits**: Check platform limits for file uploads

3. **Rate Limiting**: Consider adding rate limiting for production use

4. **Security**: Make sure `.env.local` is in `.gitignore` (it already is)
