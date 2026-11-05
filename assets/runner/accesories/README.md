# Accessories (owner art)

Backpacks, poles, gels and bars. Each PNG on the same 1024 × 1536 transparent canvas as the runner
(as `lvl1_back_01.png`), drawn where it sits on the body. GitHub's CI turns each file into:

- `assets/runner/avatar/accessories/{name}.webp`: the layer worn on the runner;
- `assets/ui/equipment/{name}.webp`: the shop picture (the drawn part, centred on a square).

Then name them in `src/data/equipment.csv`: `avatar_layer` = `accessories/{name}.webp` (for things
worn: backpacks, poles) and `thumbnail` = `{name}.webp` (any item, gels and bars included).

Backpacks drawn for each body (owner request, 5 November 2026): `lvl{L}_men_back_{NN}.png` and
`lvl{L}_women_back_{NN}.png`. The table names them once with `{sex}`, e.g. `accessories/lvl1_{sex}_back_01.webp`
(and `thumb_lvl1_{sex}_back_01.png`); while there is no women file the men one is used.

A picture of any other size (as `lvl1_gels_01.png`) is not worn on the runner: it only becomes the
shop picture.

New shirts go in `assets/runner/Clothing` (`lvl{L}_{men|women}_shirt_{NN}.png`) and also need a line
with their display name in `src/domain/athlete/shirtFiles.ts`.
