# rigging repo

Team AI-coding standards installer for bootstrapping new projects. Built on **progressive disclosure**: core rules always loaded, language rules gated by `paths:`, situational rules invoked as Skills, plus Agent + Commands + Hooks to support the 5-step flow.

## Repo Layout

The source layout mirrors the install target 1:1 — what you see here is what gets deployed to `.claude/`.

```
rules/                       → .claude/rules/
  ai-behavior.md             — 5-step flow, commit frequency
  code-quality.md            — TDD, error handling, typing
  architecture.md            — Layered architecture, DI
  lang-node.md               — auto-detected by package.json; has paths: frontmatter
  lang-python.md             — auto-detected by pyproject.toml / requirements.txt
  lang-go.md                 — auto-detected by go.mod
  lang-frontend.md           — auto-detected by .tsx / vite.config / React

skills/                      → .claude/skills/<name>/SKILL.md
  security.md                → security-check       (single-file source, wrapped by installer)
  project-ops.md             → infra-ops            (single-file source, wrapped by installer)
  harness-engineering.md     → harness-review       (single-file source, wrapped by installer)
  agent-browser-skill.md     → browser-verify       (single-file source, wrapped by installer)
  code-review-expert/        → code-review-expert   (vendored directory, copied verbatim; SKILL.md + references/)

agents/                      → .claude/agents/
  code-reviewer.md           — subagent for the Verify step

commands/                    → .claude/commands/
  commit.md                  — /commit
  review.md                  — /review

hooks/                       → .claude/hooks/
  auto-format.sh             — PostToolUse Edit/Write
  secret-guard.sh            — PreToolUse Bash

settings.json                → .claude/settings.json
cli/                         — Installer source (TypeScript). Published to npm as `coderigup`.
docs/                        — Knowledge base (not installed to target projects)
```

## 5-Layer Design

| Layer | Location | When Loaded | Content |
|-------|----------|-------------|---------|
| 1. Core | `.claude/rules/` | Always | Needed for every task |
| 2. Language | `.claude/rules/` | When files match `paths:` | Language conventions |
| 3. Skills | `.claude/skills/` | Claude decides | Security / ops / harness / browser |
| 4. Agent + Commands | `.claude/agents/` + `.claude/commands/` | User invocation | Verify / Commit flow |
| 5. Hooks + Settings | `.claude/hooks/` + `.claude/settings.json` | Event-triggered | Auto-format, block risky commands |

## Kiro CLI Mapping

Kiro CLI's format doesn't fully overlap with Claude Code. The `coderigup` CLI handles the conversions automatically (logic lives in `cli/src/kiro-convert.ts`):

| Claude Code | Kiro CLI | What `coderigup` does |
|-------------|----------|--------------------|
| `paths:` YAML array | `inclusion: fileMatch` + `fileMatchPattern: ["a", "b", "c"]` | Auto-converts |
| Agent markdown | Agent JSON | Parses frontmatter + body, emits JSON |
| Commands / Hooks / settings.json | — | ❌ Not supported by Kiro CLI — skipped |

## Editing Principles

- **Core rules**: keep concise, high value density. These are ALWAYS in context.
- **Language rules**: self-contained per language. Scoped by `paths:`. Detection logic lives in `cli/src/detect.ts`.
- **Situational rules**: source files (security.md etc.) are wrapped into SKILL.md with frontmatter by `cli/src/claude-format.ts`.
- **Skill description** (~250 chars) is the trigger — phrase it the way a user would naturally ask.
- **Agent + Commands**: **restraint principle** — only one agent + two commands, mapping to Verify + Commit in the 5-step flow. More than that is a "persona zoo."
- **Hooks**: only ship the two language-agnostic, low-risk ones (auto-format, secret-guard).
- **settings.json**: team-level permission consensus — personal preferences don't belong here.

## Adding a New Item

All installer wiring lives in `cli/src/manifest.ts`. Add an entry there, plus detection logic in `cli/src/detect.ts` for new languages.

### Adding a Skill

There are two kinds of skills:

**Single-file skill** (the default — source `.md` wrapped into `SKILL.md` at install time):

1. Write the source file `skills/foo.md`.
2. Append a `SkillManifestEntry` to `SKILLS` in `cli/src/manifest.ts` (`name`, `source`, `description`, `summary`, `summaryZh`).
3. Run `cd cli && pnpm gen:docs` to refresh the README skill tables.

**Vendored directory skill** (a skill that ships its own `SKILL.md` plus `references/` / `scripts/`, copied verbatim — used when bringing in an external skill like `code-review-expert`):

1. Place the whole skill directory under `skills/<dir>/` (keep its own `SKILL.md`; add `managed-by: rigging` to the frontmatter). If vendored from another repo, add an `ATTRIBUTION.md` noting the upstream source + license.
2. Append a `VendoredSkillManifestEntry` to `VENDORED_SKILLS` in `cli/src/manifest.ts` (`name`, `dir`, `description`, `summary`, `summaryZh`). The installer copies the directory into `.claude/skills/<name>/` (and `.kiro/skills/<name>/`) as-is — no wrapping.
3. Run `cd cli && pnpm gen:docs` to refresh the README skill tables.

**Single source of truth:** the skill **tables** in `README.md` / `README.zh-TW.md` are generated from the manifest by `cli/src/gen-docs.ts` (between the `<!-- skills:table:start -->` markers) — never hand-edit them; run `pnpm gen:docs`. A drift guard in `gen-docs.test.ts` fails `pnpm test` if they're stale. The skill listings in the directory **trees** (README + the Repo Layout above) are illustrative samples, not exhaustive lists — no need to update them for every skill.

### Adding a Language

1. Write `rules/lang-xxx.md` with a `paths:` frontmatter at the top.
2. Append a `LangManifestEntry` to `LANG_MANIFEST` in `cli/src/manifest.ts` (`language`, `file`, `label`, `kiroPattern`).
3. Add the detection rule for it in `cli/src/detect.ts` (e.g. which files trigger it).

### Adding an Agent / Command / Hook

**First ask: is this really necessary?** Watch for anti-patterns like persona zoos, filler commands, or running the full test suite on every edit.

If truly needed:

1. Place the file under `agents/` / `commands/` / `hooks/`.
2. Add the path to `AGENT_FILES` / `COMMAND_FILES` / `HOOK_FILES` in `cli/src/manifest.ts`.

## Testing

```bash
# Unit tests + lint inside cli/
cd cli && pnpm install && pnpm test && pnpm lint

# Smoke-test the installer against a temp project
mkdir -p /tmp/test && cd /tmp/test && touch go.mod
cd -
cd cli && pnpm dev -- init --dry-run --target all
# (drop --dry-run to actually write files into /tmp/test)

# Inspect the result
find /tmp/test -type f | sort
```

`pnpm dev` runs the CLI from source via tsx. `pnpm build` compiles to `dist/`, then `node dist/index.js init` runs the built artifact. See `cli/README.md` for the full dev/publish flow.

## Language Policy

- **AI-facing files** (rules, skills, agents, commands, hooks, this CLAUDE.md, installer output) are written in **English**.
- **Human-facing docs** (README, `docs/`) may be bilingual. The primary README is English; `README.zh-TW.md` is the Traditional Chinese mirror.
- **When editing README, update both `README.md` and `README.zh-TW.md`** — they must stay in sync. The skill tables are the exception: they're generated for both languages by `pnpm gen:docs` (zh text comes from `summaryZh` in the manifest), so edit the manifest, not the tables.
