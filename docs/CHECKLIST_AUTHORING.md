# Checklist authoring guide

This document is written to be pasted to an AI agent together with a source guide (a Google Sheet, a GameFAQs-style page, a forum post, or notes). The agent's job is to produce a valid checklist YAML file for RA Planner.

The checklist is the product's source of truth. The app does not parse third-party guides at runtime. Everything the player sees comes from the YAML you write.

---

## 0. The one rule that matters most

**A chapter is a chunk the player should fully complete before moving on.** If following the checklist in order would let the player miss something by advancing the story, the chapter boundary is in the wrong place.

The app shows the first unchecked step in the first unfinished chapter and warns when the player checks a step in a later chapter. That safety net only works if the checklist is chunked correctly.

---

## 1. File format

One YAML file per game in `checklists/`. The filename is the game's slug and must match the `slug` field exactly. Use kebab-case: `chrono-trigger.yaml`, not `Chrono Trigger.yaml`.

### 1.1 Full schema

```yaml
slug: example-game              # required; must match the filename without .yaml
title: Example Game             # required; non-empty
raGameId: 12345                 # optional positive integer; required for RA integration
console: SNES                   # optional display text
version: 1                      # required positive integer; bump on every edit
sources:                        # optional list, but record sources when you use a guide
  - title: Some Walkthrough
    url: https://example.com/guide
chapters:                       # required; at least one chapter
  - id: ch-intro                # required; unique across the whole file
    title: Intro stage          # required
    summary: One line about the chunk.   # optional
    steps:                      # required; at least one step
      - id: s-4f2a9c            # required; unique across the whole file, stable forever
        text: Talk to the shopkeeper before buying anything.   # required, plain text
        note: Talking first unlocks the discount. If you buy first, the discount is lost.  # optional
        achievementIds: [98012] # optional non-empty array of positive integers
      - id: s-81be07
        text: Grab the hidden key in the second room.
```

### 1.2 Field rules

| Field | Rules |
|---|---|
| `slug` | Kebab-case, matches filename. `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| `title` | Non-empty plain text. |
| `raGameId` | Positive integer. Find it in the RetroAchievements game URL: `retroachievements.org/game/12345`. |
| `console` | Optional display text, for example `SNES`, `PlayStation`, `Game Boy Advance`. |
| `version` | Positive integer. Increment on every edit. It is shown in Settings and helps with debugging. |
| `sources` | Optional list of `{ title, url }`. Record the guide you derived the checklist from. |
| `chapters` | At least one. |
| `chapters[].id` | Unique across chapters **and** steps. `^[a-z0-9][a-z0-9-]{1,39}$` (2–40 chars, lowercase). |
| `chapters[].title` | Non-empty. |
| `chapters[].summary` | Optional one-liner about the chunk. |
| `chapters[].steps` | At least one step per chapter. |
| `steps[].id` | Unique across chapters **and** steps, stable forever. `^[a-z0-9][a-z0-9-]{1,39}$`. |
| `steps[].text` | Non-empty **plain text**. No markdown, no HTML. One actionable thing. |
| `steps[].note` | Optional plain text. Warnings, the "why", or extra detail. Bare URLs are auto-linked. |
| `steps[].achievementIds` | Optional non-empty array of positive integers. A step can complete more than one achievement. |

Unknown keys are rejected. A build failure will report the file, path, and message.

### 1.3 Text rendering

`text` and `note` are plain text. The app escapes HTML, preserves line breaks, and auto-links bare `https://` URLs. Do not write Markdown, HTML, bullet characters that pretend to be lists, or emoji-only descriptions. Put a short imperative action in `text`, and anything extra in `note`.

---

## 2. ID stability (critical)

Check state is keyed by step ID. Changing an ID silently destroys the player's progress for that step.

### 2.1 Rules

- Assign an ID once when a step is created.
- **Never change an ID while the step still means the same thing**, even if you reword the text or move the step to another chapter.
- If a step is removed, retire its ID. **Never reuse an ID for a different step.**
- New steps always get new IDs.
- Chapter IDs are also stable. Moving a step between chapters keeps the step ID and changes only its position in the YAML.

Recommended formats:

- Step IDs: `s-` followed by six random lowercase hex characters, for example `s-4f2a9c`.
- Chapter IDs: a short readable slug prefixed with `ch-`, for example `ch-prologue`, `ch-first-dungeon`, `ch-point-of-no-return`.

Generate a random step ID with:

```bash
printf 's-%06x\n' $((RANDOM * 65536 + RANDOM))
```

or in Node:

```bash
node -e "console.log('s-' + require('crypto').randomBytes(3).toString('hex'))"
```

### 2.2 Regenerating from an updated guide

When a guide changes, you must edit the existing checklist rather than regenerate IDs from scratch.

