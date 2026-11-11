-- Her photo, stored small (about 192px) right on the shop row so it loads instantly.
alter table shop add column if not exists avatar text;
