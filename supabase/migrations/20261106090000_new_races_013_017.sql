-- New races RACE-013 to RACE-017 (owner request, 6 November 2026): the NPC rankings learn their
-- recommended levels and difficulty points. Upserts only (scripts/ranking_tables_sql.py --points-only).

-- ranking_race_points data: each race's difficulty base points (src/data/ranking_points.csv) and recommended level
insert into public.ranking_race_points (race_id, recommended_level, points) values
  ('RACE-001', 4, 100),
  ('RACE-002', 6, 100),
  ('RACE-003', 8, 100),
  ('RACE-004', 11, 125),
  ('RACE-005', 14, 125),
  ('RACE-006', 18, 125),
  ('RACE-007', 21, 160),
  ('RACE-008', 25, 160),
  ('RACE-009', 28, 200),
  ('RACE-010', 31, 200),
  ('RACE-011', 40, 250),
  ('RACE-012', 50, 250),
  ('RACE-013', 34, 200),
  ('RACE-014', 37, 200),
  ('RACE-015', 43, 250),
  ('RACE-016', 45, 250),
  ('RACE-017', 47, 250)
on conflict on constraint ranking_race_points_pkey do update set recommended_level = excluded.recommended_level, points = excluded.points;

-- ranking_position_percent data (src/data/ranking_points.csv)
insert into public.ranking_position_percent (position, percent) values
  (1, 100),
  (2, 85),
  (3, 75),
  (4, 70),
  (5, 65),
  (6, 60),
  (7, 56),
  (8, 52),
  (9, 48),
  (10, 45),
  (11, 43),
  (12, 40),
  (13, 37),
  (14, 34),
  (15, 31),
  (16, 28),
  (17, 25),
  (18, 22),
  (19, 19),
  (20, 16),
  (21, 12),
  (22, 12),
  (23, 12),
  (24, 12),
  (25, 12),
  (26, 8),
  (27, 8),
  (28, 8),
  (29, 8),
  (30, 8)
on conflict on constraint ranking_position_percent_pkey do update set percent = excluded.percent;
