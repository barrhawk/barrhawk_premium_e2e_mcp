#!/bin/bash
# Generate simple fire emoji icons for URL Roaster

cd "$(dirname "$0")"

# Create SVG base
cat > icon.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="fire" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" style="stop-color:#ff6b6b"/>
      <stop offset="50%" style="stop-color:#feca57"/>
      <stop offset="100%" style="stop-color:#ff9f43"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="20" fill="#1a1a2e"/>
  <text x="64" y="90" font-size="70" text-anchor="middle" fill="url(#fire)">🔥</text>
</svg>
EOF

# Convert to PNGs if ImageMagick is available
if command -v convert &> /dev/null; then
  convert -background none icon.svg -resize 16x16 icon16.png
  convert -background none icon.svg -resize 48x48 icon48.png
  convert -background none icon.svg -resize 128x128 icon128.png
  echo "Icons generated with ImageMagick"
else
  # Fallback: create simple colored PNGs using base64 encoded minimal PNGs
  echo "ImageMagick not found, creating placeholder icons"

  # Minimal 16x16 orange PNG
  echo "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAUklEQVR42mNgGAWjYBSMgv8MDAz/0fH/////Y8PHFTAwMDCQZAADAwNWQ0gyAJshJBuAzRCSDcBmCMkGYDOE5GuAzRCSXw5YDRkFo2AUjAICAAD/TRwQ+hhnOQAAAABJRU5ErkJggg==" | base64 -d > icon16.png
  cp icon16.png icon48.png
  cp icon16.png icon128.png
fi

echo "Done!"
ls -la *.png 2>/dev/null
