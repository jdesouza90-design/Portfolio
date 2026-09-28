#!/usr/bin/env python3
"""Deck sync: keep John's interview deck in step with the site.

The deck (a Claude Artifact, see CLAUDE.md) mirrors the site's content pages,
and John wants the two changed together. This hook puts that in front of the
session at the moments it matters:

  PostToolUse, Edit or Write  the first edit of a content page in a session
  PostToolUse, Bash           every `git commit` whose commit changes a content
                              page (beyond cache stamps) or a case-study image
  SessionStart                entries a session without deck access left in
                              DECK-PENDING.md, so this one applies them

It is registered twice on John's Mac: in this repo's .claude/settings.json and
in his user settings (which run the copy on origin/main, so a checkout sitting
on an old branch still gets it). A marker per tool call and per commit keeps
the two registrations from both speaking. It never blocks anything.
"""
import json
import os
import re
import subprocess
import sys
import tempfile

DECK = 'https://claude.ai/artifact/VGcbxmLiVZPo1tD7tsdo5L'
VANTA = 'https://claude.ai/artifact/G3KAnpzqvxt9oKHVMyqt1w'   # the Vanta copy: every change reaches it too (John, Sep 28 2026)
PAGE = re.compile(r'^(index\.html|work\.html|work/[^/]+\.html)$')
IMAGE = re.compile(r'^assets/(?!blog/|BE/)[^/]+\.(webp|png|jpe?g|gif|svg|mp4|webm)$')
STAMP = re.compile(r'\?v=[a-f0-9]+')
COMMIT = re.compile(r'\bgit\b(?:\s+-C\s+\S+)?\s+commit(?![-\w])')

REMIND = (
    'Deck sync: {what}. John\'s interview decks mirror these pages, so update the matching '
    'slides in this same pass, before you call the work done ("Deck sync" in CLAUDE.md: the '
    'main deck is ' + DECK + ' and the Vanta copy is ' + VANTA + ', and every change reaches '
    'both; list each one\'s files, read the slides you will change, edit them, publish to the '
    'same url, and name the slides in your final message). Skip only a change the deck '
    'cannot show (markup, CSS, motion, accessibility), and say that you skipped it. If this '
    'session cannot reach the deck, add an entry to DECK-PENDING.md at the repo root and commit '
    'it with the change.'
)


def git(repo, *args):
    try:
        r = subprocess.run(['git', '-C', repo, *args], capture_output=True, text=True, timeout=8)
        return r.stdout if r.returncode == 0 else ''
    except Exception:
        return ''


def first(key):
    """True the first time a key is seen; atomic, so two registrations never both speak."""
    name = 'deck-sync-' + re.sub(r'[^A-Za-z0-9_.-]', '_', key)
    try:
        os.close(os.open(os.path.join(tempfile.gettempdir(), name), os.O_CREAT | os.O_EXCL | os.O_WRONLY))
        return True
    except FileExistsError:
        return False
    except OSError:
        return True


def say(event, text):
    print(json.dumps({'hookSpecificOutput': {'hookEventName': event, 'additionalContext': text}}))


def visible(repo, path):
    """False when a commit changed this page's cache stamps and nothing else."""
    removed, added = [], []
    for line in git(repo, 'diff', '-U0', 'HEAD^', 'HEAD', '--', path).splitlines():
        if line.startswith('-') and not line.startswith('---'):
            removed.append(STAMP.sub('', line[1:]))
        elif line.startswith('+') and not line.startswith('+++'):
            added.append(STAMP.sub('', line[1:]))
    return sorted(removed) != sorted(added)


def on_start(data):
    cwd = data.get('cwd') or os.getcwd()
    root = git(cwd, 'rev-parse', '--show-toplevel').strip() or cwd
    text = git(root, 'show', 'origin/main:DECK-PENDING.md')
    try:
        with open(os.path.join(root, 'DECK-PENDING.md')) as f:
            text += '\n' + f.read()
    except OSError:
        pass
    entries = list(dict.fromkeys(l.strip() for l in text.splitlines() if l.startswith('- ')))
    if entries and first(data.get('session_id', 'none') + '-start'):
        say('SessionStart',
            'Deck sync: DECK-PENDING.md lists ' + str(len(entries)) + ' site change(s) the deck does '
            'not have yet: ' + ' | '.join(entries[:6]) + '. Tell John at the start of your reply, '
            'apply them to both decks, the main one and the Vanta copy ("Deck sync" in CLAUDE.md), '
            'then clear the entries on a branch '
            'and merge it.')


def on_edit(data):
    path = (data.get('tool_input') or {}).get('file_path') or ''
    if not path:
        return
    path = os.path.abspath(path)
    root = git(os.path.dirname(path), 'rev-parse', '--show-toplevel').strip()
    if not root:
        return
    rel = os.path.relpath(path, root)
    if PAGE.match(rel) and first(data.get('session_id', 'none') + '-edit'):
        say('PostToolUse', REMIND.format(what=rel + ' is a content page and this session is editing it'))


def on_bash(data):
    cmd = (data.get('tool_input') or {}).get('command') or ''
    if not COMMIT.search(cmd):
        return
    cwd = data.get('cwd') or os.getcwd()
    m = re.search(r'\bgit\s+-C\s+("[^"]+"|\'[^\']+\'|\S+)', cmd) or re.search(r'\bcd\s+("[^"]+"|\'[^\']+\'|\S+)', cmd)
    repo = os.path.expanduser(m.group(1).strip('"\'')) if m else cwd
    if not os.path.isabs(repo):
        repo = os.path.join(cwd, repo)
    sha = git(repo, 'rev-parse', 'HEAD').strip()
    if not sha:
        return
    changed = git(repo, 'diff', '--name-only', 'HEAD^', 'HEAD').split()
    hits = [f for f in changed if (PAGE.match(f) and visible(repo, f)) or IMAGE.match(f)]
    if hits and first(data.get('session_id', 'none') + '-' + sha):
        listed = ', '.join(hits[:6]) + (' and more' if len(hits) > 6 else '')
        say('PostToolUse', REMIND.format(what='commit ' + sha[:7] + ' changes ' + listed))


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    event = data.get('hook_event_name', '')
    tool = data.get('tool_name', '')
    if event == 'SessionStart':
        on_start(data)
    elif event == 'PostToolUse' and tool in ('Edit', 'Write', 'MultiEdit'):
        on_edit(data)
    elif event == 'PostToolUse' and tool == 'Bash':
        on_bash(data)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        pass
