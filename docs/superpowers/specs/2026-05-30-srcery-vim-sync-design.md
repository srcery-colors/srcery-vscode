# Design: Sync VS Code Theme Against srcery-vim

Date: 2026-05-30

## Goal

Bring `themes/Srcery-color-theme.json` into strict alignment with the canonical srcery-vim color palette and highlight group assignments, without restructuring the VS Code/TextMate scope model.

## Reference

Upstream: `srcery-colors/srcery-vim` — `colors/srcery.vim`

Canonical palette (hex, lowercase):

| Name | Hex |
|------|-----|
| black | #121110 |
| hard_black | #121212 |
| gray1 | #1c1b19 |
| bright_black | #917e6b |
| white | #c5b088 |
| bright_white | #fce8c3 |
| red | #ef2f27 |
| bright_red | #f75341 |
| green | #519f50 |
| bright_green | #98bc37 |
| yellow | #fbb829 |
| bright_yellow | #fed06e |
| blue | #2c78bf |
| bright_blue | #68a8e4 |
| magenta | #e02c6d |
| bright_magenta | #ff5c8f |
| cyan | #0aaeb3 |
| bright_cyan | #2be4d0 |
| bright_orange | #ff8700 |

## Changes Required

### 1. Terminal ANSI colors (3 fixes)

| Token | Current | Correct |
|-------|---------|---------|
| terminal.ansiWhite | #d0bfa1 | #c5b088 |
| terminal.ansiBrightBlack | #918175 | #917e6b |
| terminal.ansiBrightCyan | #53fde9 | #2be4d0 |

### 2. UI colors using off-palette bright_black (propagate correction)

All occurrences of `#918175` (wrong bright_black) → `#917e6b`. Affected tokens:
`activityBar.inactiveForeground`, `descriptionForeground`, `sideBar.foreground`,
`list.focusForeground`, `list.hoverForeground`, `panelTitle.inactiveForeground`,
`peekViewResult.lineForeground`, `titleBar.inactiveForeground`, `textPreformat.foreground`,
`input.placeholderForeground`.

### 3. Syntax token colors (strict mapping to srcery-vim groups)

| VS Code name | Scope | Current | srcery-vim group | Correct |
|---|---|---|---|---|
| Comment | comment | #75715e | Comment → bright_black | #917e6b |
| String | string | #fbb829 | String → bright_green | #98bc37 |
| Number | constant.numeric | #0aaeb3 | Number → bright_magenta | #ff5c8f |
| Built-in constant | constant.language | #0aaeb3 | Constant → bright_magenta | #ff5c8f |
| User-defined constant | constant.character, constant.other | #0aaeb3 | Constant → bright_magenta | #ff5c8f |
| Variable | variable | #9ebac2 (non-palette) | Variable → bright_white | #fce8c3 |
| Storage | storage | #ef2f27 | StorageClass → bright_blue | #68a8e4 |
| Storage type | storage.type | #2c78bf italic | Type → bright_blue italic | #68a8e4 |
| Class name | entity.name.class | #519f50 underline | Structure → cyan | #0aaeb3 |
| Function name | entity.name.function | #519f50 | Function → yellow | #fbb829 |
| Function argument | variable.parameter | #2c78bf italic | Identifier → bright_blue italic | #68a8e4 |
| Tag name | entity.name.tag | #ef2f27 | Tag → blue | #2c78bf |
| Tag attribute | entity.other.attribute-name | #519f50 | Special → blue | #2c78bf |
| Library class/type | support.type, support.class | #2c78bf italic | Type → bright_blue italic | #68a8e4 |

### 4. New token groups (from srcery-vim, not yet in VS Code theme)

| Group | Vim color | Proposed scope(s) | Hex |
|---|---|---|---|
| Boolean | bright_magenta | constant.language.boolean | #ff5c8f |
| Operator | white | keyword.operator | #c5b088 |
| Decorator | bright_orange | entity.name.function.decorator, punctuation.definition.decorator | #ff8700 |
| Include | bright_red | keyword.control.import, keyword.other.import | #f75341 |
| Define/PreProc | cyan | keyword.control.preprocessor, meta.preprocessor | #0aaeb3 |

### 5. Not changed

- `focusBorder: #75715e` and `peekView.border: #75715e` — intentional VS Code UI choices, not palette errors
- `terminalCursor.foreground: #6a7c2a` — custom cursor color, not in standard palette; leave it
- `Keyword` stays at `#ef2f27` (correct match to red)
- `Library function / Library constant` at `#2c78bf` (correct match to blue/Special)

## Approach

Option A + selective B: fix all wrong color values in-place, add 5 missing token groups at the end of `tokenColors`. Single working branch. No scope renames, no workbench color additions beyond what's listed.

## Success criteria

- All terminal ANSI hex values match srcery-vim palette exactly
- All syntax token colors map to the correct srcery-vim group color
- No color values outside the canonical palette remain in tokenColors (except intentional UI overrides noted above)
- Extension packages without errors (`pnpm exec vsce package`)
