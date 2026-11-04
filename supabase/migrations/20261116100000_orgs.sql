-- Singularity Orgs: Organizations, Corporations and Hero Agencies, their ranks and members,
-- group wallets in the economy, and the hero duties that rank the agencies.
--
-- Run once in the SQL Editor after every Divine Database and bot migration.
--
-- How access works:
--   * Everything about an approved group is public: profile, ranks, members, wallet and duties.
--     Reads go through the functions below; the tables have row-level security on and no policies.
--   * Creating a group is Permission Based: a player requests it with one of their approved
--     characters as leader and an admin approves it. Approval opens the group's wallet.
--   * Each group names its own ranks. A rank can carry powers: manage members, spend from the
--     wallet, edit the profile. The leader rank has all of them, and a group has one leader.
--   * A character asks to join and someone with the manage-members power accepts. A character can
--     be in any number of groups.
--   * Hero duties: an agency member logs a duty (a tier plus a link to the RP), an admin approves
--     it, and the agency gets the tier's points. The ranking counts the last 30 days (duties and
--     admin awards); admins can pin an agency to a position.
--   * Every action is an org_* function taking the actor's Discord ID, which the bot calls with the
--     service-role key. The site calls the orgs_* wrappers, which pass the logged-in player's ID.


-- ───────────────────────────── Tables ─────────────────────────────

