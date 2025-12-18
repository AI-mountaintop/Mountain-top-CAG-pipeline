import { NextRequest, NextResponse } from 'next/server';
import { trelloClient } from '@/lib/trello/client';
import { handleWebhookEvent } from '@/lib/trello/webhook-handler';

const WEBHOOK_CALLBACK_URL = process.env.TRELLO_WEBHOOK_CALLBACK_URL!;

/**
 * HEAD request for webhook verification
 * Trello sends a HEAD request to verify the callback URL
 */
export async function HEAD(request: NextRequest) {
    return new NextResponse(null, { status: 200 });
}

/**
 * POST request for webhook events
 * Trello sends card/list updates here
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.text();
        const payload = JSON.parse(body);

        // Verify webhook signature
        const signature = request.headers.get('x-trello-webhook') || '';

        if (!trelloClient.verifyWebhookSignature(body, signature, WEBHOOK_CALLBACK_URL)) {
            console.error('Invalid webhook signature');
            return NextResponse.json(
                { error: 'Invalid signature' },
                { status: 401 }
            );
        }

        // Process webhook event asynchronously
        // We return 200 immediately to prevent Trello from timing out
        handleWebhookEvent(payload).catch((error) => {
            console.error('Async webhook processing error:', error);
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error('Webhook handler error:', error);

        // Always return 200 to prevent Trello from deactivating the webhook
        return NextResponse.json(
            { success: true, error: 'Internal error but acknowledged' },
            { status: 200 }
        );
    }
}
