"""Denoise a baked texture (display-referred float RGB saved as .npy) and write PNG + WebP."""
import sys, numpy as np, cv2
src, stem = sys.argv[1], sys.argv[2]
strength = float(sys.argv[3]) if len(sys.argv) > 3 else 3
rgb = np.load(src)
out8 = (np.clip(rgb[::-1, :, ::-1], 0, 1) * 255 + 0.5).astype(np.uint8)
if strength > 0: out8 = cv2.fastNlMeansDenoisingColored(out8, None, strength, strength, 5, 11)
cv2.imwrite(stem + '.png', out8)
cv2.imwrite(stem + '.webp', out8, [cv2.IMWRITE_WEBP_QUALITY, 88])
