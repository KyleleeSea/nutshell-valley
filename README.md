# 🐿️ Nutshell Valley

A Sims-style life sim for **two players**, where everyone is a squirrel. One shared lot with a little house, one shared acorn wallet, one bond meter between the pair.

**Play it:** open the GitHub Pages site, make your squirrel, name your den, press **Copy invite link** and send it to one friend. No server to run.

## How the multiplayer works

The game is peer-to-peer. The first player to open a den hosts the simulation in their own browser tab; the second player connects to them directly over WebRTC (PeerJS handles the handshake). A den holds exactly two squirrels. The den is saved in the host's browser, the guest keeps a copy too, and if the host leaves the guest takes over hosting from where things left off.

The first few seconds after opening a den are spent claiming it; the control panel's badge says whether you are hosting or connected to your den-mate.

## How to play

- **Live mode**: click the ground to walk, click furniture for its actions (sleep, shower, cook, watch Nutflix, day-trade acorns…), click your den-mate to chat, nuzzle, joke, play tag or share a snack.
- **Needs**: Hunger, Comfort, Hygiene, Bladder, Energy, Fun, Social, shown as bars under your portrait. The acorn-shaped plumbob over your head turns from green to red with your mood.
- **Free will**: leave it on and your squirrel looks after itself while you are busy.
- **Buy mode** (`U`): furniture by category, bought from the shared wallet. `R` rotates, Esc cancels, the Sell tool refunds 60%.
- **Build mode** (`B`): drag to build walls, click walls to add doors and windows or paint wallpaper, drag to lay floors, plant trees in the Garden tab, bulldoze anything.
- **Walls**: `H` cycles cutaway / up / down.
- **Acorns**: forage at the Great Oak, work a shift at the Nut Exchange, day-trade on the Nutbook, or sell paintings from the easel.
- **Bond**: every social action, and using the same object at the same time, grows the pair from Strangers to Soulmates.
- **Skills**: Foraging, Cooking, Logic, Creativity, Music, Charisma and Hustle level up as you use them.
- **Camera**: drag to pan, wheel to zoom, WASD/arrows to pan, `F` to find yourself, `Enter` to chat.
- A day is 12 real minutes; lamps and screens light the house at night.

To try both squirrels in one browser, open a second tab with `&guest` added to the den link.

## Hosting

The whole game is the static `docs/` folder, published with GitHub Pages (Settings → Pages → branch `main`, folder `/docs`). To develop locally, any static file server works; `npm start` serves it on http://localhost:3000. Peer-to-peer play still needs internet access for the PeerJS handshake.
