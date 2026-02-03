import { NextRequest, NextResponse } from 'next/server'
import formidable from 'formidable'
import yauzl from 'yauzl'
import fs from 'fs-extra'
import path from 'path'
import { promisify } from 'util'

export const config = {
  api: {
    bodyParser: false,
  },
}

const readFile = promisify(fs.readFile)
const mkdir = promisify(fs.mkdir)

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
const TEMP_DIR = path.join(process.cwd(), 'temp')

// Ensure directories exist
fs.ensureDirSync(UPLOAD_DIR)
fs.ensureDirSync(TEMP_DIR)

// Supported image extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']

function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase()
  return IMAGE_EXTENSIONS.includes(ext)
}

function extractZip(zipPath: string, extractTo: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const writePromises: Promise<string | null>[] = []
    const processedEntries = new Set<string>() // Track processed entries to avoid duplicates

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(err)
        return
      }

      zipfile.readEntry()

      zipfile.on('entry', (entry) => {
        // Skip if we've already processed this entry
        if (processedEntries.has(entry.fileName)) {
          console.warn(`⚠️ DUPLICATE ENTRY DETECTED, skipping: ${entry.fileName} (already processed)`)
          zipfile.readEntry()
          return
        }
        
        console.log(`📦 New entry from ZIP: ${entry.fileName} (total processed so far: ${processedEntries.size})`)

        if (/\/$/.test(entry.fileName)) {
          // Directory entry, skip
          processedEntries.add(entry.fileName)
          zipfile.readEntry()
          return
        }

        if (!isImageFile(entry.fileName)) {
          // Not an image, skip
          processedEntries.add(entry.fileName)
          zipfile.readEntry()
          return
        }

        // Skip macOS resource fork files (._ prefix)
        const fileName = path.basename(entry.fileName)
        if (fileName.startsWith('._')) {
          console.log(`⏭️  Skipping macOS resource fork file: ${entry.fileName}`)
          processedEntries.add(entry.fileName)
          zipfile.readEntry()
          return
        }

        processedEntries.add(entry.fileName)
        console.log(`Processing entry ${processedEntries.size}: ${entry.fileName}`)
        const writePromise = new Promise<string | null>((resolveWrite) => {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              console.error('Error opening read stream:', err, entry.fileName)
              resolveWrite(null)
              zipfile.readEntry()
              return
            }

            const fileName = path.basename(entry.fileName)
            const filePath = path.join(extractTo, fileName)
            
            // Handle duplicate filenames
            let finalPath = filePath
            let counter = 1
            while (fs.existsSync(finalPath)) {
              const ext = path.extname(fileName)
              const name = path.basename(fileName, ext)
              finalPath = path.join(extractTo, `${name}_${counter}${ext}`)
              counter++
            }

            console.log(`Extracting: ${entry.fileName} -> ${finalPath}`)
            const writeStream = fs.createWriteStream(finalPath)
            readStream.pipe(writeStream)

            writeStream.on('close', () => {
              // Verify file exists and is readable
              if (fs.existsSync(finalPath)) {
                resolveWrite(finalPath)
              } else {
                console.error('File was not written:', finalPath)
                resolveWrite(null)
              }
              zipfile.readEntry()
            })

            writeStream.on('error', (err) => {
              console.error('Write stream error:', err, finalPath)
              resolveWrite(null)
              zipfile.readEntry()
            })
          })
        })

        writePromises.push(writePromise)
      })

      zipfile.on('end', () => {
        console.log(`✅ ZIP extraction complete. Total entries processed: ${processedEntries.size}, Write promises: ${writePromises.length}`)
        // Wait for all writes to complete (using allSettled to handle failures gracefully)
        Promise.allSettled(writePromises).then((settledResults) => {
          const successfulFiles = settledResults
            .filter((result): result is PromiseFulfilledResult<string | null> => 
              result.status === 'fulfilled' && result.value !== null
            )
            .map(result => result.value as string)
          
          // Remove duplicate file paths (in case same file was extracted multiple times)
          const uniqueFiles = Array.from(new Set(successfulFiles))
          console.log(`📊 EXTRACTION RESULTS:`)
          console.log(`   - Successful files: ${successfulFiles.length}`)
          console.log(`   - Unique files: ${uniqueFiles.length}`)
          if (successfulFiles.length !== uniqueFiles.length) {
            console.error(`❌ DUPLICATE FILE PATHS DETECTED! ${successfulFiles.length - uniqueFiles.length} duplicates`)
            console.error('All file paths:', successfulFiles)
            console.error('Unique file paths:', uniqueFiles)
            const duplicates = successfulFiles.filter((file, index) => successfulFiles.indexOf(file) !== index)
            console.error('Duplicate paths:', duplicates)
          }
          console.log(`✅ Resolving with ${uniqueFiles.length} unique file paths`)
          resolve(uniqueFiles)
        })
      })

      zipfile.on('error', (err) => {
        reject(err)
      })
    })
  })
}