**Workflow for an AI agent:**

1. You are given the **existing checklist YAML** and the updated guide.
2. Parse the existing file. Build a map of `step id -> current text, note, achievementIds, chapter`.
3. Compare the updated guide to the existing checklist **semantically**, not by literal text matching.
4. For each step that still means the same thing:
   - Keep its existing ID.
   - Update the text if it was reworded.
   - Move it between chapters if the guide reorganized, keeping its ID.
5. For genuinely new steps, create new random IDs.
6. For steps that no longer exist, omit them. Do not reuse their IDs.
7. Bump `version`.
8. Run verification (section 7). Pay special attention to the "removed IDs" warnings.
9. Report any removed IDs to the user so they know which progress entries will become orphaned.

**Do not** renumber IDs, use sequential IDs based on position, or generate a fresh file and call it "the same checklist". Position-based IDs break every time a step is inserted.

The app handles removed IDs safely: old state is kept in storage but ignored. That is a safety net, not permission to churn IDs casually.

---

## 3. Chunking into chapters

### 3.1 Goal

A chapter should contain everything the player can do in a self-contained chunk, in the order they should do it. When the chapter is complete, it is safe to move on.

### 3.2 Good chapter boundaries

Place boundaries at natural points of no return:

- Leaving an area, town, dungeon, level, or act.
- Advancing a story flag that changes available content.
- Starting a new level or world.
- A boss kill that seals the previous area.
- Boarding a vehicle, taking a one-way transition, or beginning a cutscene that cannot be replayed.
- A point where shops, NPCs, or side content become unavailable.

### 3.3 Bad chapter boundaries

Avoid boundaries that are purely mechanical or arbitrary:

- "First 10 steps", "Part 1", "Part 2" without gameplay meaning.
- Splitting a single room or menu session across chapters.
- Putting an optional item in a later chapter when it becomes unobtainable in an earlier one.
- Creating a chapter for one trivial action and another for fifty actions.

### 3.4 Ordering inside a chapter

List steps in the exact order they should be performed. If two steps are order-independent, choose the order that is easiest to follow and least likely to make the player skip a warning.

### 3.5 Chapter summaries

Use `summary` to state the stakes of the chunk. Good examples:

- "The town is destroyed after the ship leaves. Do everything here first."
- "The west wing seals after the boss, including the rare drop."
- "No point of no return in this chapter; order is flexible."

---

## 4. Writing steps

### 4.1 One actionable thing per step

Each step should be a single action the player can check off. Split compound instructions:

Bad:

```yaml
text: Talk to the elder, buy a sword, and save at the inn.
```

Good:

```yaml
- id: s-1a2b3c
  text: Talk to the elder in the square.
- id: s-4d5e6f
  text: Buy the iron sword from the shop.
- id: s-7a8b9c
  text: Save at the inn before leaving town.
```

Exception: if the guide describes one achievement that requires a short sequence, a single step may describe the whole sequence, with details in `note`.

### 4.2 Text style

- Short imperative sentence.
- Start with a verb: "Grab", "Talk to", "Defeat", "Save", "Open", "Equip".
- Name the location and object clearly.
- Do not bury warnings in `text`; put the "why" in `note`.
- Do not write spoilers beyond what the player needs to avoid a miss.

Example:

```yaml
- id: s-81be07
  text: Pick up the hidden key in the inn's second room.
  note: Search the barrel beside the bed. This key opens the optional basement chest later. The inn is inaccessible after the bridge.
```

### 4.3 Place missables before they become unobtainable

The most important authoring rule after chapter chunking:

- If an item, NPC, event, or achievement becomes unavailable at a point in the guide, its step must appear **before** that point.
- If the point of no return is in a chapter, every missable before it belongs in that chapter or an earlier one.
- A warning note may say "point of no return", but the step itself must already be placed correctly. Notes are not a substitute for ordering.

### 4.4 Optional content

Include optional content when it is missable or when it maps to an achievement. You may skip truly optional, always-available content to keep the checklist focused. If you include optional content, say so in `note` so the player knows it can be skipped.

### 4.5 Achievements that require a specific action

If an achievement requires something easy to miss (a specific party member, no-healing challenge, hidden dialogue), make that its own step and put the exact requirement in `note`.

---

## 5. Mapping achievements

Only fill `achievementIds` when you are confident about the mapping:

- The guide explicitly references the achievement's name or ID.
- The step's action unambiguously corresponds to one achievement.
- You can verify the ID from the RetroAchievements game page or API.

Leave `achievementIds` blank when the mapping is ambiguous. A missing chip is harmless. A wrong chip misleads the player.

A step can complete several achievements:

```yaml
achievementIds: [98012, 98013]
```

