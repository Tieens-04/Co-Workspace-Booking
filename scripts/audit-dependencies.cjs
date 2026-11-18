const { spawnSync } = require('node:child_process');

// Temporary allowlist strictly for dev-only advisories that currently have NO
// upstream patched version published on npm (`first_patched_version: null`).
// Production dependencies (`npm audit --omit=dev`) NEVER use this allowlist.
// Remove an entry as soon as upstream publishes a patched release on npm.
const TEMPORARY_UNPATCHED_DEV_ADVISORIES = new Map([
  [
    'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
    {
      ghsaId: 'GHSA-fc5q-39xc-vjpf',
      cveId: 'CVE-2026-112366',
      packageName: 'picomatch',
    },
  ],
]);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateAuditEnvelope(report, label) {
  if (!isPlainObject(report)) {
    return `${label}: audit report is not a JSON object`;
  }
  if (report.error) {
    const summary = isPlainObject(report.error)
      ? report.error.summary || report.error.code || JSON.stringify(report.error)
      : String(report.error);
    return `${label}: npm audit returned an error: ${summary}`;
  }
  if (report.auditReportVersion !== 2) {
    return `${label}: unexpected auditReportVersion (${String(report.auditReportVersion)})`;
  }
  if (!isPlainObject(report.vulnerabilities)) {
    return `${label}: missing vulnerabilities map`;
  }
  if (!isPlainObject(report.metadata) || !isPlainObject(report.metadata.vulnerabilities)) {
    return `${label}: missing metadata.vulnerabilities summary`;
  }
  return null;
}

function evaluateProdAuditReport(report) {
  const envelopeError = validateAuditEnvelope(report, 'production audit');
  if (envelopeError) {
    return { ok: false, errors: [envelopeError] };
  }

  const vulnPackages = Object.keys(report.vulnerabilities);
  const totalCount = report.metadata.vulnerabilities.total ?? 0;
  if (vulnPackages.length > 0 || totalCount > 0) {
    return {
      ok: false,
      errors: [
        `production audit found ${Math.max(vulnPackages.length, totalCount)} vulnerable package(s): ${vulnPackages.join(', ')}`,
      ],
    };
  }

  return { ok: true, errors: [] };
}

function evaluateFullAuditReport(report, allowlist = TEMPORARY_UNPATCHED_DEV_ADVISORIES) {
  const envelopeError = validateAuditEnvelope(report, 'full audit');
  if (envelopeError) {
    return { ok: false, errors: [envelopeError], exempted: [] };
  }

  const vulns = report.vulnerabilities;
  const vulnNames = Object.keys(vulns);
  const totalCount = report.metadata.vulnerabilities.total ?? 0;

  if (vulnNames.length === 0 && totalCount === 0) {
    return { ok: true, errors: [], exempted: [] };
  }
  if (vulnNames.length === 0 && totalCount > 0) {
    return {
      ok: false,
      errors: [`full audit metadata reported ${totalCount} vulnerabilities with an empty map`],
      exempted: [],
    };
  }

  const errors = [];
  const exemptedByUrl = new Map();
  const memo = new Map();

  function inspectPackage(pkgName, chain) {
    if (memo.has(pkgName)) {
      return memo.get(pkgName);
    }
    if (chain.has(pkgName)) {
      const cycleError = `cyclic vulnerability chain involving "${pkgName}"`;
      errors.push(cycleError);
      return false;
    }

    const entry = vulns[pkgName];
    if (!isPlainObject(entry) || !Array.isArray(entry.via) || entry.via.length === 0) {
      errors.push(`invalid or unresolved vulnerability entry for "${pkgName}"`);
      memo.set(pkgName, false);
      return false;
    }

    const nextChain = new Set(chain);
    nextChain.add(pkgName);

    let allAllowed = true;
    for (const viaItem of entry.via) {
      if (typeof viaItem === 'string') {
        if (!inspectPackage(viaItem, nextChain)) {
          allAllowed = false;
        }
      } else if (isPlainObject(viaItem)) {
        const url = typeof viaItem.url === 'string' ? viaItem.url : '';
        const allowed = allowlist.get(url);
        if (!allowed) {
          errors.push(
            `disallowed advisory on "${pkgName}": ${url || viaItem.title || JSON.stringify(viaItem)}`,
          );
          allAllowed = false;
          continue;
        }
        if (pkgName !== allowed.packageName || viaItem.name !== allowed.packageName) {
          errors.push(
            `advisory ${allowed.ghsaId} matched unexpected package "${pkgName}" (via "${String(viaItem.name)}")`,
          );
          allAllowed = false;
          continue;
        }
        exemptedByUrl.set(url, {
          ...allowed,
          url,
          range: viaItem.range ?? '*',
        });
      } else {
        errors.push(`unexpected via entry on "${pkgName}": ${String(viaItem)}`);
        allAllowed = false;
      }
    }

    memo.set(pkgName, allAllowed);
    return allAllowed;
  }

  for (const pkgName of vulnNames) {
    inspectPackage(pkgName, new Set());
  }

  return {
    ok: errors.length === 0,
    errors,
    exempted: [...exemptedByUrl.values()],
  };
}

function runNpmAuditJson(extraArgs) {
  const npmArgs = ['audit', ...extraArgs, '--json'];
  const result =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', `npm ${npmArgs.join(' ')}`], {
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
        })
      : spawnSync('npm', npmArgs, {
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
        });

  if (result.error) {
    throw result.error;
  }

  const raw = (result.stdout || '').trim();
  if (!raw) {
    throw new Error(
      `npm ${npmArgs.join(' ')} produced no JSON output (exit ${String(result.status)}): ${(result.stderr || '').trim()}`,
    );
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from "npm ${npmArgs.join(' ')}": ${err.message}\n${raw.slice(0, 500)}`,
    );
  }
}

function main() {
  const prodReport = runNpmAuditJson(['--omit=dev']);
  const prodEval = evaluateProdAuditReport(prodReport);
  if (!prodEval.ok) {
    for (const error of prodEval.errors) {
      console.error(`[audit-dependencies] FAIL: ${error}`);
    }
    process.exit(1);
  }
  console.log('[audit-dependencies] Production dependencies (--omit=dev): 0 vulnerabilities.');

  const fullReport = runNpmAuditJson([]);
  const fullEval = evaluateFullAuditReport(fullReport);
  if (!fullEval.ok) {
    for (const error of fullEval.errors) {
      console.error(`[audit-dependencies] FAIL: ${error}`);
    }
    process.exit(1);
  }

  if (fullEval.exempted.length === 0) {
    console.log('[audit-dependencies] Full dependency tree: 0 vulnerabilities.');
  } else {
    for (const item of fullEval.exempted) {
      console.warn(
        `[audit-dependencies] WARN: Temporarily exempted dev-only unpatched advisory ${item.ghsaId} (${item.cveId}) on ${item.packageName} (${item.range}) — ${item.url}`,
      );
    }
    console.log(
      '[audit-dependencies] Full dependency tree: 0 actionable vulnerabilities outside temporary unpatched dev allowlist.',
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(
      `[audit-dependencies] ERROR: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

module.exports = {
  TEMPORARY_UNPATCHED_DEV_ADVISORIES,
  evaluateProdAuditReport,
  evaluateFullAuditReport,
};
