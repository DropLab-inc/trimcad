# The fonts shipped with TrimCAD

Every face in this directory is licensed under the **SIL Open Font License, Version 1.1**, which
permits use, modification and redistribution (including in a commercial product) and requires that the
font is not sold on its own and that this notice travels with it. The licence text is at
<https://openfontlicense.org/> and in each family's own repository.

TrimCAD embeds these files in the PDFs it plots and loads the same files on the canvas, so a drawing's
typography is the same on screen and on paper. A drawing that uses none of them downloads none of
them: the faces are fetched by the browser only when something is drawn with them, and the plot only
fetches the faces the drawing names.

| File | Face | Copyright |
| --- | --- | --- |
| `inter*.ttf` | Inter | Copyright 2020 The Inter Project Authors (<https://github.com/rsms/inter>) |
| `lora*.ttf` | Lora | Copyright 2011 The Lora Project Authors (<https://github.com/cyrealtype/Lora-Cyrillic>), with Reserved Font Name "Lora" |
| `roboto-mono*.ttf` | Roboto Mono | Copyright 2015 The Roboto Mono Project Authors (<https://github.com/googlefonts/robotomono>) |
| `oswald*.ttf` | Oswald | Copyright 2016 The Oswald Project Authors (<https://github.com/googlefonts/OswaldFont>) |

Files were fetched as TrueType from Google Fonts' CSS API; the same files are read by
`scripts/generate-text-metrics.mjs`, which measures them through jsPDF so the wrap and the plot agree.

The other faces the app offers (Helvetica, Times, Courier and their bold/italic forms) are jsPDF's five
standard PDF fonts. Nothing is downloaded for them: PDF readers supply the family themselves, and the
canvas uses the metric-compatible system stack (Arial, Times New Roman, Courier New).
