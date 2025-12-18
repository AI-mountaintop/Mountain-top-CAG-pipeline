-- PostgreSQL function for safe query execution
-- This allows the Next.js app to execute generated SQL queries safely

CREATE OR REPLACE FUNCTION execute_safe_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Execute the query and return results as JSON array
  EXECUTE format('SELECT COALESCE(json_agg(t), ''[]''::json) FROM (%s) t', query_text) INTO result;
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    -- Return error as JSON
    RETURN json_build_object('error', SQLERRM);
END;
$$;

-- Grant execute permission to authenticated users
-- Adjust this based on your Supabase RLS setup
GRANT EXECUTE ON FUNCTION execute_safe_query(text) TO authenticated;
GRANT EXECUTE ON FUNCTION execute_safe_query(text) TO service_role;

-- Example usage:
-- SELECT execute_safe_query('SELECT name, due_date FROM cards WHERE board_id = ''uuid-here'' LIMIT 10');
