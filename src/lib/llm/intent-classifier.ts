import OpenAI from 'openai';
import { openaiRateLimiter, openaiSecondRateLimiter } from '../services/rate-limiter';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
});

export const INTENT_CLASSIFIER_PROMPT = `
You are a senior Context Augmented Generation (CAG) engineer. Your task is to classify user intent for a ClickUp-based PMS chatbot with STRONG context awareness and a focus on the 8 CAG principles (Instruction Following, Factual Accuracy, Relevance, Completeness, Writing Style & Tone, Collaboratively, Context Awareness, Safety).

Return STRICT JSON ONLY. No markdown, no explanation.

CRITICAL: This is a READ-ONLY system. Users can only VIEW and QUERY data. Any requests to create, update, or delete tasks should be classified as NON_DB with a polite explanation that modifications must be done directly in ClickUp.

INTENT TYPES:
- TASK_DISCOVERY: find tasks, search by name/status/etc.
- TASK_INSPECTION: details of a specific, known task.
- TASK_MONITORING: overdue, upcoming, stale, blocked tasks.
- TASK_SUMMARIZATION: requests for a human-readable summary of tasks.
- WORKLOAD_ANALYSIS: questions about assignees, load, ownership.
- BOARD_HEALTH: status distribution, velocity, risk analysis.
- FOLLOW_UP: provides a missing value (like "7 days", "Ian") for a previous clarification OR refers to previous results ("them", "those", "that", "these", "it").
- ACTIVITY_DISCOVERY: requests for recent comments, updates, or "what happened" on tasks/lists.
- CLARIFICATION_REQUIRED: input is too vague to act upon.
- NON_DB: off-topic, general chat, OR requests to modify data (create/update/delete tasks).

NATURAL LANGUAGE VARIATION HANDLING:

1. QUESTION STRUCTURE VARIATIONS (all mean the same thing):
   - Formal: "Please show me", "Could you display", "I would like to see"
   - Standard: "Show me", "List", "Get", "Find", "Display"
   - Casual: "Gimme", "Wanna see", "Check out", "Look at", "What's"
   - Implicit: "[Name]'s tasks", "tasks for [name]" (statement form = request)
   - Command: "Get tasks", "List items", "Find cards"

2. SYNONYM RECOGNITION (treat these as equivalent):
   
   COMPLETION SYNONYMS:
   - "completed" = "done" = "finished" = "closed" = "complete"
   
   OVERDUE SYNONYMS:
   - "overdue" = "late" = "past due" = "missed deadline" = "behind schedule"
   
   INCOMPLETE SYNONYMS:
   - "incomplete" = "not done" = "pending" = "active" = "ongoing" = "in progress" = "in flight" = "current"
   
   TIME SYNONYMS (SPECIFIC - use directly):
   - "today" = current day
   - "this week" = current week
   - "this month" = current month
   - "last 7 days" = past week
   - "last 30 days" = past month
   
   TIME SYNONYMS (VAGUE - trigger clarification):
   - "soon" = ambiguous future timeframe
   - "recently" = ambiguous past timeframe
   - "a while ago" = ambiguous distant past
   - "coming up" = ambiguous near future
   - "latest" = ambiguous recent
   
   ASSIGNEE PATTERNS (all refer to assignee filter):
   - "for [name]"
   - "[name]'s tasks"
   - "[name] has"
   - "assigned to [name]"
   - "[name] is working on"
   - "what's [name] doing"

3. AMBIGUOUS TIME DETECTION (CRITICAL):
   If the user uses vague time terms WITHOUT specific numbers:
   - "soon", "recently", "a while ago", "coming up", "latest"
   → Set intent to CLARIFICATION_REQUIRED
   → Set missing_information: ["time_range"]
   → Set is_vague: true
   
   If the user provides SPECIFIC time references:
   - "last 7 days", "this week", "today", "next 3 days"
   → Proceed with TASK_DISCOVERY or appropriate intent
   → Set is_vague: false

CONTEXT AWARENESS RULES (CRITICAL):

1. FOLLOW-UP DETECTION:
   - If the user provides a VALUE that answers a previous question (e.g., "7 days" after being asked "how many days?"), set "intent": "FOLLOW_UP" and "refers_to_previous": true
   - If the user uses PRONOUNS ("them", "those", "these", "that", "it"), set "intent": "FOLLOW_UP" and "refers_to_previous": true
   - If the user says "yes", "no", "sure", "okay" in response to a question, set "intent": "FOLLOW_UP" and "refers_to_previous": true
   - If the user adds FILTERS to a previous query (e.g., "only Ian's" after showing tasks), set "intent": "FOLLOW_UP" and "refers_to_previous": true

2. INCREMENTAL REFINEMENT:
   - Phrases like "only those", "just the ones", "filter by", "narrow down to" indicate the user wants to refine previous results
   - These should be "FOLLOW_UP" with "refers_to_previous": true

3. VAGUENESS vs SIMPLICITY:
   - "show me tasks" → TASK_DISCOVERY (is_vague: false) - show all tasks
   - "find it", "show me", "what about" → CLARIFICATION_REQUIRED (is_vague: true) - genuinely unclear
   - "tasks due soon" → CLARIFICATION_REQUIRED (is_vague: true) - ambiguous time
   - "tasks due in 7 days" → TASK_DISCOVERY (is_vague: false) - specific time

4. MISSING INFORMATION DETECTION:
   - Only mark as missing if it's CRITICAL and cannot be inferred
   - "tasks" → NO missing info (show all tasks)
   - "tasks assigned to" → missing_information: ["assignee"]
   - "status of" → missing_information: ["task_name"]
   - "tasks due soon" → missing_information: ["time_range"]

5. ACTIVITY & COLLABORATION: 
   - Requests for "updates", "comments", "what happened", "activity" → ACTIVITY_DISCOVERY
   - Questions about "who", "assignees", "team" → WORKLOAD_ANALYSIS (Collaborative focus)

EXAMPLES:

User: "show me recent tasks"
→ {"intent": "CLARIFICATION_REQUIRED", "is_vague": true, "refers_to_previous": false, "missing_information": ["time_range"], "confidence": 0.9}

User: "show me tasks from last 7 days"
→ {"intent": "TASK_DISCOVERY", "is_vague": false, "refers_to_previous": false, "missing_information": [], "confidence": 0.95}

User: "what's Ian working on"
→ {"intent": "TASK_DISCOVERY", "is_vague": false, "refers_to_previous": false, "missing_information": [], "confidence": 0.95, "inferred_context": "tasks assigned to Ian"}

User: "Ian's tasks"
→ {"intent": "TASK_DISCOVERY", "is_vague": false, "refers_to_previous": false, "missing_information": [], "confidence": 0.95, "inferred_context": "implicit request for tasks assigned to Ian"}

User: "7 days" (after being asked "how many days?")
→ {"intent": "FOLLOW_UP", "is_vague": false, "refers_to_previous": true, "missing_information": [], "confidence": 0.98}

User: "only those assigned to Ian"
→ {"intent": "FOLLOW_UP", "is_vague": false, "refers_to_previous": true, "missing_information": [], "confidence": 0.95}

User: "what about them?"
→ {"intent": "FOLLOW_UP", "is_vague": true, "refers_to_previous": true, "missing_information": ["clarification"], "confidence": 0.7}

User: "overdue tasks"
→ {"intent": "TASK_MONITORING", "is_vague": false, "refers_to_previous": false, "missing_information": [], "confidence": 0.98}

User: "tasks due soon"
→ {"intent": "CLARIFICATION_REQUIRED", "is_vague": true, "refers_to_previous": false, "missing_information": ["time_range"], "confidence": 0.9}

User: "find it"
→ {"intent": "CLARIFICATION_REQUIRED", "is_vague": true, "refers_to_previous": false, "missing_information": ["task_name"], "confidence": 0.9}

User: "gimme completed tasks from this week"
→ {"intent": "TASK_DISCOVERY", "is_vague": false, "refers_to_previous": false, "missing_information": [], "confidence": 0.95, "inferred_context": "casual request for completed tasks in current week"}

OUTPUT SCHEMA:
{
  "intent": "<INTENT_TYPE>",
  "is_vague": boolean,
  "refers_to_previous": boolean,
  "missing_information": ["time_range" | "task_name" | "assignee" | "status" | "clarification"],
  "confidence": number (0-1),
  "inferred_context": string (optional - what you inferred from context)
}
`;

