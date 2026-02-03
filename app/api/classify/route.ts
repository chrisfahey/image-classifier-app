import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import fs from 'fs-extra'
import path from 'path'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

// Caption prompt: Generate a multi-line caption and classify background
const CLASSIFICATION_PROMPT = `Examine this image and create a description, then classify the background.

Requirements:
- First, describe the foreground/main subject (under 7 words)
- Second, describe the background (under 7 words)
- Third, classify the background type:
  * "good" if the background has one of the following qualities: 
  The image clearly a very professional photograph, taken in a studio or a professionally decorated set 
  OR The item is fully visible, and is in front of a nice gradient backdrop (again, not all white though!).  
  * "bad" if the background is just white pixels (a white room with white walls and floor is OK), 
  OR if the item image is cut off in any way, and is not showing the entire item 
  OR if the item is shot at a wierd rotation
  OR if the item is shown from a non-standard angle, such as from the side or the back
  OR if the item background is unprofessional looking
  OR if the item background contains a lawn, or a person, or just junk
  OR if the item background looks like a collage, or unrealistic
  OR if the photo is a densely decorated room with more than eight items in it 
  OR if there are multiple items in the image, and it's not clear which one is the main subject (unless the multiple items are very similar and likely part of a set)

  * "unknown" if you cannot clearly distinguish the background type
  If any of the BAD conditions are met, ignore the GOOD conditions and classify the background as "bad"
- Fourth, summarize  why you chose the background classification. If the item is GOOD, describe why in under 7 wordsIf there are multiple BAD violations, list them all, each under 7 words.

Respond with JSON in this exact format:
{
  "foreground": "description of foreground in under 7 words",
  "background": "description of background in under 7 words",
  "classification": "good" or "bad" or "unknown",
  "rationale": "description of rationale"
}`

