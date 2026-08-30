import os
from PIL import Image

src_path = r"C:\Users\NEXAWAVE\.gemini\antigravity-ide\brain\eec9746b-bfa1-49e3-9bea-fc217476fd6a\media__1784891980563.jpg"
public_icons_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public\icons"
public_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public"

os.makedirs(public_icons_dir, exist_ok=True)

img = Image.open(src_path).convert("RGBA")

# Master download logo
img.save(os.path.join(public_dir, "admin-download-logo.png"), "PNG", quality=100)
img.save(os.path.join(public_dir, "brand logo1.png"), "PNG", quality=100)

# Admin PWA Icons
img.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-icon-192.png"), "PNG")
img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-icon-512.png"), "PNG")
img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-icon-512-maskable.png"), "PNG")
img.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-apple-touch-icon.png"), "PNG")

# Root favicon / logo fallbacks
img.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "favicon.png"), "PNG")

print("All app download icons updated successfully.")
