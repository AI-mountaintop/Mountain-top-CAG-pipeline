-- PostgreSQL function for safe query execution (INSTRUMENTED)
-- This version returns the query text on error for easier debugging

CREATE OR REPLACE FUNCTION execute_safe_query(query_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Execute the query and return results as JSON array
  -- Using AS _sq for subquery alias to avoid conflicts with t
  EXECUTE format('SELECT COALESCE(json_agg(_sq), ''[]''::json) FROM (%s) AS _sq', query_text) INTO result;
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    -- Return error AND the query text for debugging
    RETURN json_build_object(
        'error', SQLERRM,
        'detail', SQLSTATE,
        'query_attempted', query_text
    );
END;
$$;
