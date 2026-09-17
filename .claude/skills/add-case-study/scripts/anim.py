"""Encode a screen recording to an animated webp without libwebp's ghosting.

libwebp's animation encoder (what ffmpeg/PyAV's libwebp_anim uses) never inserts
key frames and, in lossy mode, flattens blocks it judges "similar" to the last
canvas, so faint traces of an earlier screen survive a page change. This does
the differencing itself: each frame is compared with what the canvas holds, the
bounding box of every pixel that moved more than T levels is encoded as a lossy
still and dropped in with no blending, so nothing old shows through.

  anim.py <src.mov> <dest.webp> <poster.jpg> <fps> <quality> [T]

Needs PyAV and numpy (both on this Mac; there is no ffmpeg). The audit agent
walkthrough is 12 fps, quality 68, T 12: 1.5 MB for 24 s at 1594x1056.
"""
import av, io, struct, sys
import numpy as np
from fractions import Fraction

src, dest, poster, fps, q = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
T = int(sys.argv[6]) if len(sys.argv) > 6 else 6

def still(rgb, quality):
    """Encode an RGB array as a lossy still webp and return its VP8 bitstream chunk(s)."""
    h, w = rgb.shape[:2]
    buf = io.BytesIO()
    out = av.open(buf, 'w', format='webp')
    s = out.add_stream('libwebp', rate=1)
    s.width, s.height = w, h
    s.pix_fmt = 'yuv420p'
    s.options = {'quality': str(quality), 'compression_level': '6'}
    fr = av.VideoFrame.from_ndarray(np.ascontiguousarray(rgb), format='rgb24').reformat(format='yuv420p')
    for p in s.encode(fr): out.mux(p)
    for p in s.encode(None): out.mux(p)
    out.close()
    data = buf.getvalue()
    assert data[:4] == b'RIFF' and data[8:12] == b'WEBP', data[:12]
    # keep the image chunks (VP8/VP8L/ALPH), drop any VP8X header the still carries
    pos, chunks = 12, b''
    while pos < len(data):
        tag, size = data[pos:pos+4], struct.unpack('<I', data[pos+4:pos+8])[0]
        body = data[pos:pos+8+size+(size & 1)]
        if tag in (b'VP8 ', b'VP8L', b'ALPH'): chunks += body
        pos += 8 + size + (size & 1)
    return chunks

def chunk(tag, body):
    return tag + struct.pack('<I', len(body)) + body + (b'\0' if len(body) & 1 else b'')

def u24(n): return struct.pack('<I', n)[:3]

inp = av.open(src); vs = inp.streams.video[0]
W, H = vs.width // 2 * 2, vs.height // 2 * 2
step = Fraction(1, fps); next_t = Fraction(0)
ms = round(1000 / fps)
canvas = None; frames = []; first = None; n_in = 0
for fr in inp.decode(vs):
    t = Fraction(fr.pts * vs.time_base)
    if t + Fraction(1, 1000) < next_t: continue
    next_t += step; n_in += 1
    rgb = fr.reformat(width=W, height=H, format='rgb24').to_ndarray()
    if canvas is None:
        first = fr
        canvas = rgb.copy()
        frames.append([0, 0, W, H, ms, still(rgb, q)])
        continue
    moved = np.abs(rgb.astype(np.int16) - canvas.astype(np.int16)).max(axis=2) > T
    ys, xs = np.nonzero(moved)
    if len(ys) == 0:
        frames[-1][4] += ms
        continue
    x0, x1 = int(xs.min()) // 2 * 2, min(W, (int(xs.max()) + 2) // 2 * 2)
    y0, y1 = int(ys.min()) // 2 * 2, min(H, (int(ys.max()) + 2) // 2 * 2)
    rect = rgb[y0:y1, x0:x1]
    canvas[y0:y1, x0:x1] = rect
    frames.append([x0, y0, x1 - x0, y1 - y0, ms, still(rect, q)])

body = b'WEBP'
body += chunk(b'VP8X', bytes([0x02, 0, 0, 0]) + u24(W - 1) + u24(H - 1))
body += chunk(b'ANIM', struct.pack('<I', 0xFFFFFFFF) + struct.pack('<H', 0))
for x, y, w, h, dur, data in frames:
    # flags: bit1 = 1 -> do not blend (replace); bit0 = 0 -> keep after display
    body += chunk(b'ANMF', u24(x // 2) + u24(y // 2) + u24(w - 1) + u24(h - 1) + u24(dur) + bytes([0x02]) + data)
open(dest, 'wb').write(b'RIFF' + struct.pack('<I', len(body)) + body)

po = av.open(poster, 'w', format='image2'); ps = po.add_stream('mjpeg')
ps.width, ps.height = W, H; ps.pix_fmt = 'yuvj420p'; ps.options = {'q:v': '3'}
pf = first.reformat(width=W, height=H, format='yuvj420p')
for p in ps.encode(pf): po.mux(p)
for p in ps.encode(None): po.mux(p)
po.close()
print('in', n_in, 'frames', len(frames), 'canvas', W, H, 'bytes', len(body) + 8)
