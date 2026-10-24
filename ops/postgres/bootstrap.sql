-- One-time setup on PostgreSQL 15 (LXC 102), run by the user as the postgres superuser:
--   psql -U postgres -f ops/postgres/bootstrap.sql
-- No passwords in this file: set them interactively afterwards (see ops/README.md §2).

-- Group roles (no login) hold privileges; login roles inherit them.
CREATE ROLE aivideo_n8n NOLOGIN;
CREATE ROLE aivideo_worker NOLOGIN;

-- Owner: runs migrations (dbmate) and ops/postgres/grants.sql.
CREATE ROLE aivideo_owner LOGIN;
-- n8n on LXC 104.
CREATE ROLE aivideo_n8n_lxc104 LOGIN IN ROLE aivideo_n8n;
-- One login role per worker machine (D-010), so a leaked credential is scoped to one Mac.
CREATE ROLE aivideo_worker_mac_mini_m4 LOGIN IN ROLE aivideo_worker;

CREATE DATABASE aivideo OWNER aivideo_owner;

\connect aivideo
ALTER SCHEMA public OWNER TO aivideo_owner;
REVOKE ALL ON DATABASE aivideo FROM PUBLIC;
GRANT CONNECT ON DATABASE aivideo TO aivideo_owner, aivideo_n8n, aivideo_worker;
