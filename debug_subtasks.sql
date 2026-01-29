-- Diagnostic: Check subtask counts
SELECT 
    t.name as task_name,
    t.clickup_task_id,
    count(s.id) as subtask_count,
    json_agg(s.name) as subtask_names
FROM "tasks_CAG_custom" t
LEFT JOIN "tasks_CAG_custom" s ON t.clickup_task_id = s.parent_task_id
GROUP BY t.id, t.name, t.clickup_task_id
HAVING count(s.id) > 0
ORDER BY subtask_count DESC;
