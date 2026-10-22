"""紹介サイト用の画面例を作る（開発者用・任意）。Playwright（Python）が必要。
  python3 tools/screens.py   → docs/screens/ に life.jpg・freelance.jpg・user.jpg・hero.gif を作る（中身は架空のサンプル）
"""
import io, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'screens'; OUT.mkdir(parents=True, exist_ok=True)
def page(b, ed, w=1280, h=860):
    c = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1); p = c.new_page()
    p.goto((ROOT / 'dist' / f'komorebi-{ed}.html').as_uri()); p.wait_for_selector('dialog.dlg')
    p.click('dialog.dlg >> text=サンプルを見てみる'); p.wait_for_timeout(200); return c, p
def save_jpg(png, name, width=900):
    im = Image.open(io.BytesIO(png)).convert('RGB'); r = width / im.width
    im.resize((width, int(im.height * r)), Image.LANCZOS).save(OUT / name, 'JPEG', quality=78, optimize=True, progressive=True)
with sync_playwright() as pw:
    b = pw.chromium.launch()
    c, p = page(b, 'life'); p.evaluate("location.hash='#health'"); p.wait_for_timeout(250)
    save_jpg(p.locator('.overlay-card').screenshot(), 'life.jpg'); c.close()
    c, p = page(b, 'freelance'); p.evaluate("location.hash='#tax'"); p.wait_for_timeout(250)
    save_jpg(p.locator('.import-card').screenshot(), 'freelance.jpg'); c.close()
    c, p = page(b, 'user', 420, 900); p.wait_for_timeout(150)
    save_jpg(p.locator('.step-card').first.screenshot(), 'user.jpg', 420); c.close()
    # 動きの見本：ホーム → 体調を記録 → 重ね合わせ → ふりかえり
    c, p = page(b, 'life', 1100, 720); frames = []
    def snap(): frames.append(Image.open(io.BytesIO(p.screenshot())).convert('RGB').resize((770, 504), Image.LANCZOS))
    p.evaluate("document.querySelector('.today-card').scrollIntoView()"); p.wait_for_timeout(150); snap()
    p.locator('.today-card .health-choice.good').click(); p.wait_for_timeout(250); p.evaluate("document.querySelector('.today-card').scrollIntoView()"); snap()
    p.evaluate("location.hash='#health'"); p.wait_for_timeout(250); p.evaluate("document.querySelector('.overlay-card').scrollIntoView()"); snap()
    p.evaluate("Review.open('month')"); p.wait_for_timeout(300); snap(); c.close()
    pal = [f.convert('P', palette=Image.ADAPTIVE, colors=96) for f in frames]
    pal[0].save(OUT / 'hero.gif', save_all=True, append_images=pal[1:], duration=[2200, 2200, 3000, 3200], loop=0, optimize=True)
    b.close()
print('ok', sorted(x.name for x in OUT.iterdir()))