create table public.org_groups (
	id uuid primary key default gen_random_uuid(),
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	kind text not null check (kind in ('organization', 'corporation', 'agency')),
	name text not null check (char_length(btrim(name)) between 2 and 60),
	-- pending: waiting for an admin · needs_correction: sent back, the requester edits and resends ·
	-- approved: live · denied: final
	status text not null default 'pending' check (status in ('pending', 'approved', 'needs_correction', 'denied')),
	tagline text not null default '' check (char_length(tagline) <= 160),
	about text not null default '' check (char_length(about) <= 12000),
	logo_url text not null default '' check (logo_url = '' or logo_url ~ '^https://'),
	banner_url text not null default '' check (banner_url = '' or banner_url ~ '^https://'),
	colour text not null default '#2fb45a' check (colour ~ '^#[0-9a-fA-F]{6}$'),
	headquarters text not null default '' check (char_length(headquarters) <= 160),
	discord_url text not null default '' check (discord_url = '' or discord_url ~ '^https://(www\.)?(discord\.gg|discord\.com)/'),
	recruiting boolean not null default true,
	-- The group's wallet, opened on approval. Its leader and spending ranks manage it.
	account_id uuid unique references public.econ_accounts (id) on delete restrict,
	requested_by text not null,
	review_note text not null default '' check (char_length(review_note) <= 2000),
	submitted_at timestamptz not null default now(),
	reviewed_at timestamptz,
	reviewed_by text,
	approved_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
create unique index org_groups_name on public.org_groups (lower(name)) where status <> 'denied';

create table public.org_ranks (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references public.org_groups (id) on delete cascade,
	title text not null check (char_length(btrim(title)) between 1 and 40),
	-- Lower sorts first: the leader rank is 0.
	sort int not null default 0,
	is_leader boolean not null default false,
	can_manage boolean not null default false,
	can_spend boolean not null default false,
	can_edit boolean not null default false,
	unique (group_id, title)
);
create unique index org_ranks_one_leader on public.org_ranks (group_id) where is_leader;

create table public.org_members (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references public.org_groups (id) on delete cascade,
	character_id uuid not null references public.characters (id) on delete cascade,
	rank_id uuid not null references public.org_ranks (id) on delete restrict,
	status text not null default 'requested' check (status in ('requested', 'active')),
	message text not null default '' check (char_length(message) <= 500),
	requested_by text,
	created_at timestamptz not null default now(),
	joined_at timestamptz,
	unique (group_id, character_id)
);
create index org_members_character_idx on public.org_members (character_id);

-- What a hero duty is worth. Admins edit these; retired tiers stay on old duties.
create table public.org_duty_tiers (
	id uuid primary key default gen_random_uuid(),
	name text not null unique check (char_length(btrim(name)) between 1 and 60),
	points int not null check (points between 1 and 1000),
	description text not null default '' check (char_length(description) <= 300),
	sort int not null default 0,
	retired boolean not null default false
);

insert into public.org_duty_tiers (name, points, description, sort) values
	('Patrol', 1, 'A patrol, guard shift or minor incident.', 1),
	('Rescue', 3, 'Saving civilians from danger.', 2),
	('Villain Capture', 5, 'Stopping and apprehending a villain.', 3),
	('Disaster Response', 10, 'A major disaster or city-wide threat.', 4);

create table public.org_duties (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references public.org_groups (id) on delete cascade,
	character_id uuid not null references public.characters (id) on delete cascade,
	tier_id uuid not null references public.org_duty_tiers (id) on delete restrict,
	summary text not null check (char_length(btrim(summary)) between 1 and 200),
	details text not null default '' check (char_length(details) <= 4000),
	link text not null check (link ~ '^https://'),
	status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
	-- The tier's points when it was approved, so later tier edits don't rewrite history.
	points int not null default 0,
	submitted_by text not null,
	review_note text not null default '' check (char_length(review_note) <= 1000),
	created_at timestamptz not null default now(),
	reviewed_at timestamptz,
	reviewed_by text
);
create index org_duties_group_idx on public.org_duties (group_id, status, reviewed_at desc);

-- Points an admin gives (or takes, when negative) outside of duties, e.g. for an event.
create table public.org_point_awards (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references public.org_groups (id) on delete cascade,
	points int not null check (points <> 0 and points between -10000 and 10000),
	reason text not null check (char_length(btrim(reason)) between 1 and 200),
	created_by text not null,
	created_at timestamptz not null default now()
);
create index org_point_awards_group_idx on public.org_point_awards (group_id, created_at desc);

-- An agency an admin holds at a fixed place on the ranking.
create table public.org_ranking_pins (
	group_id uuid primary key references public.org_groups (id) on delete cascade,
	position int not null unique check (position between 1 and 100),
	note text not null default '' check (char_length(note) <= 200)
);

alter table public.org_groups enable row level security;
alter table public.org_ranks enable row level security;
alter table public.org_members enable row level security;
alter table public.org_duty_tiers enable row level security;
alter table public.org_duties enable row level security;
alter table public.org_point_awards enable row level security;
alter table public.org_ranking_pins enable row level security;


-- ───────────────────────────── Group wallets in the economy ─────────────────────────────

-- Group wallets are custom economy profiles with the category 'group'.
alter table public.econ_accounts drop constraint econ_accounts_category_check;
alter table public.econ_accounts add constraint econ_accounts_category_check
	check (category in ('npc', 'faction', 'business', 'group'));

-- A group wallet's name, picture and description follow the group. Only this file's functions
-- change them (they set orgs.sync); balances move as usual.
create function public.guard_group_wallet()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	if coalesce(current_setting('orgs.sync', true), '') <> 'on'
		and exists (select 1 from public.org_groups where account_id = old.id)
		and (new.name, new.category, new.description, new.image_url)
			is distinct from (old.name, old.category, old.description, old.image_url) then
		raise exception 'This wallet belongs to a group. Edit the group on Singularity Orgs instead.' using errcode = 'P0001';
	end if;
	return new;
end;
$$;

create trigger guard_group_wallet before update on public.econ_accounts
	for each row execute function public.guard_group_wallet();

-- Groups can own shops too. Same as the bot's version apart from the category check.
create or replace function public.econ_request_shop(
	p_account uuid,
	p_name text,
	p_description text,
	p_image text,
	p_actor text
)
returns public.econ_shops
language plpgsql
security definer
set search_path = ''
as $$
declare
	acct public.econ_accounts;
	admin boolean := public.econ_is_admin(p_actor);
	result public.econ_shops;
begin
	select * into acct from public.econ_accounts where id = p_account;
	if acct.id is null then
		raise exception 'That wallet doesn''t exist.' using errcode = 'P0001';
	end if;
	if acct.kind = 'custom' and acct.category not in ('business', 'group') then
		raise exception 'Only characters, businesses and groups can own shops.' using errcode = 'P0001';
	end if;
	if not (admin or public.econ_can_spend(p_account, p_actor)) then
		raise exception 'You can only request a shop for your own character or a business you manage.' using errcode = '42501';
	end if;
	if exists (select 1 from public.econ_shops where lower(name) = lower(btrim(p_name)) and status <> 'denied') then
		raise exception 'There is already a shop called %.', btrim(p_name) using errcode = 'P0001';
	end if;
	if not admin and (select count(*) from public.econ_shops where requested_by = p_actor and status = 'pending') >= 3 then
		raise exception 'You already have 3 shop requests waiting for review.' using errcode = 'P0001';
	end if;

	insert into public.econ_shops (account_id, name, description, image_url, status, requested_by, reviewed_by, approved_at)
	values (
		p_account,
		btrim(p_name),
		coalesce(btrim(p_description), ''),
		nullif(btrim(p_image), ''),
		case when admin then 'open' else 'pending' end,
		p_actor,
		case when admin then p_actor end,
		case when admin then now() end
	)
	returning * into result;
	return result;
end;
$$;


-- ───────────────────────────── Helpers ─────────────────────────────

-- The logged-in player's Discord ID, or null when logged out (reads work logged out).
create function public.orgs_viewer()
returns text
language sql
stable
security definer
set search_path = ''
as $$
	select discord_id from public.profiles where id = auth.uid();
$$;

create function public.org_character_name(c public.characters)
returns text
language sql
immutable
set search_path = ''
as $$
	select coalesce(nullif(c.approved_name, ''), c.name);
$$;

-- The actor's approved character, or an error.
create function public.org_own_character(p_character uuid, p_actor text)
returns public.characters
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	ch public.characters;
begin
	select c.* into ch
	from public.characters c
	join public.profiles p on p.id = c.owner_id
	where c.id = p_character and p.discord_id = p_actor;
	if ch.id is null then
		raise exception 'That isn''t one of your characters.' using errcode = '42501';
	end if;
	if ch.approved_at is null or ch.status = 'denied' then
		raise exception 'Only approved characters can do that.' using errcode = 'P0001';
	end if;
	return ch;
end;
$$;

-- The actor's powers in a group: the best of their active characters' ranks. Admins have all.
create function public.org_powers(p_group uuid, p_actor text)
returns table (is_leader boolean, can_manage boolean, can_spend boolean, can_edit boolean, is_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
	select
		public.econ_is_admin(p_actor) or coalesce(bool_or(r.is_leader), false),
		public.econ_is_admin(p_actor) or coalesce(bool_or(r.is_leader or r.can_manage), false),
		public.econ_is_admin(p_actor) or coalesce(bool_or(r.is_leader or r.can_spend), false),
		public.econ_is_admin(p_actor) or coalesce(bool_or(r.is_leader or r.can_edit), false),
		count(m.id) > 0
	from public.org_members m
	join public.org_ranks r on r.id = m.rank_id
	join public.characters c on c.id = m.character_id
	join public.profiles p on p.id = c.owner_id
	where m.group_id = p_group and m.status = 'active' and p.discord_id = p_actor;
$$;

create function public.org_require(p_group uuid, p_actor text, p_power text)
returns public.org_groups
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	g public.org_groups;
	pw record;
	allowed boolean;
begin
	select * into g from public.org_groups where id = p_group;
	if g.id is null then
		raise exception 'That group doesn''t exist.' using errcode = 'P0001';
	end if;
	select * into pw from public.org_powers(p_group, p_actor);
	allowed := case p_power
		when 'leader' then pw.is_leader
		when 'manage' then pw.can_manage
		when 'edit' then pw.can_edit or g.requested_by = p_actor
		else false end;
	if not allowed then
		raise exception 'You don''t have the rank to do that in %.', g.name using errcode = '42501';
	end if;
	return g;
end;
$$;

-- 'The Iron Hand' → 'the-iron-hand', made unique with a number if needed.
create function public.org_slug(p_name text, p_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
	base text := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
	candidate text;
	n int := 1;
begin
	if base = '' then base := 'group'; end if;
	candidate := base;
	while exists (select 1 from public.org_groups where slug = candidate and id <> p_id) loop
		n := n + 1;
		candidate := base || '-' || n;
	end loop;
	return candidate;
end;
$$;

-- Keeps the wallet's managers in step with the group: the owners of active members whose rank
-- can spend. Managers an admin added by hand (added_by isn't 'orgs') are left alone.
create function public.org_sync_wallet(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	g public.org_groups;
begin
	select * into g from public.org_groups where id = p_group;
	if g.account_id is null then return; end if;
	perform set_config('orgs.sync', 'on', true);
	update public.econ_accounts
	set name = g.name, description = g.tagline, image_url = nullif(g.logo_url, ''), updated_at = now()
	where id = g.account_id
		and (name, description, coalesce(image_url, '')) is distinct from (g.name, g.tagline, g.logo_url);
	perform set_config('orgs.sync', 'off', true);

	delete from public.econ_account_managers am
	where am.account_id = g.account_id and am.added_by = 'orgs'
		and am.discord_id not in (
			select p.discord_id
			from public.org_members m
			join public.org_ranks r on r.id = m.rank_id
			join public.characters c on c.id = m.character_id
			join public.profiles p on p.id = c.owner_id
			where m.group_id = p_group and m.status = 'active' and (r.is_leader or r.can_spend));
	insert into public.econ_account_managers (account_id, discord_id, added_by)
	select distinct g.account_id, p.discord_id, 'orgs'
	from public.org_members m
	join public.org_ranks r on r.id = m.rank_id
	join public.characters c on c.id = m.character_id
	join public.profiles p on p.id = c.owner_id
	where m.group_id = p_group and m.status = 'active' and (r.is_leader or r.can_spend)
	on conflict do nothing;
end;
$$;

-- The rank new members get: the last one that isn't the leader rank.
create function public.org_default_rank(p_group uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
	select id from public.org_ranks where group_id = p_group and not is_leader order by sort desc, title limit 1;
$$;

-- Ranking points: approved duties and admin awards from the last 30 days.
create function public.org_points(p_group uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce((select sum(points) from public.org_duties
			where group_id = p_group and status = 'approved' and reviewed_at > now() - interval '30 days'), 0)
		+ coalesce((select sum(points) from public.org_point_awards
			where group_id = p_group and created_at > now() - interval '30 days'), 0);
$$;

-- Group fields a player can set, from a JSON object. Unknown keys are ignored.
create function public.org_apply_fields(g public.org_groups, p_fields jsonb)
returns public.org_groups
language plpgsql
immutable
set search_path = ''
as $$
begin
	g.name := coalesce(btrim(p_fields ->> 'name'), g.name);
	g.tagline := coalesce(btrim(p_fields ->> 'tagline'), g.tagline);
	g.about := coalesce(p_fields ->> 'about', g.about);
	g.logo_url := coalesce(btrim(p_fields ->> 'logo_url'), g.logo_url);
	g.banner_url := coalesce(btrim(p_fields ->> 'banner_url'), g.banner_url);
	g.colour := coalesce(btrim(p_fields ->> 'colour'), g.colour);
	g.headquarters := coalesce(btrim(p_fields ->> 'headquarters'), g.headquarters);
	g.discord_url := coalesce(btrim(p_fields ->> 'discord_url'), g.discord_url);
	g.recruiting := coalesce((p_fields ->> 'recruiting')::boolean, g.recruiting);
	return g;
end;
$$;


-- ───────────────────────────── Groups ─────────────────────────────

-- A player asks for a new group, led by one of their approved characters.
create function public.org_request(p_kind text, p_leader uuid, p_fields jsonb, p_actor text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	g public.org_groups;
	leader_rank uuid;
begin
	perform public.org_own_character(p_leader, p_actor);
	if p_kind not in ('organization', 'corporation', 'agency') then
		raise exception 'Pick Organization, Corporation or Hero Agency.' using errcode = 'P0001';
	end if;
	if not public.econ_is_admin(p_actor)
		and (select count(*) from public.org_groups where requested_by = p_actor and status in ('pending', 'needs_correction')) >= 3 then
		raise exception 'You already have 3 group requests waiting.' using errcode = 'P0001';
	end if;
	g.id := gen_random_uuid();
	g.kind := p_kind;
	g := public.org_apply_fields(g, p_fields);
	if g.name is null then
		raise exception 'Give the group a name.' using errcode = 'P0001';
	end if;
	if exists (select 1 from public.org_groups where lower(name) = lower(g.name) and status <> 'denied') then
		raise exception 'There is already a group called %.', g.name using errcode = 'P0001';
	end if;

	insert into public.org_groups (id, slug, kind, name, tagline, about, logo_url, banner_url, colour, headquarters, discord_url, recruiting, requested_by)
	values (g.id, public.org_slug(g.name, g.id), g.kind, g.name, coalesce(g.tagline, ''), coalesce(g.about, ''), coalesce(g.logo_url, ''),
		coalesce(g.banner_url, ''), coalesce(g.colour, '#2fb45a'), coalesce(g.headquarters, ''), coalesce(g.discord_url, ''),
		coalesce(g.recruiting, true), p_actor);

	insert into public.org_ranks (group_id, title, sort, is_leader, can_manage, can_spend, can_edit)
	values (g.id, case p_kind when 'corporation' then 'CEO' when 'agency' then 'Agency Head' else 'Leader' end, 0, true, true, true, true)
	returning id into leader_rank;
	insert into public.org_ranks (group_id, title, sort, can_manage, can_spend, can_edit) values
		(g.id, case p_kind when 'corporation' then 'Executive' when 'agency' then 'Sidekick Lead' else 'Officer' end, 1, true, true, false),
		(g.id, case p_kind when 'corporation' then 'Employee' when 'agency' then 'Hero' else 'Member' end, 2, false, false, false);
	insert into public.org_members (group_id, character_id, rank_id, status, requested_by, joined_at)
	values (g.id, p_leader, leader_rank, 'active', p_actor, now());
	return g.id;
end;
$$;

-- Edit a group's page. Before approval the requester can also rename it; afterwards only admins can.
create function public.org_update(p_group uuid, p_fields jsonb, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	g public.org_groups := public.org_require(p_group, p_actor, 'edit');
	old_name text := g.name;
begin
	if g.status = 'denied' then
		raise exception 'This group was denied and is locked.' using errcode = 'P0001';
	end if;
	g := public.org_apply_fields(g, p_fields);
	if g.name is distinct from old_name then
		if g.status = 'approved' and not public.econ_is_admin(p_actor) then
			raise exception 'Only an admin can rename an approved group.' using errcode = '42501';
		end if;
		if exists (select 1 from public.org_groups where lower(name) = lower(g.name) and status <> 'denied' and id <> g.id)
			or (g.account_id is not null and exists (
				select 1 from public.econ_accounts where kind = 'custom' and lower(name) = lower(g.name) and id <> g.account_id)) then
			raise exception 'There is already a group or profile called %.', g.name using errcode = 'P0001';
		end if;
		g.slug := public.org_slug(g.name, g.id);
	end if;
	update public.org_groups
	set name = g.name, slug = g.slug, tagline = g.tagline, about = g.about, logo_url = g.logo_url, banner_url = g.banner_url,
		colour = g.colour, headquarters = g.headquarters, discord_url = g.discord_url, recruiting = g.recruiting, updated_at = now()
	where id = g.id;
	perform public.org_sync_wallet(g.id);
end;
$$;

-- The requester sends a group that was sent back for correction again.
create function public.org_resubmit(p_group uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.org_groups set status = 'pending', submitted_at = now(), updated_at = now()
	where id = p_group and status = 'needs_correction' and (requested_by = p_actor or public.econ_is_admin(p_actor));
	if not found then
		raise exception 'Only a group that was sent back can be sent again, by whoever requested it.' using errcode = 'P0001';
	end if;
end;
$$;

-- Admin decision on a group request. Approving opens the group's wallet.
create function public.org_review(p_group uuid, p_outcome text, p_note text, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	g public.org_groups;
	acct uuid;
begin
	perform public.econ_require_admin(p_actor);
	if p_outcome not in ('approved', 'needs_correction', 'denied') then
		raise exception 'Choose approved, needs_correction or denied.' using errcode = 'P0001';
	end if;
	select * into g from public.org_groups where id = p_group for update;
	if g.id is null then
		raise exception 'That group doesn''t exist.' using errcode = 'P0001';
	end if;
	if g.status = 'approved' and p_outcome <> 'approved' then
		raise exception 'This group is already approved.' using errcode = 'P0001';
	end if;
	if p_outcome = 'approved' and g.account_id is null then
		if exists (select 1 from public.econ_accounts where kind = 'custom' and lower(name) = lower(g.name)) then
			raise exception 'An economy profile is already called %. Rename one of them first.', g.name using errcode = 'P0001';
		end if;
		insert into public.econ_accounts (kind, name, category, description, image_url)
		values ('custom', g.name, 'group', g.tagline, nullif(g.logo_url, ''))
		returning id into acct;
	end if;
	update public.org_groups
	set status = p_outcome,
		review_note = coalesce(left(btrim(p_note), 2000), ''),
		reviewed_at = now(),
		reviewed_by = p_actor,
		approved_at = case when p_outcome = 'approved' then coalesce(approved_at, now()) else approved_at end,
		account_id = coalesce(account_id, acct),
		updated_at = now()
	where id = p_group;
	perform public.org_sync_wallet(p_group);
end;
$$;

-- Requesters can withdraw a group that isn't approved yet. Admins can delete any group whose wallet
-- is empty and owns no shops; its wallet goes with it.
create function public.org_delete(p_group uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	g public.org_groups;
	acct public.econ_accounts;
begin
	select * into g from public.org_groups where id = p_group;
	if g.id is null then
		raise exception 'That group doesn''t exist.' using errcode = 'P0001';
	end if;
	if not public.econ_is_admin(p_actor) and not (g.requested_by = p_actor and g.status in ('pending', 'needs_correction')) then
		raise exception 'Only an admin can delete this group.' using errcode = '42501';
	end if;
	if g.account_id is not null then
		select * into acct from public.econ_accounts where id = g.account_id;
		if acct.balance > 0 then
			raise exception 'Empty the group''s wallet first (it still has %).', acct.balance using errcode = 'P0001';
		end if;
		if exists (select 1 from public.econ_shops where account_id = g.account_id) then
			raise exception 'The group still owns a shop. Remove it in the economy first.' using errcode = 'P0001';
		end if;
	end if;
	delete from public.org_groups where id = p_group;
	if g.account_id is not null then
		delete from public.econ_accounts where id = g.account_id;
	end if;
end;
$$;


-- ───────────────────────────── Ranks ─────────────────────────────

-- The leader adds (p_rank null) or edits a rank. The leader rank keeps all its powers.
create function public.org_save_rank(
	p_group uuid, p_rank uuid, p_title text, p_sort int,
	p_manage boolean, p_spend boolean, p_edit boolean, p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	r public.org_ranks;
	result uuid;
begin
	perform public.org_require(p_group, p_actor, 'leader');
	if p_title is null or char_length(btrim(p_title)) = 0 then
		raise exception 'Give the rank a title.' using errcode = 'P0001';
	end if;
	if exists (select 1 from public.org_ranks where group_id = p_group and lower(title) = lower(btrim(p_title)) and id is distinct from p_rank) then
		raise exception 'There is already a rank called %.', btrim(p_title) using errcode = 'P0001';
	end if;
	if p_rank is null then
		if (select count(*) from public.org_ranks where group_id = p_group) >= 12 then
			raise exception 'A group can have up to 12 ranks.' using errcode = 'P0001';
		end if;
		insert into public.org_ranks (group_id, title, sort, can_manage, can_spend, can_edit)
		values (p_group, btrim(p_title), greatest(coalesce(p_sort, 1), 1), coalesce(p_manage, false), coalesce(p_spend, false), coalesce(p_edit, false))
		returning id into result;
	else
		select * into r from public.org_ranks where id = p_rank and group_id = p_group;
		if r.id is null then
			raise exception 'That rank isn''t in this group.' using errcode = 'P0001';
		end if;
		update public.org_ranks
		set title = btrim(p_title),
			sort = case when r.is_leader then 0 else greatest(coalesce(p_sort, r.sort), 1) end,
			can_manage = r.is_leader or coalesce(p_manage, r.can_manage),
			can_spend = r.is_leader or coalesce(p_spend, r.can_spend),
			can_edit = r.is_leader or coalesce(p_edit, r.can_edit)
		where id = p_rank
		returning id into result;
	end if;
	perform public.org_sync_wallet(p_group);
	return result;
end;
$$;

-- Only empty ranks can go, and never the leader rank or the last plain rank.
create function public.org_delete_rank(p_rank uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	r public.org_ranks;
begin
	select * into r from public.org_ranks where id = p_rank;
	if r.id is null then
		raise exception 'That rank doesn''t exist.' using errcode = 'P0001';
	end if;
	perform public.org_require(r.group_id, p_actor, 'leader');
	if r.is_leader then
		raise exception 'The leader rank can''t be removed.' using errcode = 'P0001';
	end if;
	if exists (select 1 from public.org_members where rank_id = p_rank) then
		raise exception 'Move everyone out of % first.', r.title using errcode = 'P0001';
	end if;
	if (select count(*) from public.org_ranks where group_id = r.group_id and not is_leader) <= 1 then
		raise exception 'A group needs at least one rank besides the leader.' using errcode = 'P0001';
	end if;
	delete from public.org_ranks where id = p_rank;
end;
$$;


-- ───────────────────────────── Members ─────────────────────────────

create function public.org_ask_join(p_group uuid, p_character uuid, p_message text, p_actor text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	g public.org_groups;
	result uuid;
begin
	perform public.org_own_character(p_character, p_actor);
	select * into g from public.org_groups where id = p_group;
	if g.id is null or g.status <> 'approved' then
		raise exception 'That group isn''t open yet.' using errcode = 'P0001';
	end if;
	if not g.recruiting then
		raise exception '% isn''t recruiting right now.', g.name using errcode = 'P0001';
	end if;
	if exists (select 1 from public.org_members where group_id = p_group and character_id = p_character) then
		raise exception 'That character is already in % or has asked to join.', g.name using errcode = 'P0001';
	end if;
	insert into public.org_members (group_id, character_id, rank_id, status, message, requested_by)
	values (p_group, p_character, public.org_default_rank(p_group), 'requested', coalesce(left(btrim(p_message), 500), ''), p_actor)
	returning id into result;
	return result;
end;
$$;

-- Accept (into p_rank, or the default rank) or decline a join request.
create function public.org_respond_join(p_member uuid, p_accept boolean, p_rank uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	m public.org_members;
begin
	select * into m from public.org_members where id = p_member and status = 'requested';
	if m.id is null then
		raise exception 'That request isn''t waiting any more.' using errcode = 'P0001';
	end if;
	perform public.org_require(m.group_id, p_actor, 'manage');
	if not p_accept then
		delete from public.org_members where id = p_member;
		return;
	end if;
	update public.org_members set status = 'active', joined_at = now() where id = p_member;
	if p_rank is not null then
		perform public.org_set_rank(p_member, p_rank, p_actor);
	end if;
	perform public.org_sync_wallet(m.group_id);
end;
$$;

-- Managers move members between ranks without powers. Only the leader gives or takes ranks
-- that carry powers. The leader rank changes hands with org_transfer_leader.
create function public.org_set_rank(p_member uuid, p_rank uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	m public.org_members;
	old_rank public.org_ranks;
	new_rank public.org_ranks;
	pw record;
begin
	select * into m from public.org_members where id = p_member and status = 'active';
	if m.id is null then
		raise exception 'That member isn''t in the group.' using errcode = 'P0001';
	end if;
	perform public.org_require(m.group_id, p_actor, 'manage');
	select * into old_rank from public.org_ranks where id = m.rank_id;
	select * into new_rank from public.org_ranks where id = p_rank and group_id = m.group_id;
	if new_rank.id is null then
		raise exception 'That rank isn''t in this group.' using errcode = 'P0001';
	end if;
	if old_rank.is_leader or new_rank.is_leader then
		raise exception 'Use "hand over leadership" to change the leader.' using errcode = 'P0001';
	end if;
	select * into pw from public.org_powers(m.group_id, p_actor);
	if not pw.is_leader and (old_rank.can_manage or old_rank.can_spend or old_rank.can_edit
		or new_rank.can_manage or new_rank.can_spend or new_rank.can_edit) then
		raise exception 'Only the leader can give or take ranks with powers.' using errcode = '42501';
	end if;
	update public.org_members set rank_id = p_rank where id = p_member;
	perform public.org_sync_wallet(m.group_id);
end;
$$;

-- Leave (your own character), withdraw a request, or kick someone out. The leader can't leave
-- before handing over leadership, and only the leader kicks members whose rank has powers.
create function public.org_remove_member(p_member uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	m public.org_members;
	r public.org_ranks;
	own boolean;
	pw record;
begin
	select * into m from public.org_members where id = p_member;
	if m.id is null then
		raise exception 'That member isn''t in the group.' using errcode = 'P0001';
	end if;
	select * into r from public.org_ranks where id = m.rank_id;
	own := exists (
		select 1 from public.characters c join public.profiles p on p.id = c.owner_id
		where c.id = m.character_id and p.discord_id = p_actor);
	if m.status = 'active' and r.is_leader then
		raise exception 'The leader has to hand over leadership before leaving.' using errcode = 'P0001';
	end if;
	if not own then
		perform public.org_require(m.group_id, p_actor, 'manage');
		select * into pw from public.org_powers(m.group_id, p_actor);
		if m.status = 'active' and not pw.is_leader and (r.can_manage or r.can_spend or r.can_edit) then
			raise exception 'Only the leader can remove members whose rank has powers.' using errcode = '42501';
		end if;
	end if;
	delete from public.org_members where id = p_member;
	perform public.org_sync_wallet(m.group_id);
end;
$$;

-- The leader (or an admin) hands the group to another active member. The old leader takes the
-- new leader's old rank.
create function public.org_transfer_leader(p_group uuid, p_member uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	target public.org_members;
	leader public.org_members;
begin
	perform public.org_require(p_group, p_actor, 'leader');
	select * into target from public.org_members where id = p_member and group_id = p_group and status = 'active';
	if target.id is null then
		raise exception 'Pick an active member of the group.' using errcode = 'P0001';
	end if;
	select m.* into leader from public.org_members m join public.org_ranks r on r.id = m.rank_id
	where m.group_id = p_group and r.is_leader;
	if leader.id = target.id then
		return;
	end if;
	update public.org_members set rank_id = target.rank_id where id = leader.id;
	update public.org_members set rank_id = leader.rank_id where id = target.id;
	perform public.org_sync_wallet(p_group);
end;
$$;


-- ───────────────────────────── Hero duties and the ranking ─────────────────────────────

create function public.org_log_duty(
	p_group uuid, p_character uuid, p_tier uuid, p_summary text, p_details text, p_link text, p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	result uuid;
begin
	perform public.org_own_character(p_character, p_actor);
	if not exists (select 1 from public.org_groups where id = p_group and kind = 'agency' and status = 'approved') then
		raise exception 'Hero duties are logged for approved Hero Agencies.' using errcode = 'P0001';
	end if;
	if not exists (select 1 from public.org_members where group_id = p_group and character_id = p_character and status = 'active') then
		raise exception 'That character isn''t a member of this agency.' using errcode = 'P0001';
	end if;
	if not exists (select 1 from public.org_duty_tiers where id = p_tier and not retired) then
		raise exception 'Pick a duty type.' using errcode = 'P0001';
	end if;
	if (select count(*) from public.org_duties where submitted_by = p_actor and status = 'pending') >= 10 then
		raise exception 'You already have 10 duties waiting for review.' using errcode = 'P0001';
	end if;
	insert into public.org_duties (group_id, character_id, tier_id, summary, details, link, submitted_by)
	values (p_group, p_character, p_tier, btrim(p_summary), coalesce(btrim(p_details), ''), btrim(p_link), p_actor)
	returning id into result;
	return result;
end;
$$;

-- The player who logged a duty can withdraw it while it waits.
create function public.org_withdraw_duty(p_duty uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	delete from public.org_duties where id = p_duty and status = 'pending' and submitted_by = p_actor;
	if not found then
		raise exception 'Only your own duties that are still waiting can be withdrawn.' using errcode = 'P0001';
	end if;
end;
$$;

create function public.org_review_duty(p_duty uuid, p_approve boolean, p_note text, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.econ_require_admin(p_actor);
	update public.org_duties d
	set status = case when p_approve then 'approved' else 'denied' end,
		points = case when p_approve then (select points from public.org_duty_tiers where id = d.tier_id) else 0 end,
		review_note = coalesce(left(btrim(p_note), 1000), ''),
		reviewed_at = now(),
		reviewed_by = p_actor
	where id = p_duty and status = 'pending';
	if not found then
		raise exception 'That duty isn''t waiting for review (someone may have reviewed it already).' using errcode = 'P0001';
	end if;
end;
$$;

create function public.org_award(p_group uuid, p_points int, p_reason text, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.econ_require_admin(p_actor);
	if not exists (select 1 from public.org_groups where id = p_group and kind = 'agency' and status = 'approved') then
		raise exception 'Points go to approved Hero Agencies.' using errcode = 'P0001';
	end if;
	insert into public.org_point_awards (group_id, points, reason, created_by)
	values (p_group, p_points, btrim(p_reason), p_actor);
end;
$$;

-- Pin an agency to a place on the ranking (p_position null unpins it). Pinning to a taken place
-- moves the agency that was there off its pin.
create function public.org_pin(p_group uuid, p_position int, p_note text, p_actor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
	perform public.econ_require_admin(p_actor);
	delete from public.org_ranking_pins where group_id = p_group or position = p_position;
	if p_position is not null then
		if not exists (select 1 from public.org_groups where id = p_group and kind = 'agency' and status = 'approved') then
			raise exception 'Only approved Hero Agencies are ranked.' using errcode = 'P0001';
		end if;
		insert into public.org_ranking_pins (group_id, position, note) values (p_group, p_position, coalesce(btrim(p_note), ''));
	end if;
end;
$$;

-- Admins add (p_tier null) or edit a duty tier.
create function public.org_save_tier(p_tier uuid, p_name text, p_points int, p_description text, p_sort int, p_retired boolean, p_actor text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	result uuid;
begin
	perform public.econ_require_admin(p_actor);
	if p_tier is null then
		insert into public.org_duty_tiers (name, points, description, sort, retired)
		values (btrim(p_name), p_points, coalesce(btrim(p_description), ''), coalesce(p_sort, 0), coalesce(p_retired, false))
		returning id into result;
	else
		update public.org_duty_tiers
		set name = coalesce(btrim(p_name), name), points = coalesce(p_points, points),
			description = coalesce(btrim(p_description), description), sort = coalesce(p_sort, sort), retired = coalesce(p_retired, retired)
		where id = p_tier
		returning id into result;
		if result is null then
			raise exception 'That duty type doesn''t exist.' using errcode = 'P0001';
		end if;
	end if;
	return result;
end;
$$;

-- The Hero Agency Ranking: approved agencies by their last-30-day points. Pinned agencies hold
-- their place and the rest fill the free places in points order.
create function public.org_ranking()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	total int;
	slot int;
	placed jsonb := '{}';
	a record;
	result jsonb;
begin
	select count(*) into total from public.org_groups where kind = 'agency' and status = 'approved';

	-- Pins past the end of the list move up to the last free place.
	for a in
		select p.group_id, p.position from public.org_ranking_pins p
		join public.org_groups g on g.id = p.group_id
		where g.kind = 'agency' and g.status = 'approved'
		order by p.position
	loop
		slot := least(a.position, total);
		while placed ? slot::text loop
			slot := slot - 1;
		end loop;
		placed := placed || jsonb_build_object(slot::text, a.group_id);
	end loop;

	slot := 0;
	for a in
		select g.id from public.org_groups g
		where g.kind = 'agency' and g.status = 'approved'
			and not exists (select 1 from public.org_ranking_pins p where p.group_id = g.id)
		order by public.org_points(g.id) desc, lower(g.name)
	loop
		slot := slot + 1;
		while placed ? slot::text loop
			slot := slot + 1;
		end loop;
		placed := placed || jsonb_build_object(slot::text, a.id);
	end loop;

	select coalesce(jsonb_agg(jsonb_build_object(
			'position', k.key::int,
			'id', g.id, 'slug', g.slug, 'name', g.name, 'tagline', g.tagline, 'logo', nullif(g.logo_url, ''), 'colour', g.colour,
			'points', public.org_points(g.id), 'pinned', p.group_id is not null, 'pin_note', p.note,
			'members', (select count(*) from public.org_members m where m.group_id = g.id and m.status = 'active'),
			'duties', (select count(*) from public.org_duties d where d.group_id = g.id and d.status = 'approved' and d.reviewed_at > now() - interval '30 days')
		) order by k.key::int), '[]')
	into result
	from jsonb_each_text(placed) k
	join public.org_groups g on g.id = k.value::uuid
	left join public.org_ranking_pins p on p.group_id = g.id;
	return result;
end;
$$;


-- ───────────────────────────── Reads ─────────────────────────────

-- Approved groups for the directory. p_kind null = every kind.
create function public.org_directory(p_kind text, p_search text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', g.id, 'slug', g.slug, 'kind', g.kind, 'name', g.name, 'tagline', g.tagline,
		'logo', nullif(g.logo_url, ''), 'colour', g.colour, 'recruiting', g.recruiting, 'headquarters', g.headquarters,
		'members', (select count(*) from public.org_members m where m.group_id = g.id and m.status = 'active'),
		'leader', (select public.org_character_name(c) from public.org_members m
			join public.org_ranks r on r.id = m.rank_id join public.characters c on c.id = m.character_id
			where m.group_id = g.id and r.is_leader),
		'balance', (select balance from public.econ_accounts where id = g.account_id),
		'points', case when g.kind = 'agency' then public.org_points(g.id) end
	) order by lower(g.name)), '[]')
	from public.org_groups g
	where g.status = 'approved'
		and (p_kind is null or g.kind = p_kind)
		and (coalesce(btrim(p_search), '') = '' or g.name ilike public.econ_like(p_search));
$$;

-- Everything about one group. Unapproved groups only show to their requester, members and admins.
-- Join requests and pending duties only show to those who can act on them (or logged them).
create function public.org_group(p_slug text, p_actor text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	g public.org_groups;
	pw record;
	acct public.econ_accounts;
	sym text := (select currency_symbol from public.econ_settings);
begin
	select * into g from public.org_groups where slug = p_slug;
	if g.id is null then
		return null;
	end if;
	select * into pw from public.org_powers(g.id, p_actor);
	if g.status <> 'approved' and not (pw.is_member or g.requested_by is not distinct from p_actor or public.econ_is_admin(p_actor)) then
		return null;
	end if;
	select * into acct from public.econ_accounts where id = g.account_id;

	return jsonb_build_object(
		'id', g.id, 'slug', g.slug, 'kind', g.kind, 'name', g.name, 'status', g.status,
		'tagline', g.tagline, 'about', g.about, 'logo_url', g.logo_url, 'banner_url', g.banner_url,
		'colour', g.colour, 'headquarters', g.headquarters, 'discord_url', g.discord_url, 'recruiting', g.recruiting,
		'approved_at', g.approved_at, 'created_at', g.created_at,
		'review_note', case when g.requested_by = p_actor or pw.is_leader then g.review_note end,
		'is_requester', g.requested_by is not distinct from p_actor,
		'me', jsonb_build_object('leader', pw.is_leader, 'manage', pw.can_manage, 'spend', pw.can_spend,
			'edit', pw.can_edit or g.requested_by = p_actor, 'member', pw.is_member, 'admin', public.econ_is_admin(p_actor)),
		'ranks', (select coalesce(jsonb_agg(jsonb_build_object(
				'id', r.id, 'title', r.title, 'sort', r.sort, 'leader', r.is_leader,
				'manage', r.can_manage, 'spend', r.can_spend, 'edit', r.can_edit) order by r.sort, r.title), '[]')
			from public.org_ranks r where r.group_id = g.id),
		'members', (select coalesce(jsonb_agg(jsonb_build_object(
				'id', m.id, 'character', c.id, 'name', public.org_character_name(c),
				'image', nullif(c.approved_sheet -> 'appearance' ->> 'image', ''), 'player', p.display_name,
				'rank', m.rank_id, 'joined_at', m.joined_at, 'mine', p.discord_id = p_actor
			) order by r.sort, m.joined_at), '[]')
			from public.org_members m
			join public.org_ranks r on r.id = m.rank_id
			join public.characters c on c.id = m.character_id
			join public.profiles p on p.id = c.owner_id
			where m.group_id = g.id and m.status = 'active'),
		'requests', (select coalesce(jsonb_agg(jsonb_build_object(
				'id', m.id, 'character', c.id, 'name', public.org_character_name(c),
				'image', nullif(c.approved_sheet -> 'appearance' ->> 'image', ''), 'player', p.display_name,
				'message', m.message, 'created_at', m.created_at, 'mine', p.discord_id = p_actor
			) order by m.created_at), '[]')
			from public.org_members m
			join public.characters c on c.id = m.character_id
			join public.profiles p on p.id = c.owner_id
			where m.group_id = g.id and m.status = 'requested' and (pw.can_manage or p.discord_id = p_actor)),
		'wallet', case when acct.id is not null then jsonb_build_object(
			'account', acct.id, 'balance', acct.balance, 'symbol', sym,
			'history', (select coalesce(jsonb_agg(row order by (row ->> 'at') desc), '[]') from (
				select jsonb_build_object(
					'id', t.id, 'kind', t.kind, 'memo', t.memo, 'at', t.created_at,
					'amount', case when t.to_account = acct.id then t.amount else -t.amount end,
					'other', (select coalesce(public.org_character_name(c), a.name)
						from public.econ_accounts a left join public.characters c on c.id = a.character_id
						where a.id = case when t.to_account = acct.id then t.from_account else t.to_account end)
				) as row
				from public.econ_transactions t
				where t.from_account = acct.id or t.to_account = acct.id
				order by t.created_at desc
				limit 25) h)
		) end,
		'shops', (select coalesce(jsonb_agg(jsonb_build_object(
				'id', s.id, 'name', s.name, 'description', s.description, 'image', s.image_url, 'status', s.status,
				'items', (select count(*) from public.econ_items i where i.shop_id = s.id and i.active)
			) order by s.name), '[]')
			from public.econ_shops s where s.account_id = g.account_id and s.status <> 'denied'),
		'points', case when g.kind = 'agency' then public.org_points(g.id) end,
		'duties', case when g.kind = 'agency' then (select coalesce(jsonb_agg(row order by (row ->> 'at') desc), '[]') from (
				select jsonb_build_object(
					'id', d.id, 'character', public.org_character_name(c), 'tier', t.name, 'summary', d.summary,
					'link', d.link, 'status', d.status, 'points', case when d.status = 'approved' then d.points else t.points end,
					'review_note', case when d.submitted_by = p_actor or pw.can_manage then d.review_note end,
					'mine', d.submitted_by = p_actor, 'at', coalesce(d.reviewed_at, d.created_at)
				) as row
				from public.org_duties d
				join public.org_duty_tiers t on t.id = d.tier_id
				join public.characters c on c.id = d.character_id
				where d.group_id = g.id and (d.status = 'approved' or d.submitted_by = p_actor or pw.can_manage)
				order by coalesce(d.reviewed_at, d.created_at) desc
				limit 30) x) end
	);
end;
$$;

-- The actor's characters and every group they're in or asked to join, plus groups they requested.
create function public.org_mine(p_actor text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select jsonb_build_object(
		'characters', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', public.org_character_name(c)) order by public.org_character_name(c)), '[]')
			from public.characters c join public.profiles p on p.id = c.owner_id
			where p.discord_id = p_actor and c.approved_at is not null and c.status <> 'denied'),
		'memberships', (select coalesce(jsonb_agg(jsonb_build_object(
				'id', m.id, 'status', m.status, 'character', public.org_character_name(c), 'character_id', c.id,
				'group', g.name, 'slug', g.slug, 'kind', g.kind, 'logo', nullif(g.logo_url, ''), 'rank', r.title, 'leader', r.is_leader
			) order by lower(g.name)), '[]')
			from public.org_members m
			join public.org_groups g on g.id = m.group_id
			join public.org_ranks r on r.id = m.rank_id
			join public.characters c on c.id = m.character_id
			join public.profiles p on p.id = c.owner_id
			where p.discord_id = p_actor),
		'requested', (select coalesce(jsonb_agg(jsonb_build_object(
				'id', g.id, 'name', g.name, 'slug', g.slug, 'kind', g.kind, 'status', g.status, 'review_note', g.review_note
			) order by g.created_at desc), '[]')
			from public.org_groups g where g.requested_by = p_actor and g.status <> 'approved')
	);
$$;

create function public.org_tiers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', id, 'name', name, 'points', points, 'description', description, 'sort', sort, 'retired', retired
	) order by sort, name), '[]')
	from public.org_duty_tiers;
$$;

-- What waits on admins: group requests and hero duties.
create function public.org_admin_queue(p_actor text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	perform public.econ_require_admin(p_actor);
	return jsonb_build_object(
		'groups', (select coalesce(jsonb_agg(jsonb_build_object(
				'id', g.id, 'slug', g.slug, 'kind', g.kind, 'name', g.name, 'tagline', g.tagline, 'about', g.about,
				'logo_url', g.logo_url, 'banner_url', g.banner_url, 'headquarters', g.headquarters, 'submitted_at', g.submitted_at,
				'requester', (select display_name from public.profiles where discord_id = g.requested_by),
				'leader', (select public.org_character_name(c) from public.org_members m
					join public.org_ranks r on r.id = m.rank_id join public.characters c on c.id = m.character_id
					where m.group_id = g.id and r.is_leader)
			) order by g.submitted_at), '[]')
			from public.org_groups g where g.status = 'pending'),
		'duties', (select coalesce(jsonb_agg(jsonb_build_object(
				'id', d.id, 'group', g.name, 'slug', g.slug, 'character', public.org_character_name(c),
				'player', (select display_name from public.profiles where discord_id = d.submitted_by),
				'tier', t.name, 'points', t.points, 'summary', d.summary, 'details', d.details, 'link', d.link, 'at', d.created_at
			) order by d.created_at), '[]')
			from public.org_duties d
			join public.org_groups g on g.id = d.group_id
			join public.org_duty_tiers t on t.id = d.tier_id
			join public.characters c on c.id = d.character_id
			where d.status = 'pending')
	);
end;
$$;


-- ───────────────────────────── Site wrappers (logged-in player) ─────────────────────────────

create function public.orgs_directory(p_kind text, p_search text) returns jsonb
language sql stable security definer set search_path = ''
as $$ select public.org_directory(p_kind, p_search); $$;

create function public.orgs_group(p_slug text) returns jsonb
language sql stable security definer set search_path = ''
as $$ select public.org_group(p_slug, public.orgs_viewer()); $$;

create function public.orgs_ranking() returns jsonb
language sql stable security definer set search_path = ''
as $$ select public.org_ranking(); $$;

create function public.orgs_tiers() returns jsonb
language sql stable security definer set search_path = ''
as $$ select public.org_tiers(); $$;

create function public.orgs_mine() returns jsonb
language sql stable security definer set search_path = ''
as $$ select public.org_mine(public.portal_discord_id()); $$;

create function public.orgs_admin_queue() returns jsonb
language sql stable security definer set search_path = ''
as $$ select public.org_admin_queue(public.portal_discord_id()); $$;

create function public.orgs_request(p_kind text, p_leader uuid, p_fields jsonb) returns uuid
language sql security definer set search_path = ''
as $$ select public.org_request(p_kind, p_leader, p_fields, public.portal_discord_id()); $$;

create function public.orgs_update(p_group uuid, p_fields jsonb) returns void
language sql security definer set search_path = ''
as $$ select public.org_update(p_group, p_fields, public.portal_discord_id()); $$;

create function public.orgs_resubmit(p_group uuid) returns void
language sql security definer set search_path = ''
as $$ select public.org_resubmit(p_group, public.portal_discord_id()); $$;

create function public.orgs_review(p_group uuid, p_outcome text, p_note text) returns void
language sql security definer set search_path = ''
as $$ select public.org_review(p_group, p_outcome, p_note, public.portal_discord_id()); $$;

create function public.orgs_delete(p_group uuid) returns void
language sql security definer set search_path = ''
as $$ select public.org_delete(p_group, public.portal_discord_id()); $$;

create function public.orgs_save_rank(p_group uuid, p_rank uuid, p_title text, p_sort int, p_manage boolean, p_spend boolean, p_edit boolean) returns uuid
language sql security definer set search_path = ''
as $$ select public.org_save_rank(p_group, p_rank, p_title, p_sort, p_manage, p_spend, p_edit, public.portal_discord_id()); $$;

create function public.orgs_delete_rank(p_rank uuid) returns void
language sql security definer set search_path = ''
as $$ select public.org_delete_rank(p_rank, public.portal_discord_id()); $$;

create function public.orgs_ask_join(p_group uuid, p_character uuid, p_message text) returns uuid
language sql security definer set search_path = ''
as $$ select public.org_ask_join(p_group, p_character, p_message, public.portal_discord_id()); $$;

create function public.orgs_respond_join(p_member uuid, p_accept boolean, p_rank uuid) returns void
language sql security definer set search_path = ''
as $$ select public.org_respond_join(p_member, p_accept, p_rank, public.portal_discord_id()); $$;

create function public.orgs_set_rank(p_member uuid, p_rank uuid) returns void
language sql security definer set search_path = ''
as $$ select public.org_set_rank(p_member, p_rank, public.portal_discord_id()); $$;

create function public.orgs_remove_member(p_member uuid) returns void
language sql security definer set search_path = ''
as $$ select public.org_remove_member(p_member, public.portal_discord_id()); $$;

create function public.orgs_transfer_leader(p_group uuid, p_member uuid) returns void
language sql security definer set search_path = ''
as $$ select public.org_transfer_leader(p_group, p_member, public.portal_discord_id()); $$;

create function public.orgs_log_duty(p_group uuid, p_character uuid, p_tier uuid, p_summary text, p_details text, p_link text) returns uuid
language sql security definer set search_path = ''
as $$ select public.org_log_duty(p_group, p_character, p_tier, p_summary, p_details, p_link, public.portal_discord_id()); $$;

create function public.orgs_withdraw_duty(p_duty uuid) returns void
language sql security definer set search_path = ''
as $$ select public.org_withdraw_duty(p_duty, public.portal_discord_id()); $$;

create function public.orgs_review_duty(p_duty uuid, p_approve boolean, p_note text) returns void
language sql security definer set search_path = ''
as $$ select public.org_review_duty(p_duty, p_approve, p_note, public.portal_discord_id()); $$;

create function public.orgs_award(p_group uuid, p_points int, p_reason text) returns void
language sql security definer set search_path = ''
as $$ select public.org_award(p_group, p_points, p_reason, public.portal_discord_id()); $$;

create function public.orgs_pin(p_group uuid, p_position int, p_note text) returns void
language sql security definer set search_path = ''
as $$ select public.org_pin(p_group, p_position, p_note, public.portal_discord_id()); $$;

create function public.orgs_save_tier(p_tier uuid, p_name text, p_points int, p_description text, p_sort int, p_retired boolean) returns uuid
language sql security definer set search_path = ''
as $$ select public.org_save_tier(p_tier, p_name, p_points, p_description, p_sort, p_retired, public.portal_discord_id()); $$;


-- ───────────────────────────── Who can call what ─────────────────────────────

do $$
declare
	fn text;
begin
	-- org_* take a Discord ID on trust, so only the bot (service role) may call them.
	for fn in
		select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and (p.proname like 'org\_%' or p.proname = 'guard_group_wallet')
	loop
		execute format('revoke execute on function %s from public, anon, authenticated', fn);
		execute format('grant execute on function %s to service_role', fn);
	end loop;
	-- Reads work logged out; everything else needs a login (portal_discord_id checks it).
	for fn in
		select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname like 'orgs\_%'
	loop
		execute format('revoke execute on function %s from public, anon', fn);
		execute format('grant execute on function %s to authenticated, service_role', fn);
	end loop;
	foreach fn in array array['orgs_directory(text,text)', 'orgs_group(text)', 'orgs_ranking()', 'orgs_tiers()'] loop
		execute format('grant execute on function public.%s to anon', fn);
	end loop;
end;
$$;
