"""Denoise a baked texture and write it as WebP."""
import sys, cv2
src, dst = sys.argv[1], sys.argv[2]
strength = float(sys.argv[3]) if len(sys.argv) > 3 else 4
img = cv2.imread(src)
if strength > 0: img = cv2.fastNlMeansDenoisingColored(img, None, strength, strength, 5, 15)
cv2.imwrite(dst, img, [cv2.IMWRITE_WEBP_QUALITY, 90])
cv2.imwrite(dst.replace('.webp', '.png'), img)
