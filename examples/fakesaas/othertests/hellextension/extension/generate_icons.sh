#!/bin/bash
# Generate placeholder icons for Hell Extension
# Uses ImageMagick if available, otherwise creates simple HTML-based icons

ICON_DIR="icons"
mkdir -p "$ICON_DIR"

# Check if ImageMagick is available
if command -v convert &> /dev/null; then
    echo "Using ImageMagick to generate icons..."

    # 16x16
    convert -size 16x16 xc:'#e94560' \
        -fill white -gravity center -pointsize 10 -annotate 0 'H' \
        "$ICON_DIR/icon16.png"

    # 48x48
    convert -size 48x48 xc:'#e94560' \
        -fill white -gravity center -pointsize 28 -annotate 0 'H' \
        "$ICON_DIR/icon48.png"

    # 128x128
    convert -size 128x128 xc:'#e94560' \
        -fill white -gravity center -pointsize 72 -annotate 0 'H' \
        "$ICON_DIR/icon128.png"

    echo "Icons generated with ImageMagick"
else
    echo "ImageMagick not found, creating placeholder PNGs..."

    # Create minimal valid PNG files (1x1 red pixel, will work but look bad)
    # These are base64-encoded minimal PNGs

    # 16x16 red PNG
    echo "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4T2P8z8Dwn4EIwDiqgRhvDIoQGNUwJEMAAGVoBRACbKilAAAAAElFTkSuQmCC" | base64 -d > "$ICON_DIR/icon16.png"

    # 48x48 red PNG
    echo "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAMklEQVRoge3NMQEAAAjDMMC/52ECvlRA00nqs+6O7oDuAAAAAAAAAAAAAAAAAAAAAIDGAh9BAAHjF/UEAAAAASUVORK5CYII=" | base64 -d > "$ICON_DIR/icon48.png"

    # 128x128 red PNG
    echo "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAARklEQVR42u3BMQEAAADCoPVP7WsIoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeANRoAAB7tBzVgAAAABJRU5ErkJggg==" | base64 -d > "$ICON_DIR/icon128.png"

    echo "Placeholder icons created (install ImageMagick for better icons)"
fi

echo "Done! Icons in $ICON_DIR/"
ls -la "$ICON_DIR/"
