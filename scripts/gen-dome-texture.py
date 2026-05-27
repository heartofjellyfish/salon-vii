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
rn = np.sqrt(dx ** 2 + dy ** 2)          # 0 centre, 1 edge-midpoint, 1.41 corner
ang = np.arctan2(dy, dx)

# --- base sky: indigo zenith -> warm-dark plum at the rim --------------------
zenith = np.array([0.045, 0.055, 0.155])
midd = np.array([0.085, 0.085, 0.200])
rimc = np.array([0.190, 0.115, 0.120])
ta = smoothstep(0.0, 0.55, rn)
tb = smoothstep(0.45, 1.0, rn)
sky = (zenith[None, None] * (1 - ta)[..., None]
       + midd[None, None] * (ta * (1 - tb))[..., None]
       + rimc[None, None] * tb[..., None])

# dusk side: clouds warmest toward one direction (the near/front edge)
warm_dir = 0.5 + 0.5 * np.cos(ang + (np.pi / 2))   # peak toward -dy (front)
warm = np.clip(0.5 + 0.9 * warm_dir, 0.25, 1.3)

# --- cloud masses, swelling toward the rim -----------------------------------
clouds = fbm([3, 6, 12, 24], [1.0, 0.6, 0.32, 0.16])
detail = fbm([16, 34, 64], [1.0, 0.5, 0.25])
clouds = np.clip(clouds * 0.8 + detail * 0.2, 0, 1)
band = smoothstep(0.46, 1.06, rn)
cloud_mask = np.clip((clouds - 0.40) / 0.60, 0, 1) ** 1.25 * band
cloud_mask = np.clip(cloud_mask * (0.6 + 0.55 * warm_dir), 0, 1)

crest = np.array([1.12, 0.82, 0.48])
belly = np.array([0.40, 0.24, 0.18])
lit = smoothstep(0.32, 0.88, clouds)[..., None]
cloud_col = (belly[None, None] * (1 - lit) + crest[None, None] * lit) * warm[..., None]

a = cloud_mask[..., None]
img = sky * (1 - a) + cloud_col * a

# brightest sunlit bank, on the near/front edge
bx, by = 0.0, -0.6
glow = np.exp(-(((dx - bx)) ** 2 + ((dy - by)) ** 2) * 3.0)
img += np.array([0.62, 0.4, 0.2])[None, None] * (glow * 0.5)[..., None]

# NB: no stars baked in — the dome shader draws crisp, twinkling stars on top so
# they stay sharp while this cloud layer is gently warped/animated underneath.

img = np.clip(img, 0, 1)
out = (img ** (1 / 1.06) * 255).astype(np.uint8)
Image.fromarray(out).save("public/assets/gallery-ceiling/celestial_dome_clouds_2048.png")
print("wrote celestial_dome_clouds_2048.png (square radial, clouds + sky, no stars)")
