# Ghost in the Mesh: Red vs. Blue

A pixel-art, turn-based browser game about breaking into a network and then defending it against yourself.

Each run has two halves. As **Red** you start on the internet and work your way to the customer database. Then you switch sides: as **Blue** you direct three agents (Scout, Analyst, Guard) against an AI attacker that replays the exact path you just used, and looks for another way in whenever you block it.

Every host, log line and attack is simulated. There is no real exploit code in this repository.

![Gameplay GIF](docs/gameplay.gif)

> _Placeholder: record a short GIF (see [Recording the GIF](#recording-the-gif)) and save it as `docs/gameplay.gif`._

**Play it:** `https://rootviking.github.io/Ghost-in-the-mesh-/` _(live once GitHub Pages is enabled, see below)_

## How to run it

No install and no build step.

1. Download or clone the repository.
2. Open `index.html` in a browser.

If you prefer a local server (optional):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## How to play

| | Mouse | Keyboard |
|---|---|---|
| Select a node | Click it on the map | `Tab` or arrow keys |
| Difficulty (title screen) | Click EASY / NORMAL / HARD | Left / right arrows |
| Red actions | Click the button | `1` scan, `2` exploit, `3` escalate, `4` pivot, `5` lie low |
| Blue actions | Click the button | `1` scout, `2` analyst, `3` patch, `4` firewall, `5` rotate, `6` isolate, `7` tripwire, `Enter` end turn |
| Codex / help | Top-right buttons | `C` / `H` |
| Expand the terminal | EXPAND button | `T` |
| Music on/off | MUSIC button | `B` |
| Sound effects on/off | SOUND button | `M` |

**Red phase.** Reach DB-01 in as few turns and with as little noise as you can. Noisy actions fill the detection meter; at 100% you are caught. **Lie low** spends a turn to cool the meter down, but the AI will copy that pause later, which hands the defender a free turn.

**Blue phase.** Each turn, give one order to each agent, then end the turn and the attacker moves once.

- **Scout** reads one node's logs and flags anomalies. This is the only way to see where the attacker is.
- **Analyst** names the technique behind an anomaly (with its ATT&CK ID), reveals the weakness so it can be patched, and forecasts the attacker's next move.
- **Guard** patches a known weakness, firewalls a port, rotates a credential, isolates a node, or plants a **tripwire** (a canary that raises an instant alert when the attacker touches that node).

Hold until the turn counter runs out, or leave the attacker with no route, and the network survives.

**Difficulty.** EASY, NORMAL and HARD change how loud your attacks are, how big a head start the AI gets, how long you must hold, and the score multiplier.

**Badges and best score.** Eight badges (for example GHOST, GOTCHA, IRON WALL) and your best score are saved in the browser and shown on the title and end screens.

**Music.** A looping chiptune generated in code with the Web Audio API. Toggle it with the MUSIC button or `B`; the choice is remembered.

**The terminal explains everything.** Each time you or the attacker acts, the terminal under the map prints the command a real operator would run, what it does, why you would do it, the result, and what it cost (Red) or what it does not do (Blue). Attack steps are described, not implemented.

**Typed commands.** Port scans, log hunts and firewall rules open a terminal where you type the real command (`nmap`, `grep`, `ufw`). Hover over the example to see what each part does. Reasonable variations are accepted.

## Architecture

Plain HTML, CSS and JavaScript with an HTML5 Canvas. No framework, no bundler. Files are ordinary `<script>` tags that attach to one global object, `GM`, so the game works when `index.html` is opened straight from disk.

```
index.html            Page layout, overlay screens, script order
css/style.css         Dark terminal theme, pixel fonts, report styling
js/
  data-network.js     The level: nodes, edges, weaknesses, credentials
  data-codex.js       Codex cards (one per ATT&CK technique) + unlock tracking
  data-logs.js        Simulated log evidence per technique
  data-commands.js    The three typed commands: validators and explanations
  data-explain.js     Terminal explanations for every action (command, what, why, limits)
  rules.js            Attack rules shared by the player and the AI
  state.js            The single game-state object, difficulty table, saved settings
  red.js              Red phase: detection meter, turn count, move history
  ai.js               AI attacker: replay, belief model, BFS re-planning
  blue.js             Blue phase: Scout, Analyst, Guard, turn loop
  terminal.js         Terminal mini-game window
  map.js              Canvas renderer: shaded, outlined pixel sprites built in code
  report.js           Score and after-action report
  ui.js               Side panel, feed, tutorial, codex
  main.js             Boot, phase transitions, mouse and keyboard input
  audio.js            Sound effects and the background-music sequencer (Web Audio)
```

**How state flows.** Everything about a run lives in one object, `GM.state`. Input calls into `red.js` or `blue.js`, which change the state through `rules.js`. Then `UI.render()` rebuilds the side panel from the state, and `map.js` redraws the canvas from the same state every frame. Drawing code never changes the state.

```
click / key  ->  red.js or blue.js  ->  rules.js  ->  GM.state  ->  ui.js + map.js
```

**How the AI adapts.** The AI is an "attacker" object pushed through the same `rules.js` functions the player used.

1. **Replay.** It follows the player's recorded Red moves, one per turn.
2. **Blocked.** When a move fails, it asks the rules *why* (patched, firewalled, isolated, credential rotated) and records that in its `belief` about the defences.
3. **Re-plan.** It runs a breadth-first search over every legal sequence of moves, given its beliefs, and takes the first step of the shortest route to the database.

The AI is deliberately not all-knowing: it only learns about a defence by running into it, so each block costs it a turn.

## Security concepts covered

Technique IDs follow [MITRE ATT&CK Enterprise](https://attack.mitre.org).

| ATT&CK ID | Technique | In the game |
|---|---|---|
| T1018 | Remote System Discovery | Ping sweep |
| T1046 | Network Service Discovery | Port scan (`nmap`) |
| T1190 | Exploit Public-Facing Application | Unpatched CMS on the web server |
| T1078.001 | Valid Accounts: Default Accounts | Default Telnet password on the router |
| T1566.001 | Phishing: Spearphishing Attachment | Phishing the workstation user |
| T1110.001 | Brute Force: Password Guessing | Weak SSH passwords |
| T1548.003 | Abuse Elevation Control Mechanism: Sudo and Sudo Caching | Misconfigured sudo |
| T1552.004 | Unsecured Credentials: Private Keys | World-readable SSH key |
| T1552.001 | Unsecured Credentials: Credentials In Files | Database password in a config file |
| T1021.004 | Remote Services: SSH | Lateral movement with the stolen key |
| T1078 | Valid Accounts | Logging in to the database with stolen credentials |

Defensive ideas the game teaches:

- Detect, analyse, respond, in that order.
- Patching closes a door but does not evict someone already inside.
- Rotating a credential fails if the attacker can still read where it is stored.
- Critical services cannot simply be firewalled off; they have to be fixed.
- Quiet techniques (phishing, reading a key file) slip under threshold-based alerting.
- Isolation works, and costs the business availability.
- Deception (a tripwire or canary) detects an intruder without needing to know their technique.

## Deploying to GitHub Pages

1. Create a new public repository on GitHub named `Ghost-in-the-mesh-` under `RootViking`.
2. From this folder:

   ```bash
   git init
   git add .
   git commit -m "Ghost in the Mesh: first playable version"
   git branch -M main
   git remote add origin https://github.com/RootViking/Ghost-in-the-mesh-.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment**. Source: **Deploy from a branch**. Branch: **main**, folder **/ (root)**. Save.
4. After a minute or two the game is live at `https://rootviking.github.io/Ghost-in-the-mesh-/`.

## Recording the GIF

1. Open the game and make the browser window about 1280x720.
2. Record 15 to 25 seconds: a ping sweep, a typed `nmap`, one exploit, then a Blue turn where an attack gets blocked.
   - macOS: `Cmd+Shift+5`, record the selected area, then convert the `.mov` with [Gifski](https://gif.ski) or `ffmpeg`.
   - Windows or Linux: [ScreenToGif](https://www.screentogif.com) or [Peek](https://github.com/phw/peek) record straight to GIF.
3. With `ffmpeg`:

   ```bash
   ffmpeg -i demo.mov -vf "fps=12,scale=960:-1:flags=neighbor" docs/gameplay.gif
   ```

4. Keep it under about 8 MB, save it as `docs/gameplay.gif`, commit and push.

## What I learned

_Fill this in yourself. Some prompts:_

- What surprised me about how the attacker chains small weaknesses together:
- A defence I assumed would work, and why it did not:
- What I now understand about `nmap`, `grep` and `ufw`:
- How the AI's breadth-first search works, in my own words:
- What I would add next:

## Disclaimer

This is an educational simulation. The network, hosts, logs and attacks are fictional and nothing here interacts with real systems. Only test systems you own or have written permission to test.
