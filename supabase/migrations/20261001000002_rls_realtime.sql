-- Row level security: anon may only read public game data.
-- All writes go through the API with the service role key.

alter table games        enable row level security;
alter table teams        enable row level security;
alter table team_secrets enable row level security;
alter table posts        enable row level security;
alter table role_tokens  enable row level security;
alter table stock        enable row level security;
alter table job_counts   enable row level security;
alter table world_events enable row level security;
alter table requests     enable row level security;
alter table actions      enable row level security;
alter table raids        enable row level security;

create policy "public read" on games        for select to anon, authenticated using (true);
create policy "public read" on teams        for select to anon, authenticated using (true);
create policy "public read" on posts        for select to anon, authenticated using (true);
create policy "public read" on stock        for select to anon, authenticated using (true);
create policy "public read" on job_counts   for select to anon, authenticated using (true);
create policy "public read" on world_events for select to anon, authenticated using (true);
create policy "public read" on actions      for select to anon, authenticated using (true);
create policy "public read" on raids        for select to anon, authenticated using (true);
-- team_secrets, role_tokens, requests: no policy = no anon access.

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on team_secrets, role_tokens, requests from anon, authenticated;

-- Functions are private unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

alter publication supabase_realtime add table
  games, teams, posts, stock, job_counts, world_events, actions, raids;
