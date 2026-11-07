-- What the Claude steps used (Q-004): read from the `claude` field of each succeeded job's result.
-- Read-only. Run by the owner, never by an agent:
--   psql "$DATABASE_URL" -v video=<video uuid> -f ops/postgres/claude-usage.sql   -- one video
--   psql "$DATABASE_URL" -f ops/postgres/claude-usage.sql                         -- last 30 days
-- USD = the CLI's own estimate at API list prices (`total_cost_usd`). On the Max subscription
-- nothing is billed per request: it is what the run would cost on the Claude API.
-- episode_code keeps one figure per agent turn. On `--resume` the CLI may report the session's
-- running total, in which case the largest turn is the real cost and the sum counts turns twice;
-- both are shown until that is confirmed. Jobs from before this report have no figure and are skipped.

CREATE TEMP VIEW claude_job AS
SELECT j.id,
       j.step,
       j.updated_at,
       vv.video_id,
       c.claude,
       coalesce((c.claude ->> 'cost_usd')::numeric, turns.total) AS cost_usd,
       coalesce((c.claude ->> 'cost_usd')::numeric, turns.largest) AS max_turn_usd,
       coalesce((c.claude -> 'usage' ->> 'output_tokens')::bigint, 0) AS output_tokens,
       coalesce((c.claude -> 'usage' ->> 'cache_read_input_tokens')::bigint, 0) AS cache_read_tokens
FROM job j
JOIN video_version vv ON vv.id = j.video_version_id
CROSS JOIN LATERAL (SELECT j.output -> 'result' -> 'claude' AS claude) c
LEFT JOIN LATERAL (
  SELECT sum(t::numeric) AS total, max(t::numeric) AS largest
  FROM jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(c.claude -> 'turn_costs_usd') = 'array'
              THEN c.claude -> 'turn_costs_usd' ELSE '[]'::jsonb END) t
) turns ON true
WHERE j.status = 'SUCCEEDED' AND c.claude IS NOT NULL;

CREATE TEMP VIEW claude_job_models AS
SELECT cj.id, string_agg(DISTINCT m, ' ' ORDER BY m) AS models
FROM claude_job cj
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(cj.claude -> 'models') = 'array'
       THEN cj.claude -> 'models' ELSE '[]'::jsonb END) m
GROUP BY cj.id;

\if :{?video}

\echo '== Claude usage of one video (one row per succeeded job)'
SELECT cj.step,
       round(cj.cost_usd, 2) AS cost_usd,
       round(cj.max_turn_usd, 2) AS max_turn_usd,
       cj.output_tokens,
       cj.cache_read_tokens,
       m.models
FROM claude_job cj
LEFT JOIN claude_job_models m ON m.id = cj.id
WHERE cj.video_id = :'video' AND cj.cost_usd IS NOT NULL
ORDER BY cj.updated_at;

\else

\echo '== Claude usage per step, last 30 days (succeeded jobs that report it)'
SELECT cj.step,
       count(*) AS jobs,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY cj.cost_usd)::numeric, 2) AS median_usd,
       round(max(cj.cost_usd), 2) AS max_usd,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY cj.max_turn_usd)::numeric, 2)
         AS median_max_turn_usd,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY cj.output_tokens)::numeric)
         AS median_output_tokens,
       string_agg(DISTINCT m.models, ' ') AS models
FROM claude_job cj
LEFT JOIN claude_job_models m ON m.id = cj.id
WHERE cj.cost_usd IS NOT NULL AND cj.updated_at > now() - interval '30 days'
GROUP BY cj.step
ORDER BY median_usd DESC;

\endif
