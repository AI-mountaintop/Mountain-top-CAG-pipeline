-- Check all tasks assigned to Ian across all lists
SELECT 
    t.name,
    t.url,
    t.clickup_task_id,
    t.assignees,
    l.name as list_name,
    l.folder_id,
    l.folder_name
FROM "tasks_CAG_custom" t
JOIN "lists_CAG_custom" l ON t.list_id = l.id
WHERE EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(t.assignees) AS a 
    WHERE a->>'username' ILIKE '%ian%' OR a->>'email' ILIKE '%ian%'
)
ORDER BY t.name;
