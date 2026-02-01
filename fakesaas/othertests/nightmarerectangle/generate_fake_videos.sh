#!/bin/bash
# Generate 16 fake TikTok-style videos for NightmareRectangle
# Requires ffmpeg

OUTDIR="assets/videos"
mkdir -p "$OUTDIR"

COLORS=(
  "0xff0000" "0xff1493" "0x9400d3" "0x4b0082"
  "0x0000ff" "0x00bfff" "0x00ffff" "0x008b8b"
  "0x006400" "0x00ff00" "0x7fff00" "0xffff00"
  "0xffa500" "0xff4500" "0xff6347" "0xdc143c"
)

for i in $(seq 0 15); do
  idx=$(printf "%02d" $i)
  color=${COLORS[$i]}

  echo "Generating fake_tiktok_${idx}.webm..."

  # Create 5-second video with moving gradient and fake content
  ffmpeg -y -f lavfi -i "color=c=${color}:s=360x640:d=5,format=yuv420p" \
    -f lavfi -i "sine=frequency=220:duration=5" \
    -vf "
      drawtext=text='FAKE TIKTOK ${i}':fontsize=30:fontcolor=white:x=(w-text_w)/2:y=100,
      drawtext=text='@nightmare_user_${i}':fontsize=20:fontcolor=white:x=20:y=h-60,
      drawtext=text='%{pts\:hms}':fontsize=16:fontcolor=white:x=w-80:y=20,
      noise=alls=10:allf=t
    " \
    -c:v libvpx-vp9 -b:v 500k \
    -c:a libopus -b:a 64k \
    "$OUTDIR/fake_tiktok_${idx}.webm"
done

echo "Done! Generated 16 fake videos in $OUTDIR"
