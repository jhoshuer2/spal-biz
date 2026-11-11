-- Theme is chosen in Profile and follows the shop across devices.
alter table shop add column if not exists theme text not null default 'auto' check (theme in ('light','dark','auto'));
