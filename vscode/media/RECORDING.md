# Recording the README media

This folder holds the images shown in the Marketplace README. The current files
are **placeholders** — replace them with real captures before (or shortly after)
publishing. Filenames must stay the same, except swap the two demo `.png`
placeholders for `.gif` recordings and update the two `<img src>` lines in
`../README.md`.

| File | What to capture | Suggested size |
| --- | --- | --- |
| `demo.gif` | Hero: opening a stale `AGENTS.md`, squiggles appear, Problems panel fills | ~800px wide |
| `quickfix.gif` | Triggering the lightbulb on a `stale-command` and applying the fix | ~800px wide |
| `screenshot-problems.png` | The Problems panel listing findings | ~960px wide |
| `screenshot-inline.png` | A red squiggle + hover on a stale command in the editor | ~960px wide |
| `screenshot-statusbar.png` | The `$(warning) Context Check: N` status bar item | crop tight |

## 1. Test the extension locally first

You record against the real extension running in an **Extension Development Host**.

1. Open the `vscode/` folder in VS Code:
   ```bash
   code /Users/jubinsoni/Documents/GitHub/contextcheck/vscode
   ```
2. Make sure it's built (the debug launch does this, but to be safe):
   ```bash
   npm install && npm run build
   ```
3. Press **F5** (Run → Start Debugging). A second VS Code window titled
   **[Extension Development Host]** opens with your extension loaded.
4. In that window, **open a folder that has an `AGENTS.md` with intentional
   mistakes** so there's something to show. A ready-made one lives at
   `../demo-workspace/` (created for exactly this).
5. Open `AGENTS.md`. You should see squiggles, Problems-panel entries, and the
   status bar item. Try the lightbulb (⌘.) on a stale command.

> Any code change: save, then click the **↻ Restart** button in the debug
> toolbar of the *first* window to reload the host.

## 2. Record the GIFs

Good free options on macOS:

- **Kap** (`brew install --cask kap`) — the easiest; records a screen region
  straight to GIF, with a size/fps cap. Recommended.
- **Gifox** — polished, paid.
- **QuickTime** (built in) records `.mov`; convert with
  `ffmpeg -i in.mov -vf "fps=12,scale=800:-1:flags=lanczos" out.gif`.

Tips for a clean capture:
- Bump the editor font size (⌘+) so text is readable in a small GIF.
- Use a light or high-contrast theme; hide the minimap and other panels.
- Keep it short (5–10s) and loop-friendly — start and end on the same view.
- Cap width at ~800px and fps at ~12 to keep the file small (< 5 MB; the
  Marketplace is happier with lean media).

## 3. Screenshots

Use **⌘⇧4** then **Space** to capture a window, or **⌘⇧4** to drag a region.
Crop tightly. Save with the exact filenames above (PNG).

## 4. Swap them in

- Replace the placeholder files here with your captures.
- In `../README.md`, change `media/demo.png` → `media/demo.gif` and
  `media/quickfix.png` → `media/quickfix.gif`.
- Re-run `npx @vscode/vsce package --no-dependencies` to confirm they're bundled,
  then bump the version and `vsce publish`.