async function getImageBase64(imageUrl: string): Promise<string> {
  // Extract the path from the URL
  const urlPath = imageUrl.replace('/api/images/', '')
  // Decode URL-encoded characters
  const decodedPath = decodeURIComponent(urlPath)
  const filePath = path.join(UPLOAD_DIR, decodedPath)

  console.log('🔍 Looking for image file:')
  console.log('  - URL:', imageUrl)
  console.log('  - URL path:', urlPath)
  console.log('  - Decoded path:', decodedPath)
  console.log('  - Full file path:', filePath)
  console.log('  - File exists:', fs.existsSync(filePath))

  if (!fs.existsSync(filePath)) {
    console.error('❌ File not found at path:', filePath)
    throw new Error(`Image file not found: ${filePath}`)
  }

  const imageBuffer = await fs.readFile(filePath)
  const base64 = imageBuffer.toString('base64')
  
  // Determine MIME type from extension
  const ext = path.extname(filePath).toLowerCase()
  let mimeType = 'image/jpeg'
  if (ext === '.png') mimeType = 'image/png'
  else if (ext === '.gif') mimeType = 'image/gif'
  else if (ext === '.webp') mimeType = 'image/webp'
  else if (ext === '.bmp') mimeType = 'image/bmp'

  return `data:${mimeType};base64,${base64}`
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Classification request received')
    
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OpenAI API key not configured')
      return NextResponse.json(
        { 
          error: 'OpenAI API key not configured',
          foreground: 'Error',
          background: 'API key not configured',
          classification: 'unknown' as const,
          rationale: 'API key not configured',
          caption: 'Error\nAPI key not configured'
        },
        { status: 500 }
      )
    }

    let requestBody
    try {
      requestBody = await request.json()
    } catch (parseError) {
      console.error('❌ Error parsing request JSON:', parseError)
      return NextResponse.json(
        { 
          error: 'Invalid request format',
          foreground: 'Error',
          background: 'Invalid request',
          classification: 'unknown' as const,
          rationale: 'Invalid request format',
          caption: 'Error\nInvalid request'
        },
        { status: 400 }
      )
    }

    const { imageUrl } = requestBody
    console.log('📷 Image URL:', imageUrl)

    if (!imageUrl) {
      return NextResponse.json({ error: 'Image URL required' }, { status: 400 })
    }

    // Get image as base64
    console.log('🔄 Converting image to base64...')
    let base64Image: string
    try {
      base64Image = await getImageBase64(imageUrl)
      console.log('✅ Image converted to base64, length:', base64Image.length)
    } catch (error) {
      console.error('❌ Error converting image to base64:', error)
      throw error
    }

    // Call OpenAI Vision API
    console.log('🤖 Calling OpenAI API...')
    let response
    try {
      response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: CLASSIFICATION_PROMPT,
              },
              {
                type: 'image_url',
                image_url: {
                  url: base64Image,
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      })
      console.log('✅ OpenAI API response received')
    } catch (error: any) {
      console.error('❌ OpenAI API error:', error)
      if (error instanceof Error) {
        console.error('Error message:', error.message)
        console.error('Error stack:', error.stack)
      }
      
      // Handle specific OpenAI API errors
      if (error?.status === 429) {
        const quotaError = 'OpenAI API quota exceeded. Please check your account or upgrade your plan.'
        console.error('❌ QUOTA EXCEEDED:', quotaError)
        throw new Error(quotaError)
      }
      
      if (error?.status === 401) {
        const authError = 'OpenAI API key is invalid or expired.'
        console.error('❌ AUTH ERROR:', authError)
        throw new Error(authError)
      }
      
      throw error
    }

    const content = response.choices[0]?.message?.content || ''
    console.log('📝 OpenAI response:', content)
    
    // Try to parse JSON from the response
    let foreground = 'Unable to describe'
    let background = 'Unable to describe'
    let classification: 'good' | 'bad' | 'unknown' = 'unknown'
    let rationale = 'No rationale provided'

    try {
      // Extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        foreground = parsed.foreground || 'Unable to describe'
        background = parsed.background || 'Unable to describe'
        rationale = parsed.rationale || 'No rationale provided'
        const classValue = parsed.classification?.toLowerCase()
        if (classValue === 'good' || classValue === 'bad' || classValue === 'unknown') {
          classification = classValue
        } else {
          // Try to infer from background description
          const bgLower = background.toLowerCase()
          if (bgLower.includes('white') && (bgLower.includes('plain') || bgLower.includes('backdrop') || bgLower.includes('background'))) {
            classification = 'bad'
          } else if (bgLower.includes('room') || bgLower.includes('studio') || bgLower.includes('colored') || bgLower.includes('color')) {
            classification = 'good'
          } else {
            classification = 'unknown'
          }
        }
        console.log('✅ Parsed caption - Foreground:', foreground, 'Background:', background, 'Classification:', classification, 'Rationale:', rationale)
      } else {
        console.warn('⚠️ No JSON found in response, using fallback')
        // Fallback: try to extract from text
        const lines = content.split('\n').filter(line => line.trim())
        if (lines.length >= 2) {
          foreground = lines[0].trim().substring(0, 50)
          background = lines[1].trim().substring(0, 50)
        } else {
          foreground = content.substring(0, 50)
          background = 'Unable to determine'
        }
        classification = 'unknown'
      }
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError)
      // If JSON parsing fails, try to extract from plain text
      const lines = content.split('\n').filter(line => line.trim())
      if (lines.length >= 2) {
        foreground = lines[0].trim().substring(0, 50)
        background = lines[1].trim().substring(0, 50)
      } else {
        foreground = content.substring(0, 50)
        background = 'Unable to determine'
      }
      classification = 'unknown'
    }

    return NextResponse.json({
      foreground,
      background,
      classification,
      rationale,
      caption: `${foreground}\n${background}`,
    })
  } catch (error) {
    console.error('❌ Classification error:', error)
    if (error instanceof Error) {
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Classification failed'
    const errorResponse = {
      error: errorMessage,
      foreground: 'Error',
      background: errorMessage,
      classification: 'unknown' as const,
      rationale: errorMessage,
      caption: `Error\n${errorMessage}`,
    }
    
    console.error('Returning error response:', errorResponse)
    return NextResponse.json(errorResponse, { status: 500 })
  }
}
