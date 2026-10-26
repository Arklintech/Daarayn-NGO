# Removing the revoked SMTP password from publishable Git history (plan only, not executed)

State: the old Gmail App Password is revoked (Gmail returns 535) and is no longer in any working-tree file. It remains in local commit `3b244e1` (and anything built on it). `origin` only has `main`, which does not contain it; this branch has never been pushed. Revocation already makes the value useless, so this is hygiene, but do it before the first push of this branch.

Preferred, least invasive: **do not push the old commits at all.**
1. Backup first: `git bundle create D:\backup\daarayn-before-cleanup.bundle --all` and copy the repository folder.
2. Create a new branch from `origin/main` and bring over only the finished work as fresh commits (cherry-pick the clean commits, re-create the commit that touched the credential without the literal). Push that branch, never `fix/realtime-donations-khizr-removal`.

If the existing branch must be pushed: rewrite it with `git filter-repo` (install separately):
1. Work on a fresh clone of the backup bundle.
2. Put the revoked value in a replacements file (one line `literal==>REDACTED`) kept outside the repo and never committed.
3. `git filter-repo --replace-text <that file>` (removes it from all commits and blobs), then expire reflog and `git gc --prune=now --aggressive`.
4. Verify: `git log --all -p -S"<literal>"` prints nothing (run locally; do not paste the value into chats), and `git grep` across all revisions finds none.
5. Only then add the remote and push the rewritten branch. Collaborators must re-clone.

Also: the new App Password appeared in chat screenshots; if this transcript is shared, replace it. Keep `.env.local`, `.secrets/`, the service-account JSON and the OAuth client JSON out of Git (already ignored; verified untracked).