export async function POST(request: NextRequest) {
  const requestId = Date.now() + Math.random()
  console.log(`\n🚀 === UPLOAD REQUEST STARTED [${requestId}] ===`)
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    console.log(`📁 File received: ${file.name}, size: ${file.size} bytes [${requestId}]`)

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.endsWith('.zip')) {
      return NextResponse.json({ error: 'File must be a ZIP file' }, { status: 400 })
    }

    // Save uploaded file temporarily
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const tempZipPath = path.join(TEMP_DIR, `upload_${Date.now()}.zip`)
    await fs.writeFile(tempZipPath, buffer)

    // Create unique extraction directory
    const extractDir = path.join(UPLOAD_DIR, `extract_${Date.now()}`)
    await mkdir(extractDir, { recursive: true })

    // Extract ZIP file
    const extractedFiles = await extractZip(tempZipPath, extractDir)

    if (extractedFiles.length === 0) {
      // Cleanup
      await fs.remove(extractDir)
      await fs.remove(tempZipPath)
      return NextResponse.json({ error: 'No images found in ZIP file' }, { status: 400 })
    }

    if (extractedFiles.length > 100) {
      // Cleanup
      await fs.remove(extractDir)
      await fs.remove(tempZipPath)
      return NextResponse.json({ error: 'ZIP file contains more than 100 images' }, { status: 400 })
    }

    // Sort files for consistent ordering
    extractedFiles.sort()

    console.log(`=== EXTRACTION SUMMARY ===`)
    console.log(`Total extracted files: ${extractedFiles.length}`)
    console.log(`Extracted file paths:`, extractedFiles)

    // Remove duplicates (in case extraction created any)
    const uniqueFiles = Array.from(new Set(extractedFiles))
    console.log(`Unique files after Set deduplication: ${uniqueFiles.length}`)
    
    if (extractedFiles.length !== uniqueFiles.length) {
      console.error(`DUPLICATE FILES DETECTED! ${extractedFiles.length - uniqueFiles.length} duplicates found`)
      const duplicates = extractedFiles.filter((file, index) => extractedFiles.indexOf(file) !== index)
      console.error('Duplicate file paths:', duplicates)
    }
    
    console.log('Unique files:', uniqueFiles)

    // Verify all files exist before generating URLs
    const existingFiles = uniqueFiles.filter(filePath => {
      const exists = fs.existsSync(filePath)
      if (!exists) {
        console.error('File does not exist:', filePath)
      }
      return exists
    })
    console.log(`Verified ${existingFiles.length} files exist out of ${uniqueFiles.length}`)

    // Generate URLs for the extracted images
    const imageUrls = existingFiles.map((filePath) => {
      const relativePath = path.relative(UPLOAD_DIR, filePath)
      const urlPath = relativePath.replace(/\\/g, '/')
      // Ensure the path doesn't start with a slash (it shouldn't, but just in case)
      const cleanPath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath
      const fullUrl = `/api/images/${cleanPath}`
      console.log(`File: ${filePath} -> URL: ${fullUrl}`)
      return fullUrl
    })

    // Remove duplicate URLs
    const uniqueUrls = Array.from(new Set(imageUrls))
    console.log(`Generated ${imageUrls.length} URLs, ${uniqueUrls.length} unique URLs`)
    
    if (uniqueUrls.length !== imageUrls.length) {
      console.warn('Duplicate URLs detected!')
      console.warn('All URLs:', imageUrls)
      console.warn('Unique URLs:', uniqueUrls)
    }
    
    console.log('Final unique URLs to return:', uniqueUrls)

    // Cleanup temp ZIP file
    await fs.remove(tempZipPath)

    // Final safety check - ensure we only return unique URLs
    const finalUrls = Array.from(new Set(uniqueUrls))
    
    console.log(`\n✅ === UPLOAD REQUEST COMPLETE [${requestId}] ===`)
    console.log(`Returning ${finalUrls.length} unique URLs (was ${uniqueUrls.length} before final dedup)`)
    if (finalUrls.length !== uniqueUrls.length) {
      console.error(`⚠️ FINAL DEDUPLICATION REMOVED ${uniqueUrls.length - finalUrls.length} MORE DUPLICATES!`)
    }
    if (finalUrls.length > 16) {
      console.error(`❌ ERROR: Returning ${finalUrls.length} URLs but expected 16 or fewer!`)
      console.error('URLs being returned:', JSON.stringify(finalUrls, null, 2))
    }
    console.log('==========================================\n')

    if (finalUrls.length > 100) {
      return NextResponse.json({ error: 'Too many images' }, { status: 400 })
    }

    return NextResponse.json({ imageUrls: finalUrls, extractDir })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
