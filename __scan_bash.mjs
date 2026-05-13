import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const PROJECT_BASE = 'C:\\Users\\wu\\.claude\\projects';
const TETO_DIR = join(PROJECT_BASE, 'D--wu----TETO----');
const OTHER_DIR = join(PROJECT_BASE, 'D--wu-------');

function getJsonlFiles(dir, maxFiles) {
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }));
    files.sort((a, b) => b.mtime - a.mtime);
    return files.slice(0, maxFiles);
  } catch (e) {
    console.error(`Error listing ${dir}: ${e.message}`);
    return [];
  }
}

function normalizeCommand(cmd) {
  cmd = cmd.trim().replace(/\s+/g, ' ');
  if (!cmd) return cmd;

  const tokens = cmd.split(' ');
  const base = tokens[0];

  // Handle && and ||
  if (cmd.includes('&&')) {
    const parts = cmd.split('&&').map(p => normalizeCommand(p.trim())).filter(Boolean);
    return parts.join(' && ');
  }
  if (cmd.includes('||')) {
    const parts = cmd.split('||').map(p => normalizeCommand(p.trim())).filter(Boolean);
    return parts.join(' || ');
  }

  // Pipes: normalize first command
  if (cmd.includes('|')) {
    const firstPart = cmd.split('|')[0].trim();
    return normalizeCommand(firstPart) + ' | ...';
  }

  // git <subcommand>
  if (base === 'git' && tokens.length >= 2) {
    const sub = tokens[1];
    if (['stash', 'remote', 'branch', 'config'].includes(sub) && tokens.length >= 3) {
      return `git ${sub} ${tokens[2]}`;
    }
    return `git ${sub}`;
  }

  // npm <subcommand>
  if (base === 'npm' && tokens.length >= 2) {
    const sub = tokens[1];
    if (sub === 'run' && tokens.length >= 3) return `npm run ${tokens[2]}`;
    return `npm ${sub}`;
  }

  // npx <tool>
  if (base === 'npx' && tokens.length >= 2) {
    const tool = tokens[1];
    if (tool === 'prisma' && tokens.length >= 3) return `npx ${tool} ${tokens[2]}`;
    return `npx ${tool}`;
  }

  // yarn/pnpm
  if (['yarn', 'pnpm'].includes(base) && tokens.length >= 2) {
    const sub = tokens[1];
    if (sub === 'run' && tokens.length >= 3) return `${base} run ${tokens[2]}`;
    return `${base} ${sub}`;
  }

  // node/python
  if (base === 'node' && tokens.length >= 2) {
    if (tokens[1].startsWith('-')) return `node ${tokens[1]}`;
    return 'node <script>';
  }
  if (['python', 'python3'].includes(base) && tokens.length >= 2) {
    if (tokens[1].startsWith('-')) return `${base} ${tokens[1]}`;
    return `${base} <script>`;
  }

  // docker
  if (base === 'docker' && tokens.length >= 2) return `docker ${tokens[1]}`;

  // supabase
  if (base === 'supabase' && tokens.length >= 2) {
    if (tokens.length >= 3) return `supabase ${tokens[1]} ${tokens[2]}`;
    return `supabase ${tokens[1]}`;
  }

  // Simple commands
  const simpleCmds = new Set([
    'ls', 'cd', 'pwd', 'rm', 'cp', 'mv', 'mkdir', 'rmdir',
    'cat', 'head', 'tail', 'less', 'more',
    'grep', 'rg', 'find', 'sed', 'awk',
    'echo', 'printf', 'test', '[',
    'chmod', 'chown', 'chgrp',
    'tar', 'unzip', 'zip', 'gzip',
    'ssh', 'scp', 'rsync',
    'kill', 'killall', 'pkill',
    'ps', 'top', 'htop', 'df', 'du',
    'ping', 'traceroute',
    'which', 'type', 'where', 'whereis',
    'tsc', 'eslint', 'prettier', 'jest', 'vitest',
    'touch', 'diff', 'patch',
    'wc', 'sort', 'uniq', 'cut', 'tr',
    'date', 'cal', 'uptime',
    'env', 'export', 'set', 'unset',
    'source', 'alias', 'unalias',
    'man', 'info', 'help',
    'clear', 'reset', 'exit', 'curl',
  ]);
  if (simpleCmds.has(base)) return base;

  return base;
}

function extractBashCommands(filePath) {
  const commands = [];
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (!obj || typeof obj !== 'object') continue;

      let message = null;
      if (obj.message && typeof obj.message === 'object') {
        message = obj.message;
      } else if (obj.type === 'assistant') {
        message = obj;
      }
      if (!message) continue;

      const contentArr = message.content;
      if (!Array.isArray(contentArr)) continue;

      for (const item of contentArr) {
        if (!item || typeof item !== 'object') continue;
        if (item.type !== 'tool_use') continue;
        if (item.name !== 'Bash') continue;

        let inp = item.input;
        if (typeof inp === 'string') {
          try { inp = JSON.parse(inp); } catch { continue; }
        }
        if (inp && inp.command) {
          commands.push(inp.command);
        }
      }
    }
  } catch (e) {
    console.error(`Error reading ${filePath}: ${e.message}`);
  }
  return commands;
}

// Main
const counter = new Map();
let totalFiles = 0;
let totalBashCalls = 0;

// TETO project
const tetoFiles = getJsonlFiles(TETO_DIR, 15);
console.log(`TETO project: found ${tetoFiles.length} session files`);
for (const f of tetoFiles) {
  console.log(`  Scanning: ${f.name}`);
  const cmds = extractBashCommands(f.path);
  console.log(`    -> ${cmds.length} Bash calls`);
  totalBashCalls += cmds.length;
  for (const cmd of cmds) {
    const pattern = normalizeCommand(cmd);
    counter.set(pattern, (counter.get(pattern) || 0) + 1);
  }
  totalFiles++;
}

// Other projects
const otherFiles = getJsonlFiles(OTHER_DIR, 5);
console.log(`\nOther projects: found ${otherFiles.length} session files`);
for (const f of otherFiles) {
  console.log(`  Scanning: ${f.name}`);
  const cmds = extractBashCommands(f.path);
  console.log(`    -> ${cmds.length} Bash calls`);
  totalBashCalls += cmds.length;
  for (const cmd of cmds) {
    const pattern = normalizeCommand(cmd);
    counter.set(pattern, (counter.get(pattern) || 0) + 1);
  }
  totalFiles++;
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Total files scanned: ${totalFiles}`);
console.log(`Total Bash calls: ${totalBashCalls}`);
console.log(`Unique patterns: ${counter.size}`);
console.log(`${'='.repeat(60)}\n`);

// Sort by count descending
const sorted = [...counter.entries()].sort((a, b) => b[1] - a[1]);
for (const [pattern, count] of sorted) {
  console.log(`${count} | ${pattern}`);
}
