"""Prints the data part of a ranking NPC migration (owner tables, 5 November 2026).

Reads src/data/ranking_npcs.csv, src/data/ranking_points.csv and the races' recommended levels, and
prints SQL that replaces the rows of ranking_npcs, ranking_race_points and ranking_position_percent.
After editing either table: python3 scripts/ranking_tables_sql.py >> supabase/migrations/<new>.sql
(src/data/rankingNpcs.test.ts checks the latest migration matches the tables).
"""
import csv,re,sys
import os
R=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '')
npcs=[r for r in csv.reader(l for l in open(R+'src/data/ranking_npcs.csv') if not l.startswith('#'))][1:]
pts=[r for r in csv.reader(l for l in open(R+'src/data/ranking_points.csv') if l.strip() and not l.startswith('#'))][1:]
rec={m.group(1):int(m.group(2)) for m in re.finditer(r"id: '(RACE-\d+)'.*?recommendedLevel: (\d+)",open(R+'src/domain/races/races.ts').read())}
q=lambda s:"'"+s.replace("'","''")+"'"
out=[]
out.append('-- ranking_npcs data (from src/data/ranking_npcs.csv; checked by src/data/rankingNpcs.test.ts)')
out.append('delete from public.ranking_npcs;')
out.append('insert into public.ranking_npcs (id, name, country, sex, level, xp, strength, races_per_week, list_order) values')
out.append(',\n'.join(f"  ({q(a)}, {q(b)}, {q(c)}, {q(d)}, {e}, {f}, {g}, {h}, {i})" for i,(a,b,c,d,e,f,g,h) in enumerate(npcs,1))+';')
out.append('')
out.append('-- ranking_race_points data (from src/data/ranking_points.csv and the races\' recommended levels)')
out.append('delete from public.ranking_race_points;')
out.append('insert into public.ranking_race_points (race_id, recommended_level, points) values')
out.append(',\n'.join(f"  ({q(k)}, {rec[k]}, {v})" for kind,k,v in pts if kind=='race')+';')
out.append('delete from public.ranking_position_percent;')
out.append('insert into public.ranking_position_percent (position, percent) values')
out.append(',\n'.join(f"  ({k}, {v})" for kind,k,v in pts if kind=='position')+';')
print('\n'.join(out))
