// Git nabız yoklaması: 10 sn'de bir HEAD + branch; değişince olay yayınlar.
// İlk tur sessizce tohumlar (her sunucu açılışında sahte kutlama olmasın).

import { execFile } from 'node:child_process';
import { makeEvent } from './events.mjs';

const GIT_ACTOR = { kind: 'system', id: 'git', label: 'git' };

export function startGitPoll(repoRoot, onEvent, intervalMs = 10_000) {
  let lastHead = null;
  let lastBranch = null;
  let seeded = false;
  let inFlight = false;

  const git = (args) => new Promise((res) => {
    execFile('git', args, { cwd: repoRoot }, (err, out) => res(err ? null : out.trim()));
  });

  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const head = await git(['log', '-1', '--format=%H|%an|%s']);
      const branch = await git(['branch', '--show-current']);
      if (head && head !== lastHead) {
        if (seeded) {
          const [hash, author, ...rest] = head.split('|');
          onEvent(makeEvent({
            type: 'commit', actor: GIT_ACTOR, roomId: 'sunucu',
            meta: { hash: hash.slice(0, 7), author, subject: rest.join('|') },
          }));
        }
        lastHead = head;
      }
      if (branch && branch !== lastBranch) {
        if (seeded) {
          onEvent(makeEvent({ type: 'branch', actor: GIT_ACTOR, meta: { branch } }));
        }
        lastBranch = branch;
      }
      seeded = true;
    } finally {
      inFlight = false;
    }
  };

  tick();
  const iv = setInterval(tick, intervalMs);
  return () => clearInterval(iv);
}
