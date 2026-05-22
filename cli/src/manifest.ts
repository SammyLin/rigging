import type { Language } from './detect.js';

export const CORE_FILES = [
  'ai-behavior.md',
  'code-quality.md',
  'architecture.md',
  'prp-template.md',
] as const;

export interface LangManifestEntry {
  language: Language;
  file: string;
  label: string;
  // Kiro accepts a single glob or a list. We always emit a list so multiple
  // patterns OR together correctly — the older `|`-joined string was treated
  // as one literal glob and never matched anything.
  kiroPattern: string[];
}

export const LANG_MANIFEST: ReadonlyArray<LangManifestEntry> = [
  {
    language: 'node',
    file: 'lang-node.md',
    label: 'Node/TypeScript',
    kiroPattern: [
      '**/*.ts',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      'package.json',
      'tsconfig.json',
      'pnpm-lock.yaml',
    ],
  },
  {
    language: 'python',
    file: 'lang-python.md',
    label: 'Python',
    kiroPattern: ['**/*.py', 'pyproject.toml', 'requirements.txt', 'uv.lock'],
  },
  {
    language: 'go',
    file: 'lang-go.md',
    label: 'Go',
    kiroPattern: ['**/*.go', 'go.mod', 'go.sum'],
  },
  {
    language: 'frontend',
    file: 'lang-frontend.md',
    label: 'Frontend (React)',
    kiroPattern: [
      '**/*.tsx',
      '**/*.jsx',
      '**/*.css',
      '**/*.scss',
      'vite.config.*',
      'next.config.*',
    ],
  },
];

export interface SkillManifestEntry {
  name: string;
  source: string;
  description: string;
  // Short trigger phrase for the README skill tables (en / zh-TW). The README
  // tables are generated from these — see cli/src/gen-docs.ts. Keep it short.
  summary: string;
  summaryZh: string;
}

export const SKILLS: ReadonlyArray<SkillManifestEntry> = [
  {
    name: 'security-check',
    source: 'security.md',
    description:
      '10-item security checklist. Use before adding API endpoints, shipping code, or handling user input. Covers secrets, SQL injection, XSS, auth, HTTPS.',
    summary: 'adding APIs, shipping, handling user input',
    summaryZh: '新增 API、上線前、處理使用者輸入',
  },
  {
    name: 'infra-ops',
    source: 'project-ops.md',
    description:
      'Docker, git workflow, CI/CD, observability standards. Use when setting up infrastructure, writing Dockerfiles, or configuring deployment.',
    summary: 'Docker, CI/CD, git workflow',
    summaryZh: 'Docker、CI/CD、git workflow',
  },
  {
    name: 'harness-review',
    source: 'harness-engineering.md',
    description:
      'Guardrails and feedback loops. Use when a mistake recurs, when fixing systemic issues, or when strengthening the development harness.',
    summary: 'systemic improvements',
    summaryZh: '系統性改進',
  },
  {
    name: 'browser-verify',
    source: 'agent-browser-skill.md',
    description:
      'agent-browser CLI for frontend verification. Use when you need to visually verify frontend changes in a real browser.',
    summary: 'frontend visual verification',
    summaryZh: '前端視覺驗證',
  },
];

// Directory-based skills vendored verbatim from upstream repos (with their own
// SKILL.md + references/scripts). Unlike SKILLS, these are NOT wrapped — the
// whole `skills/<dir>/` tree is copied into `.claude/skills/<name>/` as-is.
export interface VendoredSkillManifestEntry {
  name: string;
  dir: string; // directory under `skills/` holding SKILL.md + references/
  description: string; // used only for the AGENTS.md / CLAUDE.md skill listing
  summary: string; // README table trigger phrase (en) — see cli/src/gen-docs.ts
  summaryZh: string; // README table trigger phrase (zh-TW)
}

export const VENDORED_SKILLS: ReadonlyArray<VendoredSkillManifestEntry> = [
  {
    name: 'code-review-expert',
    dir: 'code-review-expert',
    description:
      'Expert code review of current git changes with a senior engineer lens. Detects SOLID violations, security risks, and proposes actionable improvements.',
    summary: 'SOLID + security review of current git changes',
    summaryZh: '對當前 git 變更做 SOLID + 安全審查',
  },
];

export const AGENT_FILES = ['agents/code-reviewer.md'] as const;
export const COMMAND_FILES = ['commands/commit.md', 'commands/review.md'] as const;
export const HOOK_FILES = ['hooks/auto-format.sh', 'hooks/secret-guard.sh'] as const;
