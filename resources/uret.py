#!/usr/bin/env python3
"""Android simge ve açılış ekranı kaynaklarını üretir (kaynak: resources/icon.svg).

Masaüstü takım simgesiyle aynı geometri: lacivert degrade yuvarlak kare + mavi/yeşil/turuncu
çubuklar. Uyarlanabilir simge ve açılış simgesi vektör (XML) olarak, eski Android (7.x) için
mipmap PNG'leri PIL ile (8x örnekleyip küçülterek, kenar yumuşatmalı) yazılır.

Kullanım (depo kökünde):  python3 resources/uret.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

KOK = Path(__file__).resolve().parent.parent
RES = KOK / "android/app/src/main/res"

# 64 birimlik masaüstü çizimi: karo (2,2)-(62,62) r=14, çubuklar x=13 g=38 y=15/28/41 h=8 r=2.5
UST, ALT = "#4a4aa6", "#30307a"
CUBUKLAR = [(15, "#6d9bff"), (28, "#48c98a"), (41, "#ff8a66")]
KARO, KARO_R = (2, 60), 14
CUBUK_X, CUBUK_G, CUBUK_H, CUBUK_R = 13, 38, 8, 2.5


def f(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


def rr(x: float, y: float, w: float, h: float, r: float) -> str:
    """Yuvarlak köşeli dikdörtgen yolu (vector drawable pathData)."""
    return (
        f"M{f(x + r)},{f(y)}h{f(w - 2 * r)}a{f(r)},{f(r)} 0 0 1 {f(r)},{f(r)}"
        f"v{f(h - 2 * r)}a{f(r)},{f(r)} 0 0 1 {f(-r)},{f(r)}"
        f"h{f(-(w - 2 * r))}a{f(r)},{f(r)} 0 0 1 {f(-r)},{f(-r)}"
        f"v{f(-(h - 2 * r))}a{f(r)},{f(r)} 0 0 1 {f(r)},{f(-r)}z"
    )


def cubuk_yollari(ox: float, oy: float, s: float, renkli=True) -> str:
    """Karo başlangıcı (ox,oy) ve ölçek s ile çubuk <path> öğeleri."""
    out = []
    for y, renk in CUBUKLAR:
        d = rr(ox + (CUBUK_X - KARO[0]) * s, oy + (y - KARO[0]) * s, CUBUK_G * s, CUBUK_H * s, CUBUK_R * s)
        out.append(f'    <path android:fillColor="{renk if renkli else "#FFFFFFFF"}" android:pathData="{d}" />')
    return "\n".join(out)


def vektor(boyut: int, govde: str, aapt=False) -> str:
    ns = ' xmlns:aapt="http://schemas.android.com/aapt"' if aapt else ""
    # Açılış simgesi kuralı 288 dp tuval ister; yalnız açılışta bir kez çizilir.
    if boyut > 200:
        ns += ' xmlns:tools="http://schemas.android.com/tools"\n    tools:ignore="VectorRaster"'
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<!-- resources/uret.py ile üretildi; elle değiştirmeyin. -->\n"
        f'<vector xmlns:android="http://schemas.android.com/apk/res/android"{ns}\n'
        f'    android:width="{boyut}dp"\n    android:height="{boyut}dp"\n'
        f'    android:viewportWidth="{boyut}"\n    android:viewportHeight="{boyut}">\n{govde}\n</vector>\n'
    )


def degrade(y1: float, y2: float) -> str:
    return (
        "        <aapt:attr name=\"android:fillColor\">\n"
        f'            <gradient android:type="linear" android:startX="0" android:startY="{f(y1)}" android:endX="0" android:endY="{f(y2)}"'
        f' android:startColor="{UST}" android:endColor="{ALT}" />\n'
        "        </aapt:attr>"
    )


def yaz(yol: Path, metin: str):
    yol.parent.mkdir(parents=True, exist_ok=True)
    yol.write_text(metin, encoding="utf-8")


def vektorler():
    d = RES / "drawable"
    # Uyarlanabilir simge: 108 dp katman, görünen alan ortadaki 72 dp (18..90); karo görünen alanın tamamı.
    s = 72 / KARO[1]
    yaz(d / "ic_launcher_background.xml", vektor(108, f'    <path android:pathData="M0,0h108v108h-108z">\n{degrade(18, 90)}\n    </path>', aapt=True))
    yaz(d / "ic_launcher_foreground.xml", vektor(108, cubuk_yollari(18, 18, s)))
    yaz(d / "ic_launcher_monochrome.xml", vektor(108, cubuk_yollari(18, 18, s, renkli=False)))
    # Açılış simgesi (Android 12+ ve core-splashscreen): 288 dp tuval, 192 dp çaplı daireye sığan karo.
    k = 144
    o = (288 - k) / 2
    ks = k / KARO[1]
    karo = f'    <path android:pathData="{rr(o, o, k, k, KARO_R * ks)}">\n{degrade(o, o + k)}\n    </path>'
    yaz(d / "ic_splash.xml", vektor(288, karo + "\n" + cubuk_yollari(o, o, ks), aapt=True))

    adaptif = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@drawable/ic_launcher_background" />\n'
        '    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n'
        '    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n'
        "</adaptive-icon>\n"
    )
    for ad in ("ic_launcher", "ic_launcher_round"):
        yaz(RES / "mipmap-anydpi-v26" / f"{ad}.xml", adaptif)


def hex_rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def degrade_resim(w: int, h: int, y1: float, y2: float) -> Image.Image:
    a, b = hex_rgb(UST), hex_rgb(ALT)
    img = Image.new("RGBA", (w, h))
    px = ImageDraw.Draw(img)
    for y in range(h):
        t = min(1.0, max(0.0, (y - y1) / max(1.0, y2 - y1)))
        px.line([(0, y), (w, y)], fill=tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,))
    return img


def png(boyut: int, bicim: str) -> Image.Image:
    """bicim: kare (yuvarlak köşeli karo), daire (yuvarlak simge), tam (mağaza: tam dolu kare)."""
    S = 8
    n = boyut * S
    if bicim == "kare":
        x0, w, r = n * KARO[0] / 64, n * KARO[1] / 64, n * KARO_R / 64
        maske = Image.new("L", (n, n), 0)
        ImageDraw.Draw(maske).rounded_rectangle([x0, x0, x0 + w, x0 + w], radius=r, fill=255)
        ox, s = x0, w / KARO[1]
    else:
        # Daire/mağaza: karo tüm tuval; çubuklar uyarlanabilir simgedeki oranda (genişliğin %63'ü).
        maske = Image.new("L", (n, n), 0 if bicim == "daire" else 255)
        if bicim == "daire":
            ImageDraw.Draw(maske).ellipse([0, 0, n - 1, n - 1], fill=255)
        ox, s = 0, n / KARO[1]
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    img.paste(degrade_resim(n, n, ox, ox + KARO[1] * s), (0, 0), maske)
    cizim = ImageDraw.Draw(img)
    for y, renk in CUBUKLAR:
        bx, by = ox + (CUBUK_X - KARO[0]) * s, ox + (y - KARO[0]) * s
        cizim.rounded_rectangle([bx, by, bx + CUBUK_G * s, by + CUBUK_H * s], radius=CUBUK_R * s, fill=hex_rgb(renk) + (255,))
    return img.resize((boyut, boyut), Image.LANCZOS)


def mipmaplar():
    for yog, boyut in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        klasor = RES / f"mipmap-{yog}"
        klasor.mkdir(parents=True, exist_ok=True)
        png(boyut, "kare").save(klasor / "ic_launcher.png", optimize=True)
        png(boyut, "daire").save(klasor / "ic_launcher_round.png", optimize=True)
    png(512, "tam").convert("RGB").save(KOK / "resources/play-store-icon-512.png", optimize=True)


if __name__ == "__main__":
    vektorler()
    mipmaplar()
    print("Simgeler üretildi:", RES)
