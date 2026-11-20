"""Light denoise for Cycles stills (this Blender build ships without a denoiser)."""
import sys, cv2
src, dst = sys.argv[1], sys.argv[2]
strength = float(sys.argv[3]) if len(sys.argv) > 3 else 5
img = cv2.imread(src)
cv2.imwrite(dst, cv2.fastNlMeansDenoisingColored(img, None, strength, strength, 5, 15))
