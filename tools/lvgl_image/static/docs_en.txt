# LVGL Image Converter - User Guide

## 1. Core Configuration
- **LVGL Version**: Supports v9 (Latest) and v8 (Legacy). v9 uses the new color format macros; v8 automatically maps to legacy struct names.
- **Color Format**:
  - `RGB565A8`: Specialized format, 16-bit color + 8-bit independent Alpha map. Best balance between speed and quality.
  - `I1/I2/I4/I8`: Indexed modes using palettes. Greatly reduces RAM/Flash footprint.
  - `RAW`: Pass-through mode. Converts original file to C array directly. Requires built-in decoders.
- **Memory Align**:
  - `4 Bytes`: Standard alignment for most ARM Cortex-M MCUs.
  - `32 Bytes`: Cache Line alignment. Recommended for high-performance chips (e.g., i.MX RT) to prevent cache thrashing.
  - `64 Bytes`: Ultra-high alignment for specialized GPUs or high-speed DMA burst transfers.

## 2. Advanced Features
- **Dithering**: Highly recommended for 16-bit colors (RGB565) to eliminate banding in gradients.
- **Premultiply Alpha**: Pre-calculates Alpha values into RGB channels to save MCU cycles during runtime rendering.
- **NEMA GFX Optimized**: Byte-order and palette optimization specifically for hardware supporting NEMA GFX accelerators.

## 3. Usage Tips
- **Output Name**: Use lowercase and underscores (e.g., `ui_img_logo`). If empty, the system defaults to the original filename.
- **Resize**: Leave blank to keep original size. If only Width or Height is provided, the image will scale proportionally.
- **LVGL v8 Warning**: For v8 projects, stick to standard color formats (like RGB565) for maximum compatibility.

---
*Last Updated: 2026-02-12*
