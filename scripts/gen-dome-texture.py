#!/usr/bin/env python3
"""Generate a painterly celestial-dome roundel for the salon ceiling.

This is a SQUARE radial composition meant to be mapped *planar* (top-down) onto a
shallow dome cap, the way a Baroque painted ceiling is seen from below:
  centre  -> deep indigo starry zenith
  outward -> stars thin, warm sunset clouds swell
  edge    -> golden Tiepolo cloud bank (sits just inside the gilt frame)
A gentle directional bias makes the clouds warmest on one side, like dusk.
"""
import numpy as np
from PIL import Image, ImageFilter

S = 2048
RNG = np.random.default_rng(11)
C = S / 2


def noise(kmax, power=1.5):
    """Low-pass random noise in [0,1] via a random FFT spectrum."""
    k = np.fft.fftfreq(S) * S
    KX, KY = np.meshgrid(k, k)
    rad = np.sqrt(KX ** 2 + KY ** 2)
    amp = 1.0 / (1.0 + (rad / kmax) ** 2) ** power
    amp[0, 0] = 0.0
    phase = RNG.uniform(0, 2 * np.pi, (S, S))
    img = np.fft.ifft2(amp * np.exp(1j * phase)).real
    img -= img.min()
    img /= max(img.max(), 1e-6)
    return img


def fbm(scales, weights):
    out = sum(w * noise(k) for k, w in zip(scales, weights))
    out -= out.min()
    out /= max(out.max(), 1e-6)
    return out


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


ys, xs = np.mgrid[0:S, 0:S]
dx = (xs - C) / C
dy = (ys - C) / C

# An off-centre warm glow — a low "sunrise/moon" lighting one quarter of the sky.
# Clouds gather around it; the rest of the sky stays clear and starry. This reads
# naturally across a whole flat ceiling (no clouds ringing the cornice).
gx, gy = -0.40, 0.42
gd = np.sqrt((dx - gx) ** 2 + (dy - gy) ** 2)
glow = np.exp(-(gd ** 2) * 1.3)            # 0..1 warm influence

# --- base night sky: deep plum/violet (harmonises with the magenta walls and
# gold trim — not a cold blue), faintly warmed toward the glow ----------------
night = np.array([0.12, 0.06, 0.135])
warmnight = np.array([0.19, 0.10, 0.13])
var = fbm([2, 4], [1.0, 0.5])              # gentle large-scale tonal variation
sky = (night[None, None] * (1 - (glow * 0.55)[..., None])
       + warmnight[None, None] * (glow * 0.55)[..., None])
sky = sky * (0.85 + 0.32 * var[..., None])

# --- clouds: clustered billowing masses with clear starry gaps ---------------
cluster = fbm([1.5, 3], [1.0, 0.55])       # where clouds gather (large scale)
detail = fbm([6, 12, 24, 48], [1.0, 0.55, 0.3, 0.16])
field = np.clip(detail * (0.4 + 0.9 * cluster), 0, 1)
# concentrate cloud near the glow, sparse away — NOT a rim ring
cloud_mask = np.clip(smoothstep(0.46, 0.72, field) * (0.22 + 0.95 * glow), 0, 1)

# golden where the glow lights them, dim warm-grey where far
crest = np.array([1.08, 0.80, 0.46])
dim = np.array([0.22, 0.18, 0.22])
lit = np.clip(glow * 1.15, 0, 1)[..., None]
shade = smoothstep(0.40, 0.85, field)[..., None]
cloud_col = (dim[None, None] * (1 - lit) + crest[None, None] * lit) * (0.6 + 0.5 * shade)

a = cloud_mask[..., None]
img = sky * (1 - a) + cloud_col * a

# warm bloom at the glow source
img += np.array([0.50, 0.34, 0.18])[None, None] * ((glow ** 1.4) * 0.5)[..., None]

# NB: no stars baked in — the ceiling shader draws crisp, twinkling stars on top
# so they stay sharp while this cloud layer is gently warped/animated underneath.

img = np.clip(img, 0, 1)
out = (img ** (1 / 1.06) * 255).astype(np.uint8)
Image.fromarray(out).save("public/assets/gallery-ceiling/celestial_dome_clouds_2048.png")
print("wrote celestial_dome_clouds_2048.png (scattered clouds + off-centre glow)")
