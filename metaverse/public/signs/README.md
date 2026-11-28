# Signs

Designed in Adobe Express (HTML authored with the Adobe for creativity connector, font: Source Han
Sans Korean from Adobe Fonts), exported from Express as PNG and converted to WebP.

| File | Size | Used on |
|---|---|---|
| `gate.webp` | 1600×400 | School name plate over the main gate (`School.tsx`, `ImageSign`) |
| `park.webp` | 1800×240 | 서울대공원 entrance arch (`Park.tsx`) |
| `rooms/rNNN.webp` | 704×150 each, 105 files | Room nameplates above doors (`Interior.tsx`), looked up by room name in `src/roomPlates.ts` |

Nameplates were made as 4 Express documents (27 slides each); large docs time out as PNG export, so
they were exported as PDF and rendered to images with `pdftoppm`. A room added later without an
image simply keeps the text sign (add a plate the same way and a line to `roomPlates.ts`).

Only the rendered images are shipped (no font files). To change a sign, edit the Express document
(or the HTML source kept with the project notes), export PNG again and replace the file.
