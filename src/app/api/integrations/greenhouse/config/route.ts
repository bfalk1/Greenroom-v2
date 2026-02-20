import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GreenhouseClient } from '@/lib/greenhouse';

// GET /api/integrations/greenhouse/config - Get current config (masked)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = authHeader.substring(7);
    
    // Validate API key against company's stored key
    const company = await prisma.company.findFirst({
      where: { apiKey },
      include: { greenhouseConfig: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    if (!company.greenhouseConfig) {
      return NextResponse.json({ 
        configured: false,
        message: 'Greenhouse integration not configured' 
      });
    }

    return NextResponse.json({
      configured: true,
      apiKeyMasked: company.greenhouseConfig.apiKey.slice(0, 8) + '...',
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/greenhouse/webhook`,
      syncEnabled: company.greenhouseConfig.syncEnabled,
      lastSyncAt: company.greenhouseConfig.lastSyncAt,
    });
  } catch (error) {
    console.error('Greenhouse config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/integrations/greenhouse/config - Save/update config
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const companyApiKey = authHeader.substring(7);
    
    const company = await prisma.company.findFirst({
      where: { apiKey: companyApiKey },
    });

    if (!company) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const body = await request.json();
    const { greenhouseApiKey, onBehalfOfId, syncEnabled } = body;

    if (!greenhouseApiKey) {
      return NextResponse.json({ error: 'greenhouseApiKey is required' }, { status: 400 });
    }

    // Test the Greenhouse API key
    const testClient = new GreenhouseClient({ 
      apiKey: greenhouseApiKey,
      onBehalfOf: onBehalfOfId,
    });
    
    const isValid = await testClient.testConnection();
    if (!isValid) {
      return NextResponse.json({ 
        error: 'Invalid Greenhouse API key - connection test failed' 
      }, { status: 400 });
    }

    // Upsert the config
    const config = await prisma.greenhouseConfig.upsert({
      where: { companyId: company.id },
      update: {
        apiKey: greenhouseApiKey,
        onBehalfOfId: onBehalfOfId || null,
        syncEnabled: syncEnabled ?? true,
      },
      create: {
        companyId: company.id,
        apiKey: greenhouseApiKey,
        onBehalfOfId: onBehalfOfId || null,
        syncEnabled: syncEnabled ?? true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Greenhouse integration configured successfully',
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/greenhouse/webhook`,
    });
  } catch (error) {
    console.error('Greenhouse config save error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/integrations/greenhouse/config - Remove config
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = authHeader.substring(7);
    
    const company = await prisma.company.findFirst({
      where: { apiKey },
    });

    if (!company) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    await prisma.greenhouseConfig.delete({
      where: { companyId: company.id },
    });

    return NextResponse.json({ success: true, message: 'Greenhouse integration removed' });
  } catch (error) {
    console.error('Greenhouse config delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