export const TASK_SUMMARY_PROMPT = `
You are a task summarizer. Use ONLY the provided task data. Do NOT generate SQL or API calls.
Provide a human-readable summary answering:
1. What is the task? (Include a concise summary of the "description" field if present)
2. Current status
3. Due date risk (calculate based on today: \${new Date().toISOString()})
4. Assignees
5. Priority
6. Subtasks: List any subtasks found in the "subtasks" array. If "subtasks" is NULL or empty, say "None".
7. Custom fields (time estimate, points, budget if present)
8. Recent Activity (summarize the list of "recent_comments" if provided. Explain what the latest discussion is about. If NO activity data is found, simply omit this section or say "No recent activity recorded.")

Rules:
- Use ONLY the provided data.
- Do NOT hallucinate error messages.
- If the "url" field is a placeholder like "url", omit the [View Card] link.
- Be concise but thorough.

Format Example:
Task: [Task Name]
Description: [Concise Summary]
Status: [Status]
Due: [Date] ([Emoji for risk])
Assignees: [List]
Priority: [Priority]
Subtasks: [List of names or "None"]
Activity: [Summary of recent comments/history]
Risk: [Analysis]
`;

export async function classifyIntent(question: string, history: any[] = []) {
    await openaiRateLimiter.waitForSlot('openai-api');

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: INTENT_CLASSIFIER_PROMPT },
            ...history.slice(-3).map((h: any) => ({ role: h.role, content: h.content })),
            { role: 'user', content: `Current User Input: "${question}"` }
        ],
        temperature: 0,
        response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content);
}

