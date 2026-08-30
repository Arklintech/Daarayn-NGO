import os
from PIL import Image

src_website = r"C:\Users\NEXAWAVE\.gemini\antigravity-ide\brain\eec9746b-bfa1-49e3-9bea-fc217476fd6a\media__1784893414572.png"
public_icons_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public\icons"
public_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public"

os.makedirs(public_icons_dir, exist_ok=True)

img_web = Image.open(src_website).convert("RGBA")

# Master Website Download Logo (for PWA download ONLY)
img_web.save(os.path.join(public_dir, "website-download-logo.png"), "PNG", quality=100)

# Public Website PWA Icons
img_web.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "icon-192.png"), "PNG")
img_web.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "icon-512.png"), "PNG")
img_web.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "icon-512-maskable.png"), "PNG")
img_web.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "apple-touch-icon.png"), "PNG")

print("Public Website download logo assets generated successfully.")
