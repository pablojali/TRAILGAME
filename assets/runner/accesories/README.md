# Accessories (owner art)

Backpacks, poles, gels and bars. Each PNG on the same 1024 × 1536 transparent canvas as the runner
(as `lvl1_back_01.png`), drawn where it sits on the body. GitHub's CI turns each file into:

- `assets/runner/avatar/accessories/{name}.webp`: the layer worn on the runner;
- `assets/ui/equipment/{name}.webp`: the shop picture (the drawn part, centred on a square).

Then name them in `src/data/equipment.csv`: `avatar_layer` = `accessories/{name}.webp` (for things
worn: backpacks, poles) and `thumbnail` = `{name}.webp` (any item, gels and bars included).
