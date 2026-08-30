import os
from PIL import Image

src_admin = r"C:\Users\NEXAWAVE\.gemini\antigravity-ide\brain\eec9746b-bfa1-49e3-9bea-fc217476fd6a\media__1784891980563.jpg"
src_public = r"c:\Users\NEXAWAVE\Desktop\NGO\public\daarayn-logo-transparent.png"
if not os.path.exists(src_public):
    src_public = r"c:\Users\NEXAWAVE\Desktop\NGO\public\brand logo .png"

public_icons_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public\icons"
public_dir = r"c:\Users\NEXAWAVE\Desktop\NGO\public"

os.makedirs(public_icons_dir, exist_ok=True)

# 1. ADMIN PANEL EXCLUSIVE ICONS
img_admin = Image.open(src_admin).convert("RGBA")
img_admin.save(os.path.join(public_dir, "admin-download-logo.png"), "PNG", quality=100)

img_admin.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-icon-192.png"), "PNG")
img_admin.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-icon-512.png"), "PNG")
img_admin.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-icon-512-maskable.png"), "PNG")
img_admin.resize((180, 180), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "admin-apple-touch-icon.png"), "PNG")

# 2. RESTORE PUBLIC / FIELD APP ICONS (Non-Admin)
if os.path.exists(src_public):
    img_pub = Image.open(src_public).convert("RGBA")
    img_pub.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "icon-192.png"), "PNG")
    img_pub.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(public_icons_dir, "icon-512-maskable.png"), "PNG")
    img_pub.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(public_dir, "favicon.png"), "PNG")
    print("Restored public/field non-admin icons.")

print("Scope isolation complete: Admin logo assigned EXCLUSIVELY to Admin Panel PWA manifest.")
