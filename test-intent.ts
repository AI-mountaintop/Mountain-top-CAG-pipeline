import { classifyIntent } from './src/lib/llm/intent-classifier';

async function testVagueQuery() {
    const question = 'Tell me about my recent tasks';
    console.log('Testing question:', question);

    try {
        const intentResult = await classifyIntent(question, []);
        console.log('Intent Result:', JSON.stringify(intentResult, null, 2));

        const normalizedIntent = (intentResult.intent || '').toUpperCase();
        const lowercaseQuestion = question.toLowerCase();
        const isVagueTerm = (lowercaseQuestion.includes('recent') || lowercaseQuestion.includes('latest') || lowercaseQuestion.includes('summary')) && !lowercaseQuestion.match(/\d/);

        console.log('Normalized Intent:', normalizedIntent);
        console.log('Is Vague Term (Manual):', isVagueTerm);
        console.log('Is Vague (LLM):', intentResult.is_vague);

        if (normalizedIntent === 'CLARIFICATION_REQUIRED' || intentResult.is_vague === true || isVagueTerm) {
            console.log('SUCCESS: Clarification Gate Triggered!');
        } else {
            console.log('FAILURE: Clarification Gate Bypassed!');
        }
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Mocking environment variables if needed
// process.env.OPENAI_API_KEY = '...';

testVagueQuery();
