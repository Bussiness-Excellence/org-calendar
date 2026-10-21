# Backups and restore

Every night the **Database backup** workflow saves an encrypted copy of the whole
database (all organizations, people, teams, events, notifications and logins).
Each copy is kept for 90 days on the run page under **Artifacts**.
Organization logos live in Supabase Storage and are not in the backup; admins can
upload them again.

## Turn it on (once)

Repository → Settings → Secrets and variables → Actions → New repository secret:

| Name | Value |
| --- | --- |
| `SUPABASE_DB_URL` | Supabase dashboard → **Connect** → **Session pooler** → copy the URI and replace `[YOUR-PASSWORD]` with the database password (Project Settings → Database → Reset password if you don't know it) |
| `BACKUP_PASSPHRASE` | the passphrase in `backup-passphrase.txt` from the launch kit |

Then Actions → **Database backup** → **Run workflow** to make the first copy.

## Restore

1. Download the artifact you want and unzip it to get `org-calendar-YYYY-MM-DD.dump.enc`.
2. Decrypt:
   `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:'YOUR_PASSPHRASE' -in org-calendar-YYYY-MM-DD.dump.enc -out backup.dump`
3. Restore into the project (or a new one that has `supabase/schema.sql` and the migrations applied):
   `pg_restore --data-only --disable-triggers --no-owner -d "SESSION_POOLER_URI" backup.dump`

To restore one table only, add `--table=assignments` (for example).
