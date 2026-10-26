-- Free-form planning tag: a single preset color per employee, shown on the
-- org chart node. Not tied to any HR meaning (status, grade, etc.) — purely
-- a visual marker for whoever's using the chart to plan restructuring, hiring
-- freezes, succession moves, etc. One color per person, visible to everyone.
alter table employees add column if not exists tag_color text;
