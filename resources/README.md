# Resources

This directory contains app icons and other resources for Voice Edit.

## Creating Icons

### Option 1: Using the script (requires macOS)

1. Create a 1024x1024 PNG image with your app icon design
2. Run: `./create-icons.sh your-icon.png`
3. This will generate both `icon.icns` and `icon.png`

### Option 2: Manual creation

**For icon.icns:**
- Use an online converter like https://cloudconvert.com/png-to-icns
- Or use macOS Preview: Open PNG → File → Export → Format: Apple Icon Image

**For icon.png:**
- Create a 16x16 or 32x32 PNG for the system tray
- Should have a transparent background
- Simple, high-contrast design works best

## Required Files

- `icon.icns` - macOS app icon (1024x1024 base, multi-resolution)
- `icon.png` - System tray icon (16x16 or 32x32)

## Temporary Placeholder

If you don't have icons yet, the app will still build and run, but:
- The dock/app icon will use Electron's default icon
- The tray icon may show as a broken image

To fix this quickly, you can use any PNG image temporarily:
```bash
# Use any existing image as a placeholder
cp ~/Pictures/some-image.png icon.png
```
