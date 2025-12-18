// Test Trello Webhook Registration
const TRELLO_API_KEY = 'YOUR_TRELLO_API_KEY';
const TRELLO_API_TOKEN = 'YOUR_TRELLO_API_TOKEN';
const CALLBACK_URL = 'https://6e8cdfd09490.ngrok-free.app/api/webhooks/trello';

// Get board ID from Supabase
async function testWebhookCreation() {
    const boardId = '678217b8d8bdd58cbb03d0ea'; // Replace with actual Trello board ID

    const url = `https://api.trello.com/1/webhooks?key=${TRELLO_API_KEY}&token=${TRELLO_API_TOKEN}`;

    const body = {
        description: `Trello Intelligence Webhook Test`,
        callbackURL: CALLBACK_URL,
        idModel: boardId,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Webhook creation failed:', response.status, response.statusText);
            console.error('Error details:', JSON.stringify(data, null, 2));
        } else {
            console.log('✅ Webhook created successfully!');
            console.log('Webhook ID:', data.id);
            console.log('Callback URL:', data.callbackURL);
            console.log('Board ID:', data.idModel);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testWebhookCreation();
