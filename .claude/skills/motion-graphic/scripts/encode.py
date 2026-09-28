"""Encode a folder of rendered frames (capture.mjs frames) into the files the site and social use.

  encode.py <frames-dir> --fps N [--webp out.webp] [--quality 80] [--threshold 2] [--loop 0]
                                 [--mp4 out.mp4] [--crf 18]
                                 [--poster out.jpg] [--poster-at SECONDS]

--webp    animated WebP for the site, muxed by hand the way add-case-study/scripts/anim.py
          does it: each frame is compared with what the canvas already holds, and only the
          box of pixels that changed is encoded (lossy, no blending), so a still stretch costs
          nothing and no earlier frame ghosts through. Rendered frames carry no noise, so the
          threshold can sit far lower than a screen recording's (2 against anim.py's 12).
--loop    WebP loop count; 0 loops forever (the site's walkthroughs), 1 plays once and stops.
--mp4     H.264 in MP4 for social: yuv420p, BT.709, faststart, no audio track. libx264 if
          PyAV has it, else VideoToolbox on a Mac, else mpeg4 (it says which it used).
--poster  JPEG of one frame (the site shows it before Play and under reduced motion).
          --poster-at picks the time; the default is the last frame, the settled state.

Needs PyAV and numpy, the same as anim.py. Prints one JSON line per file written.
"""
import argparse, io, json, os, struct, sys
from fractions import Fraction

import av
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('frames')
ap.add_argument('--fps', type=float, required=True)
ap.add_argument('--webp'); ap.add_argument('--quality', type=int, default=80)
ap.add_argument('--threshold', type=int, default=2); ap.add_argument('--loop', type=int, default=0)
ap.add_argument('--mp4'); ap.add_argument('--crf', type=int, default=18)
ap.add_argument('--poster'); ap.add_argument('--poster-at', type=float)
a = ap.parse_args()
if not (a.webp or a.mp4 or a.poster):
    sys.exit('nothing to write: pass --webp, --mp4 and/or --poster')

files = sorted(f for f in os.listdir(a.frames) if f.endswith('.png') and f[:-4].isdigit())
if not files:
    sys.exit(f'no numbered PNG frames in {a.frames}')


