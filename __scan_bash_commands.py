#!/usr/bin/env python3
"""Scan Claude Code transcript .jsonl files and extract Bash tool call command patterns."""

import json
import re
from collections import Counter
from pathlib import Path

PROJECT_BASE = Path(r"C:\Users\wu\.claude\projects")
TETO_DIR = PROJECT_BASE / "D--wu----TETO----"
OTHER_DIR = PROJECT_BASE / "D--wu-------"

def get_jsonl_files(directory: Path, max_files: int = 15):
    files = [f for f in directory.glob("*.jsonl")]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return files[:max_files]

def normalize_command(cmd: str) -> str:
    """Normalize a command to a recognizable pattern.

    Strategy: keep command + subcommand + key flags, strip file paths and variable args.
    """
    cmd = cmd.strip()
    cmd = re.sub(r'\s+', ' ', cmd)
    if not cmd:
        return cmd

    # Split into tokens (simple split, no shell parsing)
    tokens = cmd.split()
    if not tokens:
        return cmd

    base = tokens[0]

    # --- Compound commands: extract first simple command ---
    # Handle "cd /path && command" -> extract the meaningful command after &&
    if '&&' in cmd:
        parts = cmd.split('&&')
        # Recursively normalize each part, return the most interesting one
        norms = [normalize_command(p) for p in parts if p.strip()]
        if len(norms) >= 2:
            return ' && '.join(norms)
        elif norms:
            return norms[0]

    if '||' in cmd:
        parts = cmd.split('||')
        norms = [normalize_command(p) for p in parts if p.strip()]
        return ' || '.join(norms)

    # Pipes: normalize the first command in the pipe
    if '|' in cmd:
        parts = cmd.split('|')
        first = normalize_command(parts[0].strip())
        return f"{first} | ..."

    # --- Single command normalization ---

    # git <subcommand>
    if base == 'git' and len(tokens) >= 2:
        sub = tokens[1]
        # git log --oneline -20 -> "git log"
        # git commit -m "..." -> "git commit"
        # git push origin main -> "git push"
        # git checkout -b feature -> "git checkout"
        # git add . -> "git add"
        # git stash pop -> "git stash pop"
        if sub in ('stash', 'remote', 'branch') and len(tokens) >= 3:
            return f"git {sub} {tokens[2]}"
        return f"git {sub}"

    # npm <subcommand>
    if base == 'npm' and len(tokens) >= 2:
        sub = tokens[1]
        if sub == 'run' and len(tokens) >= 3:
            return f"npm run {tokens[2]}"
        return f"npm {sub}"

    # npx <tool> [args]
    if base == 'npx' and len(tokens) >= 2:
        tool = tokens[1]
        # npx tsc --noEmit -> "npx tsc"
        # npx prisma migrate -> "npx prisma migrate"
        if tool in ('prisma',) and len(tokens) >= 3:
            return f"npx {tool} {tokens[2]}"
        return f"npx {tool}"

    # yarn/pnpm
    if base in ('yarn', 'pnpm') and len(tokens) >= 2:
        sub = tokens[1]
        if sub == 'run' and len(tokens) >= 3:
            return f"{base} run {tokens[2]}"
        return f"{base} {sub}"

    # node <script>
    if base == 'node' and len(tokens) >= 2:
        script = tokens[1]
        # node --version -> "node --version"
        if script.startswith('-'):
            return f"node {script}"
        return f"node <script>"

    # python/python3 <script>
    if base in ('python', 'python3') and len(tokens) >= 2:
        script = tokens[1]
        if script.startswith('-'):
            return f"{base} {script}"
        return f"{base} <script>"

    # docker <subcommand>
    if base == 'docker' and len(tokens) >= 2:
        return f"docker {tokens[1]}"

    # supabase <subcommand>
    if base == 'supabase' and len(tokens) >= 2:
        sub = tokens[1]
        if len(tokens) >= 3:
            return f"supabase {sub} {tokens[2]}"
        return f"supabase {sub}"

    # curl
    if base == 'curl':
        return "curl"

    # Simple commands (no meaningful subcommands)
    simple_commands = {
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
        'clear', 'reset', 'exit',
    }
    if base in simple_commands:
        return base

    # Default: return base command
    return base

def extract_bash_commands(jsonl_path: Path) -> list:
    commands = []
    try:
        with open(jsonl_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                message = None
                if isinstance(obj, dict):
                    if 'message' in obj and isinstance(obj['message'], dict):
                        message = obj['message']
                    elif obj.get('type') == 'assistant':
                        message = obj

                if not message:
                    continue

                content = message.get('content', [])
                if not isinstance(content, list):
                    continue

                for item in content:
                    if not isinstance(item, dict):
                        continue
                    if item.get('type') != 'tool_use':
                        continue
                    if item.get('name') != 'Bash':
                        continue

                    inp = item.get('input', {})
                    if isinstance(inp, str):
                        try:
                            inp = json.loads(inp)
                        except:
                            continue

                    cmd = inp.get('command', '')
                    if cmd:
                        commands.append(cmd)
    except Exception as e:
        print(f"Error reading {jsonl_path}: {e}", flush=True)
    return commands

def main():
    counter = Counter()
    total_files = 0
    total_bash_calls = 0

    teto_files = get_jsonl_files(TETO_DIR, max_files=15)
    print(f"TETO project: found {len(teto_files)} session files", flush=True)
    for f in teto_files:
        print(f"  Scanning: {f.name}", flush=True)
        cmds = extract_bash_commands(f)
        print(f"    -> {len(cmds)} Bash calls", flush=True)
        total_bash_calls += len(cmds)
        for cmd in cmds:
            pattern = normalize_command(cmd)
            counter[pattern] += 1
        total_files += 1

    other_files = get_jsonl_files(OTHER_DIR, max_files=5)
    print(f"\nOther projects: found {len(other_files)} session files", flush=True)
    for f in other_files:
        print(f"  Scanning: {f.name}", flush=True)
        cmds = extract_bash_commands(f)
        print(f"    -> {len(cmds)} Bash calls", flush=True)
        total_bash_calls += len(cmds)
        for cmd in cmds:
            pattern = normalize_command(cmd)
            counter[pattern] += 1
        total_files += 1

    print(f"\n{'='*60}")
    print(f"Total files scanned: {total_files}")
    print(f"Total Bash calls: {total_bash_calls}")
    print(f"Unique patterns: {len(counter)}")
    print(f"{'='*60}\n")

    for pattern, count in counter.most_common():
        print(f"{count} | {pattern}")

if __name__ == "__main__":
    main()
