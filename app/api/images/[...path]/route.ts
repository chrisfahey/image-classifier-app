import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs-extra'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> | { path: string[] } }
) {
  try {
    // Handle both Promise and non-Promise params (Next.js 14 vs 15)
    const resolvedParams = params instanceof Promise ? await params : params
    const pathSegments = resolvedParams.path
    
    if (!pathSegments || pathSegments.length === 0) {
      console.error('No path segments provided')
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    
    const filePath = path.join(UPLOAD_DIR, ...pathSegments)
    
    // Security check: ensure the file is within the upload directory
    const resolvedPath = path.resolve(filePath)
    const resolvedUploadDir = path.resolve(UPLOAD_DIR)
    
    if (!resolvedPath.startsWith(resolvedUploadDir)) {
      console.error('Path traversal attempt:', resolvedPath, 'not in', resolvedUploadDir)
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 })
    }

    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath, 'Path segments:', pathSegments)
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const fileBuffer = await fs.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    
    let contentType = 'image/jpeg'
    if (ext === '.png') contentType = 'image/png'
    else if (ext === '.gif') contentType = 'image/gif'
    else if (ext === '.webp') contentType = 'image/webp'
    else if (ext === '.bmp') contentType = 'image/bmp'

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      },
    })
  } catch (error) {
    console.error('Image serve error:', error)
    return NextResponse.json({ error: 'Failed to serve image' }, { status: 500 })
  }
}
