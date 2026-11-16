import { describe, expect, it } from 'vitest';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SRC_ROOT = path.resolve(__dirname, '..');
const CLIENT_ROOT = path.resolve(SRC_ROOT, '..');
const INDEX_CSS_PATH = path.resolve(SRC_ROOT, 'index.css');

const STRIPPED_PALETTE_REGEX =
  /(?:(?:^|[\s"'`:,[!])(?:bg|text|border(?:-[trblxyse])?|divide(?:-[trblxyse])?|ring(?:-offset)?|inset-ring|inset-shadow|text-shadow|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|placeholder)|--color)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)(?:\/\d{1,3})?\b/g;

const STATUS_WARNING_CLASS_REGEX =
  /(?:^|[\s"'`,])(!?(?:[a-z0-9-[\]>&]+:)*(?:bg|text|border(?:-[trblxyse])?|divide(?:-[trblxyse])?|ring(?:-offset)?|inset-ring|inset-shadow|text-shadow|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|placeholder)-status-warning(?:-[a-z0-9-]+)?(?:\/\d{1,3})?)(?=$|[\s"'`,])/g;

function extractBlockVars(css: string, selectorPattern: RegExp): Record<string, string> {
  const match = selectorPattern.exec(css);
  if (!match || match[1] === undefined) {
    throw new Error(`Could not find CSS block matching ${selectorPattern}`);
  }
  const bodyWithoutComments = match[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const vars: Record<string, string> = {};
  const declRegex = /(--[a-z0-9-*]+)\s*:\s*([^;]+);/gi;
  let declMatch: RegExpExecArray | null;
  while ((declMatch = declRegex.exec(bodyWithoutComments)) !== null) {
    vars[declMatch[1]] = declMatch[2].trim();
  }
  return vars;
}

function relativeLuminance(hex: string): number {
  const normalized = hex.trim();
  const match = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (!match) {
    throw new Error(`Expected 6-digit hex color, received: "${hex}"`);
  }
  const rgb = [0, 2, 4].map((offset) => {
    const channel = parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)));
    } else if (/\.(ts|tsx|js|jsx|css)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readFilesWithContent(filePaths: string[]) {
  return Promise.all(
    filePaths.map(async (filePath) => ({
      filePath,
      content: await readFile(filePath, 'utf8'),
    })),
  );
}

async function resolveStylesheet(id: string, base: string) {
  if (id.startsWith('.')) {
    const resolved = path.resolve(base, id);
    return {
      path: resolved,
      base: path.dirname(resolved),
      content: await readFile(resolved, 'utf8'),
    };
  }

  const nodeModulesRoots = [
    path.resolve(CLIENT_ROOT, 'node_modules'),
    path.resolve(CLIENT_ROOT, '../../node_modules'),
  ];

  for (const nm of nodeModulesRoots) {
    const direct = path.join(nm, id);
    const info = await stat(direct).catch(() => null);
    if (info?.isFile()) {
      return {
        path: direct,
        base: path.dirname(direct),
        content: await readFile(direct, 'utf8'),
      };
    }
    if (info?.isDirectory()) {
      const pkg = JSON.parse(await readFile(path.join(direct, 'package.json'), 'utf8')) as {
        style?: string;
        main?: string;
        exports?: { '.'?: { style?: string } };
      };
      const entry = pkg.style ?? pkg.exports?.['.']?.style ?? pkg.main;
      if (entry) {
        const resolved = path.resolve(direct, entry);
        return {
          path: resolved,
          base: path.dirname(resolved),
          content: await readFile(resolved, 'utf8'),
        };
      }
    }
  }

  throw new Error(`Unable to resolve stylesheet "${id}" from "${base}"`);
}

describe('ThemeTokens & status-warning contract (CWB-115)', () => {
  it('defines --status-warning-* in :root and .dark with WCAG AA contrast (>= 4.5:1) and maps @theme inline tokens', async () => {
    const css = await readFile(INDEX_CSS_PATH, 'utf8');

    const rootVars = extractBlockVars(css, /:root\s*\{([\s\S]*?)\n\}/);
    const darkVars = extractBlockVars(css, /\.dark\s*\{([\s\S]*?)\n\}/);
    const themeVars = extractBlockVars(css, /@theme\s+inline\s*\{([\s\S]*?)\n\}/);

    expect(themeVars['--color-*']).toBe('initial');

    for (const scopeVars of [rootVars, darkVars]) {
      expect(scopeVars['--status-warning-fg']).toMatch(/^#[0-9a-f]{6}$/i);
      expect(scopeVars['--status-warning-bg']).toMatch(/^#[0-9a-f]{6}$/i);
      expect(scopeVars['--status-warning-border']).toMatch(/^#[0-9a-f]{6}$/i);

      const fg = scopeVars['--status-warning-fg'];
      for (const surface of ['--status-warning-bg', '--card', '--background', '--muted']) {
        expect(contrastRatio(fg, scopeVars[surface])).toBeGreaterThanOrEqual(4.5);
      }
    }

    expect(themeVars['--color-status-warning']).toBe('var(--status-warning-fg)');
    expect(themeVars['--color-status-warning-bg']).toBe('var(--status-warning-bg)');
    expect(themeVars['--color-status-warning-border']).toBe('var(--status-warning-border)');
  });

  it(
    'compiles Tailwind v4 CSS rules for all status-warning utilities',
    { timeout: 15_000 },
    async () => {
      const css = await readFile(INDEX_CSS_PATH, 'utf8');
      const compiler = await compile(css, {
        base: path.dirname(INDEX_CSS_PATH),
        loadStylesheet: resolveStylesheet,
      });

      const codeFiles = (await collectSourceFiles(SRC_ROOT)).filter((filePath) =>
        /\.(ts|tsx)$/.test(filePath),
      );
      const codeContents = await readFilesWithContent(codeFiles);
      const discovered = new Set<string>();
      for (const { content } of codeContents) {
        for (const match of content.matchAll(STATUS_WARNING_CLASS_REGEX)) {
          if (match[1]) {
            discovered.add(match[1]);
          }
        }
      }
      const usedCandidates = [...discovered].sort();

      expect(usedCandidates).toEqual(
        expect.arrayContaining([
          'bg-status-warning-bg',
          'border-status-warning',
          'border-status-warning-border',
          'hover:bg-status-warning-bg',
          'hover:border-status-warning',
          'hover:text-status-warning',
          'text-status-warning',
        ]),
      );

      const baselineCss = compiler.build([]);
      expect(compiler.build(['border-status-warning-nonexistent'])).toBe(baselineCss);

      for (const candidate of usedCandidates) {
        expect(compiler.build([candidate]), candidate).not.toBe(baselineCss);
      }

      const compiled = compiler.build(usedCandidates);

      expect(compiled).toMatch(
        /\.bg-status-warning-bg\s*\{\s*background-color:\s*var\(--status-warning-bg\);\s*\}/,
      );
      expect(compiled).toMatch(
        /\.border-status-warning-border\s*\{\s*border-color:\s*var\(--status-warning-border\);\s*\}/,
      );
      expect(compiled).toMatch(
        /\.border-status-warning\s*\{\s*border-color:\s*var\(--status-warning-fg\);\s*\}/,
      );
      expect(compiled).toMatch(
        /\.text-status-warning\s*\{\s*color:\s*var\(--status-warning-fg\);\s*\}/,
      );
      expect(compiled).toMatch(
        /\.hover\\:bg-status-warning-bg:hover\s*\{\s*background-color:\s*var\(--status-warning-bg\);\s*\}/,
      );
      expect(compiled).toMatch(
        /\.hover\\:border-status-warning:hover\s*\{\s*border-color:\s*var\(--status-warning-fg\);\s*\}/,
      );
      expect(compiled).toMatch(
        /\.hover\\:text-status-warning:hover\s*\{\s*color:\s*var\(--status-warning-fg\);\s*\}/,
      );

      // Regression proof (F-01): deleting --color-status-warning must fail exact selector check
      // even though .border-status-warning-border still contains the substring ".border-status-warning".
      const strippedCss = css.replace('--color-status-warning: var(--status-warning-fg);', '');
      const strippedCompiler = await compile(strippedCss, {
        base: path.dirname(INDEX_CSS_PATH),
        loadStylesheet: resolveStylesheet,
      });
      const strippedOutput = strippedCompiler.build([
        'border-status-warning-border',
        'border-status-warning',
      ]);
      expect(strippedOutput).toMatch(
        /\.border-status-warning-border\s*\{\s*border-color:\s*var\(--status-warning-border\);\s*\}/,
      );
      expect(strippedOutput).not.toMatch(/\.border-status-warning\s*\{/);
    },
  );

  it('detects stripped Tailwind palette edge cases while allowing semantic tokens', () => {
    const flaggedSamples = [
      '!bg-red-500',
      'hover:!bg-red-500',
      'border-l-amber-400',
      'divide-y-slate-200',
      'ring-offset-amber-500',
      'inset-ring-blue-500',
      'inset-shadow-zinc-100',
      'text-shadow-emerald-200',
      'bg-[var(--color-red-500)]',
      'dark:bg-amber-950/60',
    ];
    for (const sample of flaggedSamples) {
      expect([...sample.matchAll(STRIPPED_PALETTE_REGEX)].length, sample).toBeGreaterThan(0);
    }

    const allowedSamples = [
      'bg-status-warning-bg',
      'border-status-warning',
      'border-status-warning-border',
      'text-status-warning',
      'bg-black/40',
    ];
    for (const sample of allowedSamples) {
      expect([...sample.matchAll(STRIPPED_PALETTE_REGEX)], sample).toEqual([]);
    }
  });

  it(
    'contains zero stripped default Tailwind color palette classes in apps/client/src and index.html',
    { timeout: 15_000 },
    async () => {
      const files = [
        ...(await collectSourceFiles(SRC_ROOT)),
        path.resolve(CLIENT_ROOT, 'index.html'),
      ];
      const contents = await readFilesWithContent(files);
      const violations: string[] = [];

      for (const { filePath, content } of contents) {
        const lines = content.split(/\r?\n/);
        lines.forEach((line, index) => {
          for (const match of line.matchAll(STRIPPED_PALETTE_REGEX)) {
            violations.push(
              `${path.relative(CLIENT_ROOT, filePath)}:${index + 1}: ${match[0].trim()}`,
            );
          }
        });
      }

      expect(violations).toEqual([]);
    },
  );
});
