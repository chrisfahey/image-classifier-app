'use client'

import { useState, useRef } from 'react'

interface ImageResult {
  filename: string;
  url: string;
  status: 'processing' | 'completed';
  foreground?: string;
  background?: string;
  classification?: 'good' | 'bad' | 'unknown';
  rationale?: string;
  caption?: string;
}

export default function Home() {
  const [images, setImages] = useState<ImageResult[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setError('Please upload a ZIP file')
      return
    }

    setError(null)
    setUploading(true)
    setImages([])
    setProgress({ current: 0, total: 0 })

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const data = await response.json()
      const { imageUrls } = data

      console.log('Received imageUrls:', imageUrls.length, imageUrls)

      if (imageUrls.length === 0) {
        throw new Error('No images found in the ZIP file')
      }

      if (imageUrls.length > 100) {
        throw new Error('ZIP file contains more than 100 images')
      }

      // Remove any duplicate URLs
      const uniqueUrls = Array.from(new Set(imageUrls))
      if (uniqueUrls.length !== imageUrls.length) {
        console.warn(`Removed ${imageUrls.length - uniqueUrls.length} duplicate URLs`)
      }

      // Randomize the order of images
      const shuffledUrls = [...uniqueUrls].sort(() => Math.random() - 0.5)
      console.log('🔀 Randomized image order')

      setProgress({ current: 0, total: shuffledUrls.length })

      // Initialize images with processing status (using shuffled order)
      const initialImages: ImageResult[] = shuffledUrls.map((url: string, index: number) => ({
        filename: url.split('/').pop() || `image-${index}`,
        url,
        status: 'processing',
      }))
      console.log('Initialized images:', initialImages.length)
      console.log('Image URLs (randomized):', initialImages.map(img => img.url))
      
      // Ensure we're not duplicating - use a Set to verify uniqueness
      const uniqueImageUrls = new Set(initialImages.map(img => img.url))
      if (uniqueImageUrls.size !== initialImages.length) {
        console.error('DUPLICATE URLs DETECTED IN FRONTEND!', initialImages)
        // Remove duplicates
        const seen = new Set<string>()
        const deduplicated = initialImages.filter(img => {
          if (seen.has(img.url)) {
            return false
          }
          seen.add(img.url)
          return true
        })
        console.log('Deduplicated to:', deduplicated.length)
        setImages(deduplicated)
      } else {
        setImages(initialImages)
      }

      // Classify each image one at a time (in the randomized order)
      for (let i = 0; i < shuffledUrls.length; i++) {
        try {
          const classifyResponse = await fetch('/api/classify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ imageUrl: shuffledUrls[i] }),
          })

          if (!classifyResponse.ok) {
            const errorData = await classifyResponse.json().catch(() => ({}))
            throw new Error(errorData.error || `HTTP ${classifyResponse.status}: Classification failed`)
          }

          const result = await classifyResponse.json()
          console.log('Classification result for image', i, ':', result)
          
          setImages(prev => prev.map((img, idx) => 
            idx === i 
              ? { 
                  ...img, 
                  status: 'completed',
                  foreground: result.foreground || 'Unable to describe',
                  background: result.background || 'Unable to describe',
                  classification: result.classification || 'unknown',
                  rationale: result.rationale || 'No rationale provided',
                  caption: result.caption || `${result.foreground || 'Unable to describe'}\n${result.background || 'Unable to describe'}`
                }
              : img
          ))

          setProgress({ current: i + 1, total: shuffledUrls.length })
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          console.error('Error classifying image', i, ':', errorMessage, err)
          setImages(prev => prev.map((img, idx) => 
            idx === i 
              ? { 
                  ...img, 
                  status: 'completed',
                  foreground: 'Error',
                  background: errorMessage.substring(0, 50),
                  classification: 'unknown',
                  rationale: errorMessage.substring(0, 50),
                  caption: `Error\n${errorMessage.substring(0, 50)}`
                }
              : img
          ))
          setProgress({ current: i + 1, total: shuffledUrls.length })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setUploading(false)
    }
  }

  const handleReset = () => {
    setImages([])
    setError(null)
    setProgress({ current: 0, total: 0 })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // No filtering needed anymore - just show all images
  const filteredImages = images

  return (
    <div className="container">
      <h1 style={{ marginBottom: '2rem', fontSize: '2rem', fontWeight: 'bold' }}>
        Image Classifier
      </h1>

      <div className="upload-section">
        <div
          className={`upload-area ${dragActive ? 'dragover' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            Drag and drop a ZIP file here, or click to select
          </p>
          <p style={{ fontSize: '0.9rem', color: '#666' }}>
            Up to 100 images supported
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </div>
        {error && <div className="error">{error}</div>}
        {uploading && (
          <div className="progress">
            <div className="progress-text">
              Processing: {progress.current} / {progress.total} images
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="filter-section">
          <span style={{ fontWeight: '500' }}>Images: {images.length}</span>
          <div style={{ marginLeft: 'auto' }}>
            <button
              className="reset-button"
              onClick={handleReset}
            >
              RESET
            </button>
          </div>
        </div>
      )}

      {filteredImages.length > 0 ? (
        <div className="gallery">
          {filteredImages.map((image, index) => (
            <div key={`${image.url}-${index}`} className="image-card">
              <div className="image-wrapper">
                <img src={image.url} alt={image.filename} />
              </div>
              <div className="image-info">
                {image.status === 'processing' ? (
                  <div className="image-status processing">
                    Processing...
                  </div>
                ) : (
                  <div style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                      {image.foreground || 'No description'}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                      {image.background || 'No description'}
                    </div>
                    {image.classification && (
                      <div className={`badge badge-${image.classification}`} style={{ marginBottom: '0.25rem' }}>
                        {image.classification.toUpperCase()}
                      </div>
                    )}
                    {image.rationale && (
                      <div style={{ color: '#888', fontSize: '0.75rem', fontStyle: 'italic', marginTop: '0.25rem' }}>
                        {image.rationale}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : images.length === 0 && !uploading ? (
        <div className="loading">
          <p>Upload a ZIP file to get started</p>
        </div>
      ) : null}
    </div>
  )
}
