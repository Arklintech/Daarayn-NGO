import os
from PIL import Image

src_path = r"C:\Users\NEXAWAVE\.gemini\antigravity-ide\brain\eec9746b-bfa1-49e3-9bea-fc217476fd6a\media__1784891980563.jpg"
public_icons_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public\icons"
public_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public"

os.makedirs(public_icons_dir, exist_ok=True)

img = Image.open(src_path)

# Convert to RGBA / RGB PNG
img_rgb = img.convert("RGBA")

# Save high-res master copy
master_path = os.path.join(public_dir, "admin-download-logo.png")
img_rgb.save(master_path, "PNG", quality=100)
print(f"Saved master image: {master_path}")

# 192x192 icon
img_192 = img_rgb.resize((192, 192), Image.Resampling.LANCZOS)
img_192.save(os.path.join(public_icons_dir, "admin-icon-192.png"), "PNG")
print("Saved admin-icon-192.png")

# 512x512 icon
img_512 = img_rgb.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save(os.path.join(public_icons_dir, "admin-icon-512.png"), "PNG")
print("Saved admin-icon-512.png")

# 512x512 maskable icon
img_512.save(os.path.join(public_icons_dir, "admin-icon-512-maskable.png"), "PNG")
print("Saved admin-icon-512-maskable.png")

# 180x180 apple touch icon
img_180 = img_rgb.resize((180, 180), Image.Resampling.LANCZOS)
img_180.save(os.path.join(public_icons_dir, "admin-apple-touch-icon.png"), "PNG")
print("Saved admin-apple-touch-icon.png")
