import os
from PIL import Image

src_field = r"C:\Users\NEXAWAVE\.gemini\antigravity-ide\brain\eec9746b-bfa1-49e3-9bea-fc217476fd6a\media__1784893004649.jpg"
public_icons_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public\icons"
public_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public"

os.makedirs(public_icons_dir, exist_ok=True)

img_field = Image.open(src_field).convert("RGBA")

# Master Field Download Logo
img_field.save(os.path.join(public_dir, "field-download-logo.png"), "PNG", quality=100)

# Field PWA Icons
img_field.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "field-icon-192.png"), "PNG")
img_field.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "field-icon-512.png"), "PNG")
img_field.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "field-icon-512-maskable.png"), "PNG")
img_field.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "field-apple-touch-icon.png"), "PNG")

print("Field Agent app download logo assets generated successfully.")
