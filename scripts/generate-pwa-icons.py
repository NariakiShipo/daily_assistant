#!/usr/bin/env python3
"""
從 assets/icon.png 產生 PWA 用的各尺寸圖示。

為什麼需要:Expo 的網頁匯出只會產出一個 48x48 的 favicon.ico。加到主畫面時
瀏覽器找不到 manifest 的 icons,只能拿那個 48px 放大到約 192px 顯示,結果就是糊的。

產出(放在 public/,Expo 匯出時會原樣複製到 dist/):
  icons/icon-192.png            一般用途
  icons/icon-512.png            一般用途(高解析)
  icons/icon-maskable-512.png   Android 會套遮罩,圖案要縮在安全區內
  icons/apple-touch-icon.png    iOS 加到主畫面用(180x180)

來源限制:icon.png 是從更大的設計稿裁切的,上緣有一條粉色 band。那條 band 與
小熊頭上的愛心重疊,沒有任何水平裁切能只去掉 band 而不切到愛心,所以改用從
上緣做有界的 flood fill(愛心是不同色調的粉,會擋住填色)。

需要 Pillow:  pip3 install Pillow
用法:        python3 scripts/generate-pwa-icons.py
"""
from collections import deque
from pathlib import Path
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('需要 Pillow:pip3 install Pillow')

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'icon.png'
OUT = ROOT / 'public' / 'icons'

BAND = (238, 135, 180)   # 頂部那條粉色 band 的顏色
# flood fill 的縱向上限:band 最深約 y=404,小熊耳朵約從 y=470 起,
# 限制在這條線內才不會讓填色蔓延進小熊本體
FILL_LIMIT = 430

WHITE = (255, 255, 255, 255)


def near(c, target, tol=22):
    return all(abs(c[i] - target[i]) <= tol for i in range(3))


def load_artwork():
    """讀入來源圖,清掉頂部 band,回傳裁切到內容範圍的圖。"""
    src = Image.open(SRC).convert('RGBA')
    W, H = src.size
    px = src.load()

    # 從上緣往下 flood fill band 色 → 白
    q = deque()
    seen = set()
    for x in range(W):
        if near(px[x, 0][:3], BAND):
            q.append((x, 0))
            seen.add((x, 0))
    while q:
        x, y = q.popleft()
        px[x, y] = WHITE
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny <= FILL_LIMIT and (nx, ny) not in seen:
                if near(px[nx, ny][:3], BAND):
                    seen.add((nx, ny))
                    q.append((nx, ny))

    # 找出實際內容範圍(排除純白背景與淡粉色設計格線)
    def is_content(c):
        r, g, b = c[:3]
        if r > 245 and g > 245 and b > 245:
            return False
        if r > 243 and g > 205 and b > 218:   # 淡粉格線
            return False
        return True

    xs, ys = [], []
    for y in range(0, H, 3):
        for x in range(0, W, 3):
            if is_content(px[x, y]):
                xs.append(x)
                ys.append(y)
    return src.crop((min(xs), min(ys), max(xs), max(ys)))


def render(art, size, coverage):
    """把圖案依 coverage 比例置中放到白底正方形上。"""
    canvas = Image.new('RGBA', (size, size), WHITE)
    box = int(size * coverage)
    scale = box / max(art.size)
    w, h = int(art.size[0] * scale), int(art.size[1] * scale)
    canvas.paste(art.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2),
                 art.resize((w, h), Image.LANCZOS))
    return canvas


def main():
    art = load_artwork()
    OUT.mkdir(parents=True, exist_ok=True)

    # maskable 的安全區是「直徑 80% 的圓」,取 0.72 讓四個角也不會被切到
    targets = [
        ('icon-192.png', 192, 0.88),
        ('icon-512.png', 512, 0.88),
        ('icon-maskable-512.png', 512, 0.72),
        ('apple-touch-icon.png', 180, 0.88),
    ]
    for name, size, coverage in targets:
        render(art, size, coverage).save(OUT / name)
        print(f'  {name:26} {size}x{size}  圖案佔 {coverage:.0%}')

    print(f'\n完成,輸出於 {OUT.relative_to(ROOT)}/')


if __name__ == '__main__':
    main()
