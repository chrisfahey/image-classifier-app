# Image Classifier App

An app that uploads a ZIP file with up to 100 images, classifies each image using OpenAI's vision API, and displays them with filtering options.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env.local` file with your OpenAI API key:
```
OPENAI_API_KEY=your_openai_api_key_here
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Upload a ZIP file containing up to 100 images
2. The app will extract the images and classify each one using OpenAI
3. View all images, or filter to show only "good" or "bad" images
