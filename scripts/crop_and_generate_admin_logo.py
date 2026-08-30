import os
from PIL import Image

src_admin = r"C:\Users\NEXAWAVE\.gemini\antigravity-ide\brain\eec9746b-bfa1-49e3-9bea-fc217476fd6a\media__1784895482101.jpg"
public_icons_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public\icons"
public_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public"

os.makedirs(public_icons_dir, exist_ok=True)

img = Image.open(src_admin).convert("RGBA")
width, height = img.size
print(f"Original dimensions: {width}x{height}")

# Find bounding box of non-black outer boundary
# Convert to grayscale to detect outer black background
gray = img.convert("L")
pixels = gray.load()

left, top, right, bottom = width, height, 0, 0
threshold = 15 # brightness threshold for black background

for y in range(height):
    for x in range(width):
        if pixels[x, y] > threshold:
            if x < left: left = x
            if x > right: right = x
            if y < top: top = y
            if y > bottom: bottom = y

print(f"Detected bounding box: left={left}, top={top}, right={right}, bottom={bottom}")

# Crop to the exact gold border box
cropped = img.crop((left, top, right, bottom))
crop_w, crop_h = cropped.size
print(f"Cropped dimensions: {crop_w}x{crop_h}")

# Save cropped master image
cropped.save(os.path.join(public_dir, "admin-download-logo.png"), "PNG", quality=100)

# Generate icon sizes with ?v=3 cache busters
cropped.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-icon-192.png"), "PNG")
cropped.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-icon-512.png"), "PNG")
cropped.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-icon-512-maskable.png"), "PNG")
cropped.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-apple-touch-icon.png"), "PNG")

print("Cropped Admin logo generated with 0 outer black margins!")