def load(name):
    with av.open(os.path.join(a.frames, name)) as c:
        rgb = next(c.decode(video=0)).to_ndarray(format='rgb24')
    return rgb[:rgb.shape[0] // 2 * 2, :rgb.shape[1] // 2 * 2]


def frames():
    for f in files:
        yield load(f)


H, W = load(files[0]).shape[:2]
n = len(files)
fps = Fraction(a.fps).limit_denominator(1001)
report = lambda **kw: print(json.dumps(kw))


# ---- Animated WebP ----
def still(rgb, quality):
    """Encode an RGB array as a lossy still and return its image chunk(s), no VP8X header."""
    h, w = rgb.shape[:2]
    buf = io.BytesIO()
    out = av.open(buf, 'w', format='webp')
    s = out.add_stream('libwebp', rate=1)
    s.width, s.height, s.pix_fmt = w, h, 'yuv420p'
    s.options = {'quality': str(quality), 'compression_level': '6'}
    fr = av.VideoFrame.from_ndarray(np.ascontiguousarray(rgb), format='rgb24').reformat(format='yuv420p')
    for p in s.encode(fr): out.mux(p)
    for p in s.encode(None): out.mux(p)
    out.close()
    data = buf.getvalue()
    assert data[:4] == b'RIFF' and data[8:12] == b'WEBP', data[:12]
    pos, chunks = 12, b''
    while pos < len(data):
        tag, size = data[pos:pos + 4], struct.unpack('<I', data[pos + 4:pos + 8])[0]
        if tag in (b'VP8 ', b'VP8L', b'ALPH'): chunks += data[pos:pos + 8 + size + (size & 1)]
        pos += 8 + size + (size & 1)
    return chunks


def chunk(tag, body):
    return tag + struct.pack('<I', len(body)) + body + (b'\0' if len(body) & 1 else b'')


def u24(v): return struct.pack('<I', v)[:3]


if a.webp:
    # Exact frame times in ms, so 30 fps doesn't drift to 33 ms a frame (a 1% slow clip).
    edge = [round(1000 * i / fps) for i in range(n + 1)]
    canvas, out = None, []
    for i, rgb in enumerate(frames()):
        ms = edge[i + 1] - edge[i]
        if canvas is None:
            canvas = rgb.copy()
            out.append([0, 0, W, H, ms, still(rgb, a.quality)])
            continue
        moved = np.abs(rgb.astype(np.int16) - canvas.astype(np.int16)).max(axis=2) > a.threshold
        ys, xs = np.nonzero(moved)
        if len(ys) == 0:
            out[-1][4] += ms
            continue
        x0, x1 = int(xs.min()) // 2 * 2, min(W, (int(xs.max()) + 2) // 2 * 2)
        y0, y1 = int(ys.min()) // 2 * 2, min(H, (int(ys.max()) + 2) // 2 * 2)
        canvas[y0:y1, x0:x1] = rgb[y0:y1, x0:x1]
        out.append([x0, y0, x1 - x0, y1 - y0, ms, still(rgb[y0:y1, x0:x1], a.quality)])
    body = b'WEBP' + chunk(b'VP8X', bytes([0x02, 0, 0, 0]) + u24(W - 1) + u24(H - 1))
    body += chunk(b'ANIM', struct.pack('<I', 0xFFFFFFFF) + struct.pack('<H', a.loop))
    for x, y, w, h, dur, data in out:
        # a frame longer than the 24-bit duration field allows is split into holds
        while dur > 0xFFFFFF:
            body += chunk(b'ANMF', u24(x // 2) + u24(y // 2) + u24(w - 1) + u24(h - 1) + u24(0xFFFFFF) + bytes([0x02]) + data)
            dur -= 0xFFFFFF
        # flags 0x02: do not blend (replace the rectangle), keep it after display
        body += chunk(b'ANMF', u24(x // 2) + u24(y // 2) + u24(w - 1) + u24(h - 1) + u24(dur) + bytes([0x02]) + data)
    with open(a.webp, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', len(body)) + body)
    report(file=a.webp, width=W, height=H, frames_in=n, frames_out=len(out),
           seconds=round(n / float(fps), 3), loop=a.loop, bytes=os.path.getsize(a.webp))


# ---- MP4 (H.264) ----
if a.mp4:
    enc = next((c for c in ('libx264', 'h264_videotoolbox', 'mpeg4') if c in av.codecs_available), None)
    if not enc:
        sys.exit('this PyAV has no H.264 or MPEG-4 encoder')
    with av.open(a.mp4, 'w', options={'movflags': '+faststart'}) as c:
        s = c.add_stream(enc, rate=fps)
        s.width, s.height, s.pix_fmt = W, H, 'yuv420p'
        cc = s.codec_context
        try:  # tag BT.709, limited range; an older PyAV can't, and the file is then untagged
            cc.color_primaries, cc.color_trc, cc.colorspace, cc.color_range = 1, 1, 1, 1
            tagged = True
        except (AttributeError, TypeError, ValueError):
            tagged = False
        if enc == 'libx264':
            s.options = {'crf': str(a.crf), 'preset': 'slow', 'profile': 'high', 'tune': 'animation'}
        else:
            cc.bit_rate = 8_000_000
        for rgb in frames():
            fr = av.VideoFrame.from_ndarray(rgb, format='rgb24')
            try:
                fr = fr.reformat(format='yuv420p', dst_colorspace='ITU709', dst_color_range='MPEG')
            except TypeError:
                fr, tagged = fr.reformat(format='yuv420p'), False
            for p in s.encode(fr): c.mux(p)
        for p in s.encode(None): c.mux(p)
    report(file=a.mp4, encoder=enc, bt709=tagged, width=W, height=H, frames=n, fps=float(fps),
           seconds=round(n / float(fps), 3), bytes=os.path.getsize(a.mp4))


# ---- Poster ----
if a.poster:
    i = n - 1 if a.poster_at is None else max(0, min(n - 1, round(a.poster_at * float(fps))))
    with av.open(a.poster, 'w', format='image2') as c:
        s = c.add_stream('mjpeg')
        s.width, s.height, s.pix_fmt = W, H, 'yuvj420p'
        s.options = {'q:v': '3'}
        fr = av.VideoFrame.from_ndarray(load(files[i]), format='rgb24').reformat(format='yuvj420p')
        for p in s.encode(fr): c.mux(p)
        for p in s.encode(None): c.mux(p)
    report(file=a.poster, frame=i, seconds=round(i / float(fps), 3), width=W, height=H, bytes=os.path.getsize(a.poster))
