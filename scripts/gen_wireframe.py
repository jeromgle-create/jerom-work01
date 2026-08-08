from PIL import Image, ImageDraw, ImageFont

W, H = 900, 1150
BG = (255, 255, 255)
LINE = (60, 60, 60)
GRAY = (150, 150, 150)
LIGHT = (225, 225, 225)
FILL = (240, 240, 240)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)

font_dir = "C:/Windows/Fonts/"
label = ImageFont.truetype(font_dir + "malgunbd.ttf", 20)
small = ImageFont.truetype(font_dir + "malgun.ttf", 16)
title = ImageFont.truetype(font_dir + "malgunbd.ttf", 26)


def bar(x, y, w, h, fill=FILL, outline=LINE, width=2, radius=4):
    d.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill, outline=outline, width=width)


def pill(x, y, w, h, outline=LINE, width=2):
    d.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, outline=outline, width=width)


# page title
d.text((40, 24), "WIREFRAME — intro.html", font=title, fill=LINE)
d.text((40, 58), "low-fidelity layout reference, not final visual design", font=small, fill=GRAY)

card_x, card_y, card_w = 60, 100, W - 120

# tab
pill(card_x + 24, card_y - 16, 110, 32)
d.text((card_x + 44, card_y - 8), "PROFILE", font=small, fill=LINE)

cx = card_x + 40
cy = card_y + 50
inner_w = card_w - 80

# name
bar(cx, cy, 320, 40, fill=LIGHT)
d.text((cx + 8, cy + 10), "NAME (H1)", font=small, fill=GRAY)
cy += 56

# role
bar(cx, cy, 200, 22)
d.text((cx + 8, cy + 2), "role", font=small, fill=GRAY)
cy += 40

# oneliner (2 lines)
bar(cx, cy, inner_w, 16)
cy += 22
bar(cx, cy, inner_w - 120, 16)
cy += 40

# divider
d.line([cx, cy, cx + inner_w, cy], fill=LIGHT, width=2)
cy += 30

# career section
d.text((cx, cy), "경력 (LABEL)", font=label, fill=LINE)
cy += 34
for i in range(3):
    d.ellipse([cx - 4, cy + 4, cx + 8, cy + 16], outline=LINE, width=2)
    bar(cx + 24, cy, 140, 16, fill=None)
    bar(cx + 24, cy + 22, inner_w - 160, 18, fill=LIGHT)
    cy += 54
cy += 10

# projects section
d.text((cx, cy), "프로젝트 (LABEL)", font=label, fill=LINE)
cy += 34
for i in range(2):
    bar(cx, cy, inner_w, 64, fill=None)
    bar(cx + 12, cy + 12, 220, 18, fill=LIGHT)
    bar(cx + 12, cy + 36, inner_w - 40, 14, fill=LIGHT)
    cy += 78
cy += 10

# skills section
d.text((cx, cy), "기술 스택 (LABEL)", font=label, fill=LINE)
cy += 34
px = cx
tag_w = [90, 110, 80, 95, 70, 60]
for w in tag_w:
    if px + w > cx + inner_w:
        px = cx
        cy += 44
    pill(px, cy, w, 34)
    px += w + 12
cy += 60

# contact section
d.text((cx, cy), "연락처 (LABEL)", font=label, fill=LINE)
cy += 34
px = cx
for w in [90, 100, 110]:
    pill(px, cy, w, 40)
    px += w + 12
cy += 70

card_bottom = cy + 40
d.rounded_rectangle([card_x, card_y, card_x + card_w, card_bottom], radius=6, outline=LINE, width=2)

# footer note (outside card)
note_y = card_bottom + 30
bar((W - 420) // 2, note_y, 420, 16, fill=LIGHT)
d.text(((W - 220) // 2, note_y + 24), "note (centered caption)", font=small, fill=GRAY)

img = img.crop((0, 0, W, note_y + 60))

out_path = "C:/Users/user/jerom-work01/wireframe.png"
img.save(out_path)
print("saved", out_path, img.size)