An achievement can be linked from multiple steps; the validator warns but does not fail. That is sometimes correct (for example, a checklist may need to reference the same achievement in a warning and in the action), but usually it means one step is redundant. Resolve duplicate links when possible.

Achievement IDs are positive integers. Do not use achievement names as IDs.

RA status is informational only. The app never auto-checks a step when the achievement is earned.

---

## 6. Sources and paraphrasing

- Record each guide's title and URL in `sources`.
- Paraphrase in your own words. Do not copy guide text verbatim. The repository may be public.
- Keep the source list short and specific: the walkthrough, the missables list, the achievement guide.
- If the source is a spreadsheet, record its title and a stable URL if one exists. A note like "personal spreadsheet" is acceptable in `title` when there is no URL; omit `url` only by omitting the whole source entry, because `url` is required when a source entry exists.

---

## 7. Verification

Always run:

```bash
pnpm validate
```

When editing an existing checklist, also compare IDs against the previous revision:

```bash
pnpm validate -- --against HEAD
```

The comparison reports:

- **Removed IDs (warning):** the player's state for these becomes orphaned. Confirm each removal is intentional. If a step was merely reworded or moved, restore its original ID.
- **Moved steps (info):** expected when reorganizing chapters. The step's check state is preserved.
- **New IDs (info):** expected for genuinely new steps.
- **Version changes (info):** expected on every edit.

Schema errors exit non-zero. Warnings do not. Do not hand off a checklist with unexplained removed IDs.

If the project uses a different previous revision, substitute it, for example `--against origin/main`.

---

## 8. Complete example

```yaml
slug: example-game
title: Example Game
raGameId: 12345
console: SNES
version: 1
sources:
  - title: Example walkthrough
    url: https://retroachievements.org/game/12345

chapters:
  - id: ch-prologue
    title: Prologue — before you leave town
    summary: Do everything here before boarding the ship. The town is gone afterwards.
    steps:
      - id: s-4f2a9c
        text: Talk to the shopkeeper before buying anything.
        note: Talking first unlocks the discount. If you buy first, the conversation changes and the discount is lost for the run.
        achievementIds: [98012]
      - id: s-81be07
        text: Pick up the hidden key in the inn's second room.
        note: Search the barrel beside the bed. This key opens the optional basement chest later in the game.
      - id: s-2c77d1
        text: Equip the old sword from the chest in your room.
        achievementIds: [98013, 98014]
      - id: s-b0a63e
        text: Save at the town fountain.
        note: This is the last save point before the point of no return.

  - id: ch-first-dungeon
    title: First dungeon — full clear
    summary: Finish every room before taking the final staircase. The exit collapses behind you.
    steps:
      - id: s-53cd90
        text: Defeat every enemy in the west wing.
        note: The rare drop is only available from these encounters, and the west wing is sealed after the boss.
      - id: s-ae19f5
        text: Open the locked chest with the hidden key.
        achievementIds: [98015]
      - id: s-f42c08
        text: Read the stone tablet in the library.
        note: The tablet reveals the boss's weakness. Missing it turns the boss into a long fight, not a missable item.
      - id: s-7d1b6a
        text: Save before descending the final staircase.
      - id: s-c9e2b3
        text: Defeat the dungeon boss without using a healing item.
        note: This is a bonus achievement. It is safe to skip if you are struggling; nothing becomes unobtainable.

  - id: ch-point-of-no-return
    title: Point of no return
    summary: Crossing the bridge locks the prologue town forever.
    steps:
      - id: s-6a4de1
        text: Confirm that every earlier chapter is fully checked.
        note: There is no way back from here in a normal playthrough.
      - id: s-d18f72
        text: Cross the eastern bridge to begin Chapter 1.
        achievementIds: [98016]
```

---

## 9. Agent hand-off checklist

Before returning a checklist, confirm all of the following:

- [ ] Filename matches `slug`.
- [ ] `title` is non-empty and `version` was bumped.
- [ ] Every chapter has at least one step.
- [ ] Every chapter and step ID is unique across the whole file and matches the ID pattern.
- [ ] Every step ID that still means the same thing was preserved from the existing file.
- [ ] No retired ID was reused for a different step.
- [ ] Chapter boundaries fall at natural points of no return.
- [ ] Every missable step appears before the point where it becomes unobtainable.
- [ ] `text` is a short imperative action; warnings and the "why" are in `note`.
- [ ] `text` and `note` are plain text, with no Markdown or HTML.
- [ ] Achievement IDs are filled only where the mapping is unambiguous.
- [ ] Sources are recorded and the guide is paraphrased, not copied.
- [ ] `pnpm validate` passes.
- [ ] `pnpm validate -- --against HEAD` was checked when editing an existing checklist, and removed IDs were reported.
