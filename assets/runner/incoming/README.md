# Incoming avatar art (Trail Studio › Avatares)

New bodies (`bodies/`) and heads (`heads/`) uploaded by the owner from Trail Studio, as PNG on the
runner's 1024 × 1536 transparent canvas. Nothing here reaches the game: the art script
(`scripts/prepare_avatar_art.py`) and the game read `assets/runner/bodies`, `assets/runner/heads`
and `assets/runner/avatar` only.

Claude prepares each batch when the owner asks: names the files as the game expects
(`men_body_NN_toneT.png`, `lvl{L}_{men|women}_head_NN_toneT.png`), moves them to `bodies/` or
`heads/`, adds them to the catalogs and removes them from here.