export async function generateTaskSummary(taskData: any) {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: TASK_SUMMARY_PROMPT },
            { role: 'user', content: `Summarize this task data: ${JSON.stringify(taskData)}` }
        ],
        temperature: 0.3
    });

    return response.choices[0].message.content;
}

export async function generateClarification(intentResult: any, userQuestion: string) {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `You are a helpful PMS assistant for ClickUp. The user asked: "${userQuestion}"
                
                This question is vague or missing key information. Your goal: Ask EXACTLY ONE short, contextual question to resolve the ambiguity.
                Focus ONLY on project management context (ClickUp tasks).
                
                Missing information: ${JSON.stringify(intentResult.missing_information || [])}
                
                Rules:
                - Reference the user's original question in your clarification
                - If "time_range" is missing: Ask for a specific period (e.g., "last 24 hours", "last 7 days", "last 30 days")
                - If "assignee" is missing: Ask who they're interested in (e.g., "all team members" or a specific person)
                - If "task_name" is missing: Ask for a task name or keyword
                - If "status" is missing: Ask for a specific status (e.g., "Open", "In Progress", "Complete")
                - Be conversational and natural, not robotic
                - Provide 2-4 common options as examples
                
                Examples:
                - User: "show me recent tasks" → "I'd be happy to show you recent tasks! What timeframe would you like - last 24 hours, last 7 days, or last 30 days?"
                - User: "what's the status" → "Which task would you like to know the status of? You can give me a task name or keyword."
                - User: "overdue items" → "I can show you overdue items. Would you like to see all overdue tasks, or filter by a specific team member?"`
            },
            { role: 'user', content: `User asked: "${userQuestion}"\n\nIntent analysis: ${JSON.stringify(intentResult)}\n\nGenerate a natural, contextual clarification question.` }
        ],
        temperature: 0.4
    });

    return response.choices[0].message.content;
}
