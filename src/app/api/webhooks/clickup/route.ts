import { NextRequest, NextResponse } from 'next/server';
import { clickupClient } from '@/lib/clickup/client';
import { handleWebhookEvent } from '@/lib/clickup/webhook-handler';

const WEBHOOK_CALLBACK_URL = process.env.CLICKUP_WEBHOOK_CALLBACK_URL!;

/**
 * POST request for webhook events
 * ClickUp sends task/comment updates here
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.text();
        const payload = JSON.parse(body);

        // Verify webhook signature
        const signature = request.headers.get('x-signature') || '';

        if (!clickupClient.verifyWebhookSignature(body, signature)) {
            console.error('Invalid webhook signature');
            return NextResponse.json(
                { error: 'Invalid signature' },
                { status: 401 }
            );
        }

        // Process webhook event asynchronously
        // We return 200 immediately to prevent ClickUp from timing out
        handleWebhookEvent(payload).catch((error) => {
            console.error('Async webhook processing error:', error);
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error('Webhook handler error:', error);

        // Always return 200 to prevent ClickUp from deactivating the webhook
        return NextResponse.json(
            { success: true, error: 'Internal error but acknowledged' },
            { status: 200 }
        );
    }
}
